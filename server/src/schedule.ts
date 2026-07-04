import { Router } from "express";
import { requireAuth, type AuthedRequest } from "./auth.js";
import { countScheduleEvents, activeTeamId,
  addScheduleEvent, deleteScheduleEvent, getSquad, getTeamSnapToken, kvGet, kvSet,
  replaceScheduleEvents, saveSquad, setTeamSnapToken, upcomingEvents, type ScheduleEvent,
} from "./store.js";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./secret.js";

// ============================================================================
// Schedule pipeline. Priority order of sources:
//   1. ICS calendar feeds — the universal path. TeamSnap, SportsEngine,
//      GotSport, Demosphere, and Playmetrics all export calendar links.
//   2. TeamSnap OAuth (deeper: events + eventually availability) — optional,
//      behind TEAMSNAP_CLIENT_ID/SECRET.
//   3. Manual entry — always available.
// ============================================================================

// ---------------- ICS parsing ----------------

// Unfold ICS folded lines (CRLF + space/tab continuation), then split events.
export function parseIcs(text: string): { start: string; title: string; location: string }[] {
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const out: { start: string; title: string; location: string }[] = [];
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    const body = block.split("END:VEVENT")[0];
    const get = (prop: string) => {
      const m = new RegExp(`^${prop}[^:\\n]*:(.*)$`, "mi").exec(body);
      return m ? m[1].trim().replace(/\\,/g, ",").replace(/\\n/g, " ") : "";
    };
    const rawStart = get("DTSTART");
    if (!rawStart) continue;
    // Formats: 20260705T140000Z | 20260705T140000 | 20260705
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(rawStart);
    if (!m) continue;
    const [, y, mo, d, hh, mm, ss, z] = m;
    const iso = hh
      ? z
        ? new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss ?? "00"}Z`).toISOString()
        : `${y}-${mo}-${d}T${hh}:${mm}:${ss ?? "00"}` // floating local time — keep as-is
      : `${y}-${mo}-${d}T12:00:00`;
    out.push({ start: iso.slice(0, 19).replace("T", " "), title: get("SUMMARY") || "Event", location: get("LOCATION") });
  }
  return out;
}

// Classify an event title as game/practice and pull the opponent name out.
export function classifyEvent(title: string): { kind: ScheduleEvent["kind"]; opponent: string } {
  const t = title.toLowerCase();
  if (/practice|training|session|scrimmage(?! vs)/.test(t)) return { kind: "practice", opponent: "" };
  const vs = /(?:\bvs\.?\s+|\bversus\s+|@\s*)(.+?)(?:\s*[([-]|$)/i.exec(title);
  if (vs) return { kind: "game", opponent: vs[1].trim() };
  if (/game|match|league|tournament|cup|friendly/.test(t)) return { kind: "game", opponent: "" };
  return { kind: "other", opponent: "" };
}

// Basic SSRF guard: https only, no obviously-internal hosts (IPv4 private
// ranges, IPv6 literals, .local/.internal names). Not a full DNS-rebinding
// defense, but closes every straightforward internal-fetch path.
function safeCalendarUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.replace(/^webcal:/i, "https:"));
    if (u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.includes(":") || h.startsWith("[")) return null; // IPv6 literals incl. ::1
    if (/^127\.|^0\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null;
    if (!h.includes(".") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return null;
    return u;
  } catch {
    return null;
  }
}

export async function syncIcs(userId: number): Promise<{ imported: number } | { error: string }> {
  const squad = getSquad(userId);
  if (!squad?.icsUrl) return { error: "No calendar link saved — add it in My Team." };
  const url = safeCalendarUrl(squad.icsUrl);
  if (!url) return { error: "Calendar link must be a public https:// or webcal:// URL." };
  try {
    const res = await fetch(url, { headers: { "User-Agent": "TactIQ/1.0 calendar-sync" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { error: `Calendar server answered ${res.status} — check the link.` };
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) return { error: "That link doesn't return a calendar file (.ics)." };
    const events = parseIcs(text).map((e) => {
      const c = classifyEvent(e.title);
      return { start: e.start, title: e.title, kind: c.kind, opponent: c.opponent, location: e.location };
    });
    const imported = replaceScheduleEvents(userId, "ics", events);
    kvSet(`icsSync:${userId}:${activeTeamId(userId) ?? 0}`, new Date().toISOString());
    return { imported };
  } catch (err) {
    console.error("ics sync error", err);
    return { error: "Couldn't fetch the calendar — check the link is public." };
  }
}

// Refresh at most every 6 hours, piggybacked on page loads.
export async function maybeResyncIcs(userId: number): Promise<void> {
  const squad = getSquad(userId);
  if (!squad?.icsUrl) return;
  // Throttle per TEAM: switching to a second team must not skip its sync
  // just because the first team synced recently.
  const last = kvGet(`icsSync:${userId}:${activeTeamId(userId) ?? 0}`);
  if (last && Date.now() - new Date(last).getTime() < 6 * 3600_000) return;
  await syncIcs(userId);
}

// ---------------- TeamSnap OAuth (optional, env-gated) ----------------

export const teamSnapConfigured = Boolean(process.env.TEAMSNAP_CLIENT_ID && process.env.TEAMSNAP_CLIENT_SECRET);

function teamSnapRedirectUri(): string {
  return `${(process.env.PUBLIC_URL || "http://localhost:8787").replace(/\/$/, "")}/api/schedule/teamsnap/callback`;
}

// TeamSnap API v3 speaks Collection+JSON; flatten one item's data array.
function cjItem(item: { data?: { name: string; value: unknown }[] }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of item.data ?? []) out[d.name] = d.value;
  return out;
}

async function tsGet(token: string, url: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.collection+json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`TeamSnap ${res.status} on ${url}`);
  const body = (await res.json()) as { collection?: { items?: { data?: { name: string; value: unknown }[] }[] } };
  return (body.collection?.items ?? []).map(cjItem);
}

export async function syncTeamSnap(userId: number): Promise<{ imported: number } | { error: string }> {
  const token = getTeamSnapToken(userId);
  if (!token) return { error: "TeamSnap is not connected." };
  try {
    const me = await tsGet(token, "https://api.teamsnap.com/v3/me");
    const tsUserId = me[0]?.id;
    if (!tsUserId) return { error: "Couldn't read your TeamSnap account." };
    const teams = await tsGet(token, `https://api.teamsnap.com/v3/teams/search?user_id=${tsUserId}`);
    const events: Omit<ScheduleEvent, "id" | "source">[] = [];
    for (const team of teams.slice(0, 4)) {
      const teamEvents = await tsGet(token, `https://api.teamsnap.com/v3/events/search?team_id=${team.id}`);
      for (const e of teamEvents) {
        const start = String(e.start_date ?? "");
        if (!start) continue;
        const isGame = Boolean(e.is_game);
        const opponent = String(e.opponent_name ?? "");
        const title = isGame ? `vs ${opponent || "TBD"}` : String(e.name ?? "Practice");
        events.push({
          start: start.slice(0, 19).replace("T", " "),
          title,
          kind: isGame ? "game" : "practice",
          opponent,
          location: String(e.location_name ?? ""),
        });
      }
    }
    const imported = replaceScheduleEvents(userId, "teamsnap", events);
    return { imported };
  } catch (err) {
    console.error("teamsnap sync error", err);
    return { error: "TeamSnap sync failed — try reconnecting." };
  }
}

// ---------------- Router ----------------

export const scheduleRouter = Router();

// OAuth callback arrives as a browser redirect (no Authorization header) —
// identity travels in the signed `state` param instead. Registered BEFORE auth.
scheduleRouter.get("/teamsnap/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    const payload = jwt.verify(String(state ?? ""), JWT_SECRET) as { sub: string; ts: boolean };
    if (!payload.ts || !code) throw new Error("bad state");
    const tokenRes = await fetch("https://auth.teamsnap.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.TEAMSNAP_CLIENT_ID,
        client_secret: process.env.TEAMSNAP_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: teamSnapRedirectUri(),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const tokenBody = (await tokenRes.json()) as { access_token?: string };
    if (!tokenBody.access_token) throw new Error("no token");
    const userId = Number(payload.sub);
    setTeamSnapToken(userId, tokenBody.access_token);
    await syncTeamSnap(userId);
    res.redirect("/?teamsnap=connected");
  } catch (err) {
    console.error("teamsnap callback error", err);
    res.redirect("/?teamsnap=failed");
  }
});

scheduleRouter.use(requireAuth);

function uid(req: unknown): number {
  return (req as AuthedRequest).userId;
}

scheduleRouter.get("/", async (req, res) => {
  const userId = uid(req);
  await maybeResyncIcs(userId);
  const squad = getSquad(userId);
  res.json({
    events: upcomingEvents(userId, 14),
    icsUrl: squad?.icsUrl ?? "",
    teamsnap: { configured: teamSnapConfigured, connected: Boolean(getTeamSnapToken(userId)) },
  });
});

// Save the calendar link (into the squad profile) and sync immediately.
scheduleRouter.post("/ics", async (req, res) => {
  const userId = uid(req);
  const squad = getSquad(userId);
  if (!squad) {
    res.status(400).json({ error: "Set up your team in My Team first." });
    return;
  }
  saveSquad(userId, { ...squad, icsUrl: String(req.body?.url ?? "").slice(0, 500) });
  const result = await syncIcs(userId);
  if ("error" in result) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, events: upcomingEvents(userId, 14) });
});

scheduleRouter.post("/sync", async (req, res) => {
  const userId = uid(req);
  const ics = await syncIcs(userId).catch(() => ({ error: "sync failed" }));
  const ts = getTeamSnapToken(userId) ? await syncTeamSnap(userId) : null;
  res.json({ ics, teamsnap: ts, events: upcomingEvents(userId, 14) });
});

scheduleRouter.post("/event", (req, res) => {
  const { start, title, kind, opponent, location } = req.body ?? {};
  if (!start || !title) {
    res.status(400).json({ error: "start and title are required" });
    return;
  }
  if (countScheduleEvents(uid(req)) >= 400) {
    res.status(400).json({ error: "That's a full season and then some — remove old events before adding more." });
    return;
  }
  addScheduleEvent(uid(req), {
    start: String(start).slice(0, 19).replace("T", " "),
    title: String(title),
    kind: ["game", "practice"].includes(kind) ? kind : classifyEvent(String(title)).kind,
    opponent: String(opponent ?? "") || classifyEvent(String(title)).opponent,
    location: String(location ?? ""),
  });
  res.json({ events: upcomingEvents(uid(req), 14) });
});

scheduleRouter.delete("/event/:id", (req, res) => {
  deleteScheduleEvent(uid(req), Number(req.params.id));
  res.json({ events: upcomingEvents(uid(req), 14) });
});

// Kick off the TeamSnap OAuth dance.
scheduleRouter.post("/teamsnap/connect", (req, res) => {
  if (!teamSnapConfigured) {
    res.status(400).json({ error: "TeamSnap integration isn't configured on this server yet." });
    return;
  }
  const state = jwt.sign({ sub: String(uid(req)), ts: true }, JWT_SECRET, { expiresIn: "10m" });
  const url =
    `https://auth.teamsnap.com/oauth/authorize?client_id=${encodeURIComponent(process.env.TEAMSNAP_CLIENT_ID as string)}` +
    `&redirect_uri=${encodeURIComponent(teamSnapRedirectUri())}&response_type=code&scope=read&state=${encodeURIComponent(state)}`;
  res.json({ url });
});

scheduleRouter.delete("/teamsnap", (req, res) => {
  setTeamSnapToken(uid(req), null);
  replaceScheduleEvents(uid(req), "teamsnap", []);
  res.json({ ok: true });
});
