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
}

export interface SeasonEntry {
  id: number;
  date: string;
  kind: "session" | "formation" | "guidance" | "chat";
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
export function getPlanTier(userId: number): "free" | "pro" {
  const row = db.prepare("SELECT plan FROM users WHERE id = ?").get(userId) as { plan: string } | undefined;
  return row?.plan === "pro" ? "pro" : "free";
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
