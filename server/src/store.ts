import { db, today } from "./db.js";

// DB-backed repository. All data is per-user.

export interface PlayerNote {
  name: string;
  number: string;
  positions: string;
  foot: string;
  notes: string;
}

export interface SquadProfile {
  teamName: string;
  players?: PlayerNote[];
  coachExperience: "new" | "intermediate" | "experienced";
  ageGroup: string;
  format: string;
  level: string;
  preferredStyle: string;
  rosterNotes: string;
  seasonGoals: string;
  nextOpponent?: string;
  nextGameDate?: string; // ISO date (YYYY-MM-DD)
  icsUrl?: string; // team calendar subscription (TeamSnap/SportsEngine/GotSport export)
}

export interface SeasonEntry {
  id: number;
  date: string;
  kind: "session" | "formation" | "guidance" | "chat" | "match" | "film";
  title: string;
  summary: string;
  payload?: unknown;
}

export interface Progress {
  xp: number;
  streak: number;
  lastActiveDay: string;
  badges: string[];
  counts: Record<string, number>;
  advisorsUsed: string[];
}

export interface CustomAdvisor {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  category: string;
  goodFor: string;
  philosophy: string;
  custom: true;
}

// ---- squad ----
export function getSquad(userId: number): SquadProfile | null {
  const row = db.prepare("SELECT data FROM squads WHERE user_id = ?").get(userId) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as SquadProfile) : null;
}

export function saveSquad(userId: number, squad: SquadProfile): void {
  db.prepare(
    "INSERT INTO squads (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data",
  ).run(userId, JSON.stringify(squad));
}

// ---- season log ----
export function addSeasonEntry(userId: number, entry: Omit<SeasonEntry, "id" | "date">): number {
  const info = db.prepare("INSERT INTO season_entries (user_id, kind, title, summary, payload) VALUES (?, ?, ?, ?, ?)").run(
    userId,
    entry.kind,
    entry.title,
    entry.summary,
    entry.payload !== undefined ? JSON.stringify(entry.payload) : null,
  );
  return Number(info.lastInsertRowid);
}

export function getSeason(userId: number, limit = 100): SeasonEntry[] {
  const rows = db
    .prepare("SELECT id, date, kind, title, summary, payload FROM season_entries WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit) as { id: number; date: string; kind: SeasonEntry["kind"]; title: string; summary: string; payload: string | null }[];
  return rows.map((r) => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : undefined }));
}

// ---- progress ----
export function getProgress(userId: number): Progress {
  let row = db.prepare("SELECT * FROM progress WHERE user_id = ?").get(userId) as
    | { xp: number; streak: number; last_active_day: string; badges: string; counts: string; advisors_used: string }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO progress (user_id) VALUES (?)").run(userId);
    row = db.prepare("SELECT * FROM progress WHERE user_id = ?").get(userId) as typeof row;
  }
  return {
    xp: row!.xp,
    streak: row!.streak,
    lastActiveDay: row!.last_active_day,
    badges: JSON.parse(row!.badges),
    counts: JSON.parse(row!.counts),
    advisorsUsed: JSON.parse(row!.advisors_used),
  };
}

export function saveProgress(userId: number, p: Progress): void {
  db.prepare(
    "UPDATE progress SET xp = ?, streak = ?, last_active_day = ?, badges = ?, counts = ?, advisors_used = ? WHERE user_id = ?",
  ).run(p.xp, p.streak, p.lastActiveDay, JSON.stringify(p.badges), JSON.stringify(p.counts), JSON.stringify(p.advisorsUsed), userId);
}

export function pushXpHistory(userId: number, xp: number): void {
  db.prepare("INSERT INTO xp_history (user_id, xp) VALUES (?, ?)").run(userId, xp);
}

export function getXpHistory(userId: number, limit = 60): { t: string; xp: number }[] {
  const rows = db
    .prepare("SELECT t, xp FROM xp_history WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit) as { t: string; xp: number }[];
  return rows.reverse();
}

export function xpAtStartOfToday(userId: number): number {
  const row = db
    .prepare("SELECT xp FROM xp_history WHERE user_id = ? AND t < ? ORDER BY id DESC LIMIT 1")
    .get(userId, `${today()} 00:00:00`) as { xp: number } | undefined;
  return row?.xp ?? 0;
}

// ---- usage ----
export function getUsage(userId: number): number {
  const row = db.prepare("SELECT messages FROM usage_daily WHERE user_id = ? AND day = ?").get(userId, today()) as
    | { messages: number }
    | undefined;
  return row?.messages ?? 0;
}

export function incrementUsage(userId: number): void {
  db.prepare(
    "INSERT INTO usage_daily (user_id, day, messages) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET messages = messages + 1",
  ).run(userId, today());
}

// ---- custom advisors ----
export function getCustomAdvisors(userId: number): CustomAdvisor[] {
  const rows = db.prepare("SELECT data FROM custom_advisors WHERE user_id = ?").all(userId) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as CustomAdvisor);
}

export function addCustomAdvisor(userId: number, adv: CustomAdvisor): void {
  db.prepare("INSERT INTO custom_advisors (id, user_id, data) VALUES (?, ?, ?)").run(adv.id, userId, JSON.stringify(adv));
}

export function deleteCustomAdvisor(userId: number, id: string): void {
  db.prepare("DELETE FROM custom_advisors WHERE id = ? AND user_id = ?").run(id, userId);
}

// ---- library ----
export function getLibraryPlan(userId: number, templateId: string): unknown | null {
  const row = db.prepare("SELECT data FROM library_plans WHERE user_id = ? AND template_id = ?").get(userId, templateId) as
    | { data: string }
    | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function saveLibraryPlan(userId: number, templateId: string, plan: unknown): void {
  db.prepare(
    "INSERT INTO library_plans (user_id, template_id, data) VALUES (?, ?, ?) ON CONFLICT(user_id, template_id) DO UPDATE SET data = excluded.data",
  ).run(userId, templateId, JSON.stringify(plan));
}

export function getUnlockedTemplateIds(userId: number): Set<string> {
  const rows = db.prepare("SELECT template_id FROM library_plans WHERE user_id = ?").all(userId) as { template_id: string }[];
  return new Set(rows.map((r) => r.template_id));
}

// ---- plan tier ----
// Effective plan: a coach is Pro if they subscribed individually OR their
// club holds an active club license with a seat available (seats are counted
// against coach headcount, oldest members first).
export function getPlanTier(userId: number): "free" | "pro" {
  const row = db
    .prepare(
      `SELECT u.plan, c.plan_tier AS club_plan, c.seats, c.id AS club_id
       FROM users u LEFT JOIN clubs c ON c.id = u.club_id WHERE u.id = ?`,
    )
    .get(userId) as { plan: string; club_plan: string | null; seats: number | null; club_id: number | null } | undefined;
  if (!row) return "free";
  if (row.plan === "pro") return "pro";
  if (row.club_plan === "pro" && row.club_id) {
    const seated = db
      .prepare("SELECT id FROM users WHERE club_id = ? ORDER BY id ASC LIMIT ?")
      .all(row.club_id, row.seats ?? 0) as { id: number }[];
    if (seated.some((s) => s.id === userId)) return "pro";
  }
  return "free";
}

export function setPlanTier(userId: number, plan: "free" | "pro"): void {
  db.prepare("UPDATE users SET plan = ? WHERE id = ?").run(plan, userId);
}

// ---- leaderboard (real users; club-scoped when available) ----
export function leaderboard(userId: number): { rank: number; name: string; xp: number; you: boolean }[] {
  const me = db.prepare("SELECT club_id FROM users WHERE id = ?").get(userId) as { club_id: number | null } | undefined;
  const rows = (
    me?.club_id
      ? db.prepare(
          "SELECT u.id, u.name, p.xp FROM users u JOIN progress p ON p.user_id = u.id WHERE u.club_id = ? ORDER BY p.xp DESC LIMIT 25",
        ).all(me.club_id)
      : db.prepare(
          "SELECT u.id, u.name, p.xp FROM users u JOIN progress p ON p.user_id = u.id ORDER BY p.xp DESC LIMIT 25",
        ).all()
  ) as { id: number; name: string; xp: number }[];
  return rows.map((r, i) => ({ rank: i + 1, name: r.name, xp: r.xp, you: r.id === userId }));
}

export { today };

// ---- club helpers ----
export function getUserClub(userId: number): { id: number; name: string; code: string; philosophy: string; role: string } | null {
  const row = db
    .prepare("SELECT c.id, c.name, c.code, c.philosophy, u.role FROM users u JOIN clubs c ON c.id = u.club_id WHERE u.id = ?")
    .get(userId) as { id: number; name: string; code: string; philosophy: string; role: string } | undefined;
  return row ?? null;
}

export function clubCoaches(clubId: number): { id: number; name: string; xp: number; streak: number; counts: Record<string, number>; lastActiveDay: string }[] {
  const rows = db
    .prepare(
      "SELECT u.id, u.name, p.xp, p.streak, p.counts, p.last_active_day FROM users u JOIN progress p ON p.user_id = u.id WHERE u.club_id = ? ORDER BY p.xp DESC",
    )
    .all(clubId) as { id: number; name: string; xp: number; streak: number; counts: string; last_active_day: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name, xp: r.xp, streak: r.streak, counts: JSON.parse(r.counts), lastActiveDay: r.last_active_day }));
}

export interface ClubSession {
  id: number;
  title: string;
  description: string;
  content: string;
  created_at: string;
  uploaded_by_name?: string;
}

export function addClubSession(clubId: number, userId: number, s: { title: string; description: string; content: string }): void {
  db.prepare("INSERT INTO club_sessions (club_id, uploaded_by, title, description, content) VALUES (?, ?, ?, ?, ?)").run(
    clubId, userId, s.title, s.description, s.content,
  );
}

export function getClubSessions(clubId: number): ClubSession[] {
  return db
    .prepare(
      "SELECT cs.id, cs.title, cs.description, cs.content, cs.created_at, u.name AS uploaded_by_name FROM club_sessions cs JOIN users u ON u.id = cs.uploaded_by WHERE cs.club_id = ? ORDER BY cs.id DESC",
    )
    .all(clubId) as ClubSession[];
}

export function setClubPhilosophy(clubId: number, text: string): void {
  db.prepare("UPDATE clubs SET philosophy = ? WHERE id = ?").run(text.slice(0, 4000), clubId);
}

// ---- club licensing ----
export function getClubBilling(clubId: number): { stripeCustomerId: string | null; planTier: string; seats: number } | null {
  const row = db.prepare("SELECT stripe_customer_id, plan_tier, seats FROM clubs WHERE id = ?").get(clubId) as
    | { stripe_customer_id: string | null; plan_tier: string; seats: number }
    | undefined;
  return row ? { stripeCustomerId: row.stripe_customer_id, planTier: row.plan_tier, seats: row.seats } : null;
}

export function setClubLicense(clubId: number, planTier: "free" | "pro", seats: number, customerId?: string, subscriptionId?: string): void {
  if (customerId !== undefined) {
    db.prepare("UPDATE clubs SET plan_tier = ?, seats = ?, stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?").run(
      planTier, seats, customerId, subscriptionId ?? null, clubId,
    );
  } else {
    db.prepare("UPDATE clubs SET plan_tier = ?, seats = ? WHERE id = ?").run(planTier, seats, clubId);
  }
}

export function findClubByStripeCustomer(customerId: string): number | null {
  const row = db.prepare("SELECT id FROM clubs WHERE stripe_customer_id = ?").get(customerId) as { id: number } | undefined;
  return row?.id ?? null;
}

// The DOC monthly report: per-coach activity over the last N days, from the
// season ledger and ratings — the artifact that justifies the club invoice.
export function clubReport(clubId: number, days = 30): {
  coaches: { name: string; sessions: number; matchdays: number; conversations: number; film: number; ratings: number; lastActiveDay: string }[];
  totals: { sessions: number; matchdays: number; conversations: number; film: number; ratings: number };
} {
  const rows = db
    .prepare(
      `SELECT u.name, p.last_active_day,
        SUM(CASE WHEN s.kind = 'session' THEN 1 ELSE 0 END) sessions,
        SUM(CASE WHEN s.kind = 'match' THEN 1 ELSE 0 END) matchdays,
        SUM(CASE WHEN s.kind IN ('chat','guidance') THEN 1 ELSE 0 END) conversations,
        SUM(CASE WHEN s.kind = 'film' THEN 1 ELSE 0 END) film,
        (SELECT COUNT(*) FROM feedback f WHERE f.user_id = u.id AND f.created_at >= datetime('now', '-' || ? || ' days')) ratings
       FROM users u
       JOIN progress p ON p.user_id = u.id
       LEFT JOIN season_entries s ON s.user_id = u.id AND s.date >= datetime('now', '-' || ? || ' days')
       WHERE u.club_id = ?
       GROUP BY u.id ORDER BY sessions DESC`,
    )
    .all(days, days, clubId) as { name: string; last_active_day: string; sessions: number; matchdays: number; conversations: number; film: number; ratings: number }[];
  const coaches = rows.map((r) => ({
    name: r.name, sessions: r.sessions ?? 0, matchdays: r.matchdays ?? 0, conversations: r.conversations ?? 0,
    film: r.film ?? 0, ratings: r.ratings ?? 0, lastActiveDay: r.last_active_day,
  }));
  const totals = coaches.reduce(
    (t, c) => ({
      sessions: t.sessions + c.sessions, matchdays: t.matchdays + c.matchdays,
      conversations: t.conversations + c.conversations, film: t.film + c.film, ratings: t.ratings + c.ratings,
    }),
    { sessions: 0, matchdays: 0, conversations: 0, film: 0, ratings: 0 },
  );
  return { coaches, totals };
}

// ---- schedule (imported + manual games/practices) ----
export interface ScheduleEvent {
  id: number;
  start: string; // ISO datetime
  title: string;
  kind: "game" | "practice" | "other";
  opponent: string;
  location: string;
  source: string; // ics | teamsnap | manual
}

export function replaceScheduleEvents(userId: number, source: string, events: Omit<ScheduleEvent, "id" | "source">[]): number {
  const del = db.prepare("DELETE FROM schedule_events WHERE user_id = ? AND source = ?");
  const ins = db.prepare(
    "INSERT OR REPLACE INTO schedule_events (user_id, start, title, kind, opponent, location, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const tx = db.transaction(() => {
    del.run(userId, source);
    for (const e of events) ins.run(userId, e.start, e.title.slice(0, 120), e.kind, e.opponent.slice(0, 80), e.location.slice(0, 120), source);
  });
  tx();
  return events.length;
}

export function addScheduleEvent(userId: number, e: Omit<ScheduleEvent, "id" | "source">): void {
  db.prepare(
    "INSERT OR REPLACE INTO schedule_events (user_id, start, title, kind, opponent, location, source) VALUES (?, ?, ?, ?, ?, ?, 'manual')",
  ).run(userId, e.start, e.title.slice(0, 120), e.kind, e.opponent.slice(0, 80), e.location.slice(0, 120));
}

export function deleteScheduleEvent(userId: number, id: number): void {
  db.prepare("DELETE FROM schedule_events WHERE user_id = ? AND id = ?").run(userId, id);
}

export function upcomingEvents(userId: number, days = 14): ScheduleEvent[] {
  return db
    .prepare(
      `SELECT id, start, title, kind, opponent, location, source FROM schedule_events
       WHERE user_id = ? AND start >= datetime('now', '-6 hours') AND start <= datetime('now', '+' || ? || ' days')
       ORDER BY start ASC LIMIT 40`,
    )
    .all(userId, days) as ScheduleEvent[];
}

export function setTeamSnapToken(userId: number, token: string | null): void {
  db.prepare("UPDATE users SET teamsnap_token = ? WHERE id = ?").run(token, userId);
}

export function getTeamSnapToken(userId: number): string | null {
  const row = db.prepare("SELECT teamsnap_token FROM users WHERE id = ?").get(userId) as { teamsnap_token: string | null } | undefined;
  return row?.teamsnap_token ?? null;
}

// ---- kv (scheduler state) ----
export function kvGet(k: string): string | null {
  const row = db.prepare("SELECT v FROM kv WHERE k = ?").get(k) as { v: string } | undefined;
  return row?.v ?? null;
}

export function kvSet(k: string, v: string): void {
  db.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v);
}

// ---- password resets ----
export function createPasswordReset(userId: number, token: string, ttlMinutes = 60): void {
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId);
  db.prepare("INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+' || ? || ' minutes'))").run(token, userId, ttlMinutes);
}

export function consumePasswordReset(token: string): number | null {
  const row = db.prepare("SELECT user_id FROM password_resets WHERE token = ? AND expires_at > datetime('now')").get(token) as { user_id: number } | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM password_resets WHERE token = ?").run(token);
  return row.user_id;
}

export function findUserByEmail(email: string): { id: number; name: string; email: string } | null {
  const row = db.prepare("SELECT id, name, email FROM users WHERE email = ?").get(email.toLowerCase()) as { id: number; name: string; email: string } | undefined;
  return row ?? null;
}

// ---- billing (Stripe linkage; plan tier is server-authoritative) ----
export function getUserBilling(userId: number): { email: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null } | null {
  const row = db.prepare("SELECT email, stripe_customer_id, stripe_subscription_id FROM users WHERE id = ?").get(userId) as
    | { email: string; stripe_customer_id: string | null; stripe_subscription_id: string | null }
    | undefined;
  return row ? { email: row.email, stripeCustomerId: row.stripe_customer_id, stripeSubscriptionId: row.stripe_subscription_id } : null;
}

export function setStripeIds(userId: number, customerId: string, subscriptionId: string | null): void {
  db.prepare("UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?").run(customerId, subscriptionId, userId);
}

export function findUserByStripeCustomer(customerId: string): number | null {
  const row = db.prepare("SELECT id FROM users WHERE stripe_customer_id = ?").get(customerId) as { id: number } | undefined;
  return row?.id ?? null;
}

// ---- model call ledger (cost integrity: every AI call logged with token usage) ----
export function logModelCall(c: { userId: number; provider: string; model: string; tier: string; inputTokens: number; outputTokens: number }): void {
  if (c.userId <= 0) {
    // Anonymous preview calls have no user row — log to console only.
    console.log(`[engine] anon ${c.provider}/${c.model} (${c.tier}) in=${c.inputTokens} out=${c.outputTokens}`);
    return;
  }
  db.prepare("INSERT INTO model_calls (user_id, provider, model, tier, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)").run(
    c.userId, c.provider, c.model, c.tier, c.inputTokens, c.outputTokens,
  );
}

export function tokensToday(userId: number): { input: number; output: number; calls: number } {
  const row = db
    .prepare("SELECT COALESCE(SUM(input_tokens),0) i, COALESCE(SUM(output_tokens),0) o, COUNT(*) n FROM model_calls WHERE user_id = ? AND t >= date('now')")
    .get(userId) as { i: number; o: number; n: number };
  return { input: row.i, output: row.o, calls: row.n };
}

// ---- feedback (output ratings -> eval dataset) ----
export function addFeedback(userId: number, f: { entryId?: number | null; kind: string; vote: 1 | -1; note?: string }): void {
  db.prepare("INSERT INTO feedback (user_id, entry_id, kind, vote, note) VALUES (?, ?, ?, ?, ?)").run(
    userId, f.entryId ?? null, f.kind, f.vote, (f.note ?? "").slice(0, 500),
  );
}

export interface FeedbackDigestRow {
  kind: string;
  vote: number;
  note: string;
  title: string | null;
}

// Recent ratings joined to the rated outputs — powers the personalization loop:
// what this coach liked/disliked flows back into every future prompt.
export function feedbackDigest(userId: number, limit = 12): FeedbackDigestRow[] {
  return db
    .prepare(
      `SELECT f.kind, f.vote, f.note, s.title
       FROM feedback f LEFT JOIN season_entries s ON s.id = f.entry_id
       WHERE f.user_id = ? ORDER BY f.id DESC LIMIT ?`,
    )
    .all(userId, limit) as FeedbackDigestRow[];
}

export function feedbackCount(userId: number): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ?").get(userId) as { n: number };
  return row.n;
}

export function feedbackStats(clubId?: number): { kind: string; up: number; down: number }[] {
  const rows = (clubId
    ? db.prepare("SELECT f.kind, SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END) up, SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END) down FROM feedback f JOIN users u ON u.id=f.user_id WHERE u.club_id = ? GROUP BY f.kind").all(clubId)
    : db.prepare("SELECT kind, SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END) up, SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END) down FROM feedback GROUP BY kind").all()
  ) as { kind: string; up: number; down: number }[];
  return rows;
}

// ---- club comments (bounded community) ----
export interface ClubComment {
  id: number;
  text: string;
  created_at: string;
  author: string;
}

export function addClubComment(clubId: number, sessionId: number, userId: number, text: string): void {
  db.prepare("INSERT INTO club_comments (club_id, session_id, user_id, text) VALUES (?, ?, ?, ?)").run(
    clubId, sessionId, userId, text.slice(0, 1000),
  );
}

export function getClubComments(sessionId: number): ClubComment[] {
  return db
    .prepare("SELECT c.id, c.text, c.created_at, u.name AS author FROM club_comments c JOIN users u ON u.id = c.user_id WHERE c.session_id = ? ORDER BY c.id")
    .all(sessionId) as ClubComment[];
}
