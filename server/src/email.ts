import { db } from "./db.js";
import { getSeason, kvGet, kvSet } from "./store.js";

// ============================================================================
// Email: Resend-backed (plain HTTPS, no SDK). Everything degrades to a no-op
// when RESEND_API_KEY is unset, so local/demo environments never break.
// Powers: password reset + the weekly rhythm digest (the retention loop —
// youth soccer runs on a weekly cadence, so TactIQ shows up on Mondays).
// ============================================================================

export const emailConfigured = Boolean(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || "TactIQ <coach@updates.tactiq.app>";

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!emailConfigured) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!r.ok) console.error("email send failed", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (err) {
    console.error("email send error", err);
    return false;
  }
}

const appUrl = () => (process.env.PUBLIC_URL || "http://localhost:8787").replace(/\/$/, "");

export async function sendPasswordReset(to: string, name: string, token: string): Promise<boolean> {
  const link = `${appUrl()}/?reset=${token}`;
  return sendEmail(
    to,
    "Reset your TactIQ password",
    `<p>Hi ${name},</p><p>Tap the link below to set a new TactIQ password. It expires in 60 minutes.</p>
     <p><a href="${link}">${link}</a></p><p>If you didn't request this, ignore this email.</p>`,
  );
}

// Monday digest: nudge every recently-active coach with a week-ahead prompt
// grounded in their own last match/session memory.
async function sendWeeklyDigests(): Promise<void> {
  const users = db
    .prepare(
      `SELECT u.id, u.email, u.name FROM users u JOIN progress p ON p.user_id = u.id
       WHERE p.last_active_day >= date('now', '-21 days')`,
    )
    .all() as { id: number; email: string; name: string }[];
  let sent = 0;
  for (const u of users) {
    const recent = getSeason(u.id, 20);
    const lastMatch = recent.find((e) => e.kind === "match");
    const lastSession = recent.find((e) => e.kind === "session");
    const hook = lastMatch
      ? `Last match memory: <b>${lastMatch.title}</b>. Want a session that trains exactly what that game exposed?`
      : lastSession
        ? `Your last session was <b>${lastSession.title}</b>. Ready to build the progression on top of it?`
        : `Your assistant coach is ready to plan this week's first session.`;
    const ok = await sendEmail(
      u.email,
      "Your week of coaching, planned in 2 minutes",
      `<p>Coach ${u.name},</p><p>${hook}</p>
       <p><a href="${appUrl()}">Open TactIQ</a> — Ask Coach Sam, or generate this week's session from the Library.</p>
       <p style="color:#888;font-size:12px">TactIQ — your AI assistant coach. You get this on Mondays because you coached recently.</p>`,
    );
    if (ok) sent += 1;
  }
  if (sent > 0) console.log(`[digest] sent ${sent} weekly digests`);
}

// Hourly tick; fires the digest once every Monday around 13:00 UTC (~9am ET).
export function startDigestScheduler(): void {
  if (!emailConfigured) return;
  const tick = async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getUTCDay() !== 1 || now.getUTCHours() < 13) return;
    if (kvGet("digest:last") === day) return;
    kvSet("digest:last", day);
    await sendWeeklyDigests();
  };
  setInterval(() => void tick(), 60 * 60 * 1000);
  void tick();
  console.log("[digest] weekly digest scheduler armed (Mondays 13:00 UTC)");
}
