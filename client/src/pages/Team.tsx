import { useEffect, useState } from "react";
import { getJSON, sendJSON } from "../api";
import { useGamify } from "../components/Gamify";
import { TeamSwitcher } from "../components/TeamSwitcher";
import { formatForAge, formatMismatch } from "../age";
import type { AwardResult, PlayerNote, SquadProfile } from "../types";

interface ScheduleInfo {
  events: { id: number; start: string; title: string; kind: string; opponent: string; location: string; source: string }[];
  icsUrl: string;
  teamsnap: { configured: boolean; connected: boolean };
}

// Schedule import: ICS calendar link (works with TeamSnap, SportsEngine,
// GotSport, Playmetrics exports) + optional TeamSnap OAuth.
function ScheduleCard() {
  const [info, setInfo] = useState<ScheduleInfo | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState({ title: "", start: "", kind: "game" });

  useEffect(() => {
    void getJSON<ScheduleInfo>("/api/schedule").then((r) => {
      setInfo(r);
      setUrl(r.icsUrl);
    }).catch(() => {});
  }, []);

  async function saveIcs() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await sendJSON<{ imported: number; events: ScheduleInfo["events"] }>("/api/schedule/ics", { url });
      setInfo((i) => (i ? { ...i, events: r.events, icsUrl: url } : i));
      setMsg(`Imported ${r.imported} events — games and practices detected automatically.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
    setBusy(false);
  }

  // Manual entry: not every league exports a calendar link — a coach must
  // always be able to type in Saturday's game.
  async function addManual() {
    if (!manual.title.trim() || !manual.start) return;
    setError("");
    try {
      const r = await sendJSON<{ events: ScheduleInfo["events"] }>("/api/schedule/event", manual);
      setInfo((i) => (i ? { ...i, events: r.events } : i));
      setManual({ title: "", start: "", kind: "game" });
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the event");
    }
  }

  async function removeEvent(id: number) {
    try {
      const r = await sendJSON<{ events: ScheduleInfo["events"] }>(`/api/schedule/event/${id}`, {}, "DELETE");
      setInfo((i) => (i ? { ...i, events: r.events } : i));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the event");
    }
  }

  async function syncNow() {
    setBusy(true);
    setError("");
    try {
      const r = await sendJSON<{ imported?: number; events: ScheduleInfo["events"] }>("/api/schedule/sync", {});
      setInfo((i) => (i ? { ...i, events: r.events } : i));
      setMsg("Schedule refreshed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    }
    setBusy(false);
  }

  async function connectTeamSnap() {
    setError("");
    try {
      const r = await sendJSON<{ url: string }>("/api/schedule/teamsnap/connect", {});
      if (r.url) window.location.href = r.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "TeamSnap connect failed");
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>📅 Team schedule</h2>
      <p className="muted small">
        Paste your team's calendar link (TeamSnap, SportsEngine, GotSport, and most league apps export one) and TactIQ keeps your
        games and practices in sync — powering the home page, game-plan prep, and weekly briefings.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          style={{ flex: 1, minWidth: 240 }}
          value={url}
          placeholder="https://…/calendar.ics or webcal://…"
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="btn" onClick={() => void saveIcs()} disabled={busy || !url.trim()}>
          {busy ? "Importing…" : "Import calendar"}
        </button>
        {info?.teamsnap.configured && !info.teamsnap.connected && (
          <button className="btn ghost" onClick={() => void connectTeamSnap()}>Connect TeamSnap</button>
        )}
        {info?.teamsnap.connected && <span className="chip" style={{ alignSelf: "center" }}>✓ TeamSnap connected</span>}
        <button className="btn ghost" onClick={() => setAdding(!adding)}>{adding ? "✕ Cancel" : "+ Add game/practice"}</button>
        {info && (info.icsUrl || info.teamsnap.connected) && (
          <button className="btn ghost" onClick={() => void syncNow()} disabled={busy}>↻ Sync now</button>
        )}
      </div>
      {adding && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <select value={manual.kind} onChange={(e) => setManual((m) => ({ ...m, kind: e.target.value }))}>
            <option value="game">📣 Game</option>
            <option value="practice">📋 Practice</option>
          </select>
          <input
            style={{ flex: 1, minWidth: 180 }}
            placeholder={manual.kind === "game" ? "vs Riverside FC" : "Team practice"}
            value={manual.title}
            onChange={(e) => setManual((m) => ({ ...m, title: e.target.value }))}
          />
          <input
            type="datetime-local"
            value={manual.start}
            onChange={(e) => setManual((m) => ({ ...m, start: e.target.value }))}
          />
          <button className="btn" onClick={() => void addManual()} disabled={!manual.title.trim() || !manual.start}>Add</button>
        </div>
      )}
      {msg && <p style={{ color: "var(--green)", fontWeight: 600, fontSize: 13 }}>{msg}</p>}
      {error && <div className="error-box">{error}</div>}
      {info && info.events.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {info.events.slice(0, 6).map((e) => (
            <div key={e.id} className="season-row">
              <span className="kind">{e.kind === "game" ? "📣" : e.kind === "practice" ? "📋" : "📅"}</span>
              <div style={{ flex: 1 }}>
                <div className="title">{e.kind === "game" ? `vs ${e.opponent || "TBD"}` : e.title}</div>
                <div className="muted small">{e.start.slice(0, 16).replace("T", " · ")}{e.location ? ` · ${e.location}` : ""} · {e.source}</div>
              </div>
              {e.source === "manual" && (
                <button className="btn ghost" style={{ fontSize: 11.5, padding: "4px 8px" }} title="Remove this event" onClick={() => void removeEvent(e.id)}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY: SquadProfile = {
  teamName: "",
  players: [],
  coachExperience: "intermediate",
  ageGroup: "U10",
  format: "7v7",
  level: "travel",
  preferredStyle: "",
  rosterNotes: "",
  seasonGoals: "",
};

const EMPTY_PLAYER: PlayerNote = { name: "", number: "", positions: "", foot: "", notes: "" };

export function Team() {
  const { celebrate } = useGamify();
  const [squad, setSquad] = useState<SquadProfile>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getJSON<{ squad: SquadProfile | null }>("/api/team")
      .then((r) => r.squad && setSquad({ ...EMPTY, ...r.squad }))
      .catch(() => {});
  }, []);

  // Typing an age sets the game format automatically (US Soccer standard);
  // the format select stays editable for leagues that deviate.
  const set = (k: keyof SquadProfile, v: unknown) => {
    setSaved(false);
    setSquad((s) => {
      const next = { ...s, [k]: v };
      if (k === "ageGroup") {
        const derived = formatForAge(String(v));
        if (derived) next.format = derived;
      }
      return next;
    });
  };

  const setPlayer = (i: number, k: keyof PlayerNote, v: string) => {
    setSaved(false);
    setSquad((s) => {
      const players = [...(s.players ?? [])];
      players[i] = { ...players[i], [k]: v };
      return { ...s, players };
    });
  };

  async function save() {
    setError("");
    try {
      // The calendar link is owned by the Schedule card, which saves it the
      // moment it's imported. The profile form NEVER sends icsUrl — sending a
      // stale copy from this form's mount-time state would wipe an import
      // made after the page loaded. The server keeps the stored value when
      // the field is absent.
      const { icsUrl: _ics, ...profile } = squad;
      const res = await sendJSON<{ squad: SquadProfile; award: AwardResult }>("/api/team", profile, "PUT");
      setSquad({ ...EMPTY, ...res.squad });
      setSaved(true);
      celebrate(res.award);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  const players = squad.players ?? [];

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ marginBottom: 0 }}>My Team</h1>
        <TeamSwitcher withCreate />
      </div>
      <p className="sub">
        TactIQ's season-long memory. Everything here — including your roster — flows into every advisor, session, formation, and
        Match Day briefing, so guidance is about <b>your actual players</b>. Each team keeps its own roster, schedule, and season
        memory — switch above to work with another squad.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Team profile</h2>
        <div className="form-grid">
          <label className="field">
            Team name
            <input value={squad.teamName} onChange={(e) => set("teamName", e.target.value)} placeholder="e.g. Thunder SC 2016 Orange" />
          </label>
          <label className="field">
            Age group
            <input value={squad.ageGroup} onChange={(e) => set("ageGroup", e.target.value)} placeholder="e.g. U10" />
          </label>
          <label className="field">
            Game format <span className="muted small">(set by age)</span>
            <select value={squad.format} onChange={(e) => set("format", e.target.value)}>
              <option>4v4</option>
              <option>7v7</option>
              <option>9v9</option>
              <option>11v11</option>
            </select>
            {formatMismatch(squad.ageGroup, squad.format) && (
              <span className="small" style={{ color: "var(--gold)" }}>
                ⚠ {squad.ageGroup} plays {formatMismatch(squad.ageGroup, squad.format)} under US Soccer standards — keep {squad.format} only if your league differs.
              </span>
            )}
          </label>
          <label className="field">
            Level
            <select value={squad.level} onChange={(e) => set("level", e.target.value)}>
              <option value="rec">Recreational</option>
              <option value="travel">Travel / Club</option>
              <option value="academy">Academy / Elite</option>
              <option value="hs">High School</option>
            </select>
          </label>
          <label className="field">
            Your coaching experience
            <select value={squad.coachExperience} onChange={(e) => set("coachExperience", e.target.value)}>
              <option value="new">New — first seasons</option>
              <option value="intermediate">Intermediate</option>
              <option value="experienced">Experienced / licensed</option>
            </select>
          </label>
        </div>
        <label className="field" style={{ marginBottom: 12 }}>
          Preferred playing style
          <input value={squad.preferredStyle} onChange={(e) => set("preferredStyle", e.target.value)} placeholder="e.g. Possession, build from the back, high press" />
        </label>
        <label className="field" style={{ marginBottom: 12 }}>
          Team notes
          <textarea value={squad.rosterNotes} rows={2} onChange={(e) => set("rosterNotes", e.target.value)} placeholder="Team-level strengths/weaknesses, attendance patterns, keeper situation…" />
        </label>
        <label className="field" style={{ marginBottom: 12 }}>
          Season goals
          <textarea value={squad.seasonGoals} rows={2} onChange={(e) => set("seasonGoals", e.target.value)} placeholder="e.g. Every player confident receiving under pressure by spring" />
        </label>
        <div className="form-grid">
          <label className="field">
            Next opponent
            <input value={squad.nextOpponent ?? ""} onChange={(e) => set("nextOpponent", e.target.value)} placeholder="e.g. Rapids FC 2015" />
          </label>
          <label className="field">
            Next game date
            <input type="date" value={squad.nextGameDate ?? ""} onChange={(e) => set("nextGameDate", e.target.value)} />
          </label>
        </div>
      </div>

      <ScheduleCard />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h2>Roster ({players.filter((p) => p.name).length})</h2>
          <span className="muted small">First names or initials only — protect the kids' privacy.</span>
        </div>
        <div className="table-scroll">
        <table className="roster-table">
          <thead>
            <tr><th style={{ width: "22%" }}>Player</th><th style={{ width: "8%" }}>#</th><th style={{ width: "18%" }}>Positions</th><th style={{ width: "12%" }}>Foot</th><th>Notes (strengths, needs, temperament)</th><th /></tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={i}>
                <td><input value={p.name} placeholder="Maya R." onChange={(e) => setPlayer(i, "name", e.target.value)} /></td>
                <td><input value={p.number} placeholder="7" onChange={(e) => setPlayer(i, "number", e.target.value)} /></td>
                <td><input value={p.positions} placeholder="CM, RW" onChange={(e) => setPlayer(i, "positions", e.target.value)} /></td>
                <td>
                  <select value={p.foot} onChange={(e) => setPlayer(i, "foot", e.target.value)}>
                    <option value="">—</option><option>R</option><option>L</option><option>Both</option>
                  </select>
                </td>
                <td><input value={p.notes} placeholder="Great engine, needs confidence on the ball" onChange={(e) => setPlayer(i, "notes", e.target.value)} /></td>
                <td><button className="del" title="Remove" onClick={() => set("players", players.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => set("players", [...players, { ...EMPTY_PLAYER }])}>
          + Add player
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button className="btn" onClick={() => void save()} disabled={!squad.teamName || !squad.ageGroup}>
          💾 Save Team
        </button>
        {saved && <span style={{ color: "var(--green)", fontWeight: 700 }}>Saved — your AI staff knows this team ✓</span>}
      </div>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3>🔌 Integrations</h3>
        <p className="muted small" style={{ lineHeight: 1.6 }}>
          <b>Veo / Trace / Hudl:</b> today, paste match reports or upload stat screenshots in Match Day → Post-Game and TactIQ analyzes them.
          Direct API connections (auto-import your match analytics after every game) require partner API access from those platforms and are
          the next integration milestone — the data pipeline is already built to receive them.
        </p>
      </div>

      <DangerZone />
    </div>
  );
}

// The privacy promise on the sign-up page and Privacy tab: full account +
// data deletion, self-serve. Typed confirmation, no browser dialogs.
function DangerZone() {
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function destroy() {
    setBusy(true);
    setErr("");
    try {
      await sendJSON("/api/auth/account", {}, "DELETE");
      window.dispatchEvent(new Event("tactiq:signout"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deletion failed — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16, borderColor: "var(--red, #c0392b)" }}>
      <h3 style={{ marginTop: 0 }}>🗑 Delete account</h3>
      <p className="muted small" style={{ lineHeight: 1.6 }}>
        Permanently removes your account and ALL data — teams, rosters, season history, sessions, schedule, everything.
        This cannot be undone.
      </p>
      {!open ? (
        <button className="btn ghost" style={{ color: "var(--red, #c0392b)", borderColor: "var(--red, #c0392b)" }} onClick={() => setOpen(true)}>
          Delete my account…
        </button>
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label className="field" style={{ margin: 0 }}>
            Type <b>DELETE</b> to confirm
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" style={{ width: 160 }} />
          </label>
          <button className="btn" style={{ background: "var(--red, #c0392b)" }} disabled={confirmText !== "DELETE" || busy} onClick={() => void destroy()}>
            {busy ? "Deleting…" : "Permanently delete everything"}
          </button>
          <button className="btn ghost" onClick={() => { setOpen(false); setConfirmText(""); }}>Cancel</button>
        </div>
      )}
      {err && <div className="error-box">{err}</div>}
    </div>
  );
}
