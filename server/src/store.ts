import { db } from "./db.js";

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

// ---- teams (multi-team: a coach can run several squads; one is active) ----
// getSquad/saveSquad keep their signatures — they read/write the ACTIVE team —
// so season memory, schedule, prompts, and the whole app scope per team.

export function activeTeamId(userId: number): number | null {
  const row = db.prepare("SELECT active_team_id FROM users WHERE id = ?").get(userId) as { active_team_id: number | null } | undefined;
  if (row?.active_team_id) return row.active_team_id;
  const first = db.prepare("SELECT id FROM teams WHERE user_id = ? ORDER BY id ASC LIMIT 1").get(userId) as { id: number } | undefined;
  if (first) {
    db.prepare("UPDATE users SET active_team_id = ? WHERE id = ?").run(first.id, userId);
    return first.id;
  }
  return null;
}

export function listTeams(userId: number): { id: number; squad: SquadProfile; active: boolean }[] {
  const active = activeTeamId(userId);
  const rows = db.prepare("SELECT id, data FROM teams WHERE user_id = ? ORDER BY id ASC").all(userId) as { id: number; data: string }[];
  return rows.map((r) => ({ id: r.id, squad: JSON.parse(r.data) as SquadProfile, active: r.id === active }));
}

export function createTeam(userId: number, squad: SquadProfile): number {
  const info = db.prepare("INSERT INTO teams (user_id, data) VALUES (?, ?)").run(userId, JSON.stringify(squad));
  const teamId = Number(info.lastInsertRowid);
  db.prepare("UPDATE users SET active_team_id = ? WHERE id = ?").run(teamId, userId);
  return teamId;
}

export function setActiveTeam(userId: number, teamId: number): boolean {
  const owned = db.prepare("SELECT id FROM teams WHERE id = ? AND user_id = ?").get(teamId, userId);
  if (!owned) return false;
  db.prepare("UPDATE users SET active_team_id = ? WHERE id = ?").run(teamId, userId);
  return true;
}

export function deleteTeam(userId: number, teamId: number): boolean {
  const owned = db.prepare("SELECT id FROM teams WHERE id = ? AND user_id = ?").get(teamId, userId);
  if (!owned) return false;
  db.prepare("DELETE FROM teams WHERE id = ?").run(teamId);
  db.prepare("DELETE FROM season_entries WHERE user_id = ? AND team_id = ?").run(userId, teamId);
  db.prepare("DELETE FROM schedule_events WHERE user_id = ? AND team_id = ?").run(userId, teamId);
  const next = db.prepare("SELECT id FROM teams WHERE user_id = ? ORDER BY id ASC LIMIT 1").get(userId) as { id: number } | undefined;
  db.prepare("UPDATE users SET active_team_id = ? WHERE id = ?").run(next?.id ?? null, userId);
  return true;
}

export function getSquad(userId: number): SquadProfile | null {
  const teamId = activeTeamId(userId);
  if (!teamId) return null;
  const row = db.prepare("SELECT data FROM teams WHERE id = ?").get(teamId) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as SquadProfile) : null;
}

export function saveSquad(userId: number, squad: SquadProfile): void {
  const teamId = activeTeamId(userId);
  if (teamId) {
    db.prepare("UPDATE teams SET data = ? WHERE id = ?").run(JSON.stringify(squad), teamId);
  } else {
    createTeam(userId, squad);
  }
}

// ---- season log (scoped to the active team; legacy NULL rows show everywhere) ----
export function addSeasonEntry(userId: number, entry: Omit<SeasonEntry, "id" | "date">): number {
  const info = db.prepare("INSERT INTO season_entries (user_id, team_id, kind, title, summary, payload) VALUES (?, ?, ?, ?, ?, ?)").run(
    userId,
    activeTeamId(userId),
    entry.kind,
    entry.title,
    entry.summary,
    entry.payload !== undefined ? JSON.stringify(entry.payload) : null,
  );
  return Number(info.lastInsertRowid);
}

export function getSeason(userId: number, limit = 100): SeasonEntry[] {
  const teamId = activeTeamId(userId);
  const rows = db
    .prepare(
      "SELECT id, date, kind, title, summary, payload FROM season_entries WHERE user_id = ? AND (team_id IS NULL OR team_id = ?) ORDER BY id DESC LIMIT ?",
    )
    .all(userId, teamId ?? -1, limit) as { id: number; date: string; kind: SeasonEntry["kind"]; title: string; summary: string; payload: string | null }[];
  return rows.map((r) => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : undefined }));
}

// Per-kind season window: each memory category gets its own LIMIT in SQL, so
// a burst of chat entries can never push game or training history out of the
// AI's context — the guarantee teamContext depends on.
export function getSeasonByKinds(userId: number, kinds: string[], limit: number): SeasonEntry[] {
  const teamId = activeTeamId(userId);
  const marks = kinds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, date, kind, title, summary, payload FROM season_entries WHERE user_id = ? AND (team_id IS NULL OR team_id = ?) AND kind IN (${marks}) ORDER BY id DESC LIMIT ?`,
    )
    .all(userId, teamId ?? -1, ...kinds, limit) as { id: number; date: string; kind: SeasonEntry["kind"]; title: string; summary: string; payload: string | null }[];
  return rows.map((r) => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : undefined }));
}

// The coach's most-consulted advisors, from real usage: brainstorms and
// second opinions in the season record. Feeds the weekly staff memo.
export function topAdvisorNames(userId: number, n = 2): string[] {
  const teamId = activeTeamId(userId);
  const rows = db
    .prepare(
      `SELECT title FROM season_entries WHERE user_id = ? AND (team_id IS NULL OR team_id = ?) AND kind = 'chat'
       AND (title LIKE 'Brainstorm with %' OR title LIKE 'Second opinion from %') ORDER BY id DESC LIMIT 200`,
    )
    .all(userId, teamId ?? -1) as { title: string }[];
  const counts = new Map<string, number>();
  for (const r of rows) {
    const name = r.title.replace(/^Brainstorm with /, "").replace(/^Second opinion from /, "");
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name);
}

// Repository detail read: ownership is the USER, not the active team — a
// coach can reopen an artifact from any of their teams.
export function getSeasonEntryById(userId: number, id: number): SeasonEntry | null {
  const r = db
    .prepare("SELECT id, date, kind, title, summary, payload FROM season_entries WHERE user_id = ? AND id = ?")
    .get(userId, id) as { id: number; date: string; kind: SeasonEntry["kind"]; title: string; summary: string; payload: string | null } | undefined;
  return r ? { ...r, payload: r.payload ? JSON.parse(r.payload) : undefined } : null;
}

// Same ownership rule as the read: the user owns their repository entries.
export function deleteSeasonEntry(userId: number, id: number): boolean {
  return db.prepare("DELETE FROM season_entries WHERE user_id = ? AND id = ?").run(userId, id).changes > 0;
}

// ---- coach profile (onboarding demographics) ----
// Who is this coach? Collected once at first login; the role feeds tone
// personalization in every prompt, referral feeds acquisition analytics,
// ZIP feeds the club-density map. All optional, all adult-coach data.
export interface CoachProfile {
  coachRole: string;
  referral: string;
  zip: string;
  clubName: string; // free-text club affiliation — territory intel, independent of in-app club membership
  clubSize: string; // teams in their club (directors) — lead scoring
  challenge: string; // their biggest coaching pain — steers AI emphasis + messaging segment
  clubInterest: boolean; // director tapped "talk to us about club licensing"
}

export function setCoachProfile(userId: number, p: Partial<CoachProfile>): void {
  db.prepare(
    "UPDATE users SET coach_role = ?, referral = ?, zip = ?, club_name = ?, club_size = ?, challenge = ?, club_interest = ? WHERE id = ?",
  ).run(
    String(p.coachRole ?? "").slice(0, 30),
    String(p.referral ?? "").slice(0, 40),
    String(p.zip ?? "").replace(/[^0-9]/g, "").slice(0, 5),
    String(p.clubName ?? "").slice(0, 80),
    String(p.clubSize ?? "").slice(0, 10),
    String(p.challenge ?? "").slice(0, 20),
    p.clubInterest ? 1 : 0,
    userId,
  );
}

export function markClubInterest(userId: number): void {
  db.prepare("UPDATE users SET club_interest = 1 WHERE id = ?").run(userId);
}

export function getCoachProfile(userId: number): CoachProfile {
  const r = db.prepare("SELECT coach_role, referral, zip, club_name, club_size, challenge, club_interest FROM users WHERE id = ?").get(userId) as
    | { coach_role: string | null; referral: string | null; zip: string | null; club_name: string | null; club_size: string | null; challenge: string | null; club_interest: number | null }
    | undefined;
  return {
    coachRole: r?.coach_role ?? "", referral: r?.referral ?? "", zip: r?.zip ?? "",
    clubName: r?.club_name ?? "", clubSize: r?.club_size ?? "", challenge: r?.challenge ?? "",
    clubInterest: Boolean(r?.club_interest),
  };
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
    .get(userId, `${userToday(userId)} 00:00:00`) as { xp: number } | undefined;
  return row?.xp ?? 0;
}

// ---- usage ----
export function getUsage(userId: number): number {
  const row = db.prepare("SELECT messages FROM usage_daily WHERE user_id = ? AND day = ?").get(userId, userToday(userId)) as
    | { messages: number }
    | undefined;
  return row?.messages ?? 0;
}

// A failed generation refunds the message it consumed — the coach's daily
// allowance only pays for answers that actually arrived.
export function refundMessage(userId: number): void {
  db.prepare(
    "UPDATE usage_daily SET messages = MAX(0, messages - 1) WHERE user_id = ? AND day = ?",
  ).run(userId, userToday(userId));
}

export function incrementUsage(userId: number): void {
  db.prepare(
    "INSERT INTO usage_daily (user_id, day, messages) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET messages = messages + 1",
  ).run(userId, userToday(userId));
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
// Library cache is per team: unlocking a card for the U11s doesn't hand the
// same session to the coach's U14s — each team regenerates its own version.
export function getLibraryPlan(userId: number, templateId: string): unknown | null {
  const teamId = activeTeamId(userId);
  const row = db
    .prepare("SELECT data FROM library_plans WHERE user_id = ? AND template_id = ? AND (team_id IS NULL OR team_id = ?)")
    .get(userId, templateId, teamId ?? -1) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function saveLibraryPlan(userId: number, templateId: string, plan: unknown): void {
  db.prepare(
    "INSERT INTO library_plans (user_id, template_id, data, team_id) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, template_id) DO UPDATE SET data = excluded.data, team_id = excluded.team_id",
  ).run(userId, templateId, JSON.stringify(plan), activeTeamId(userId));
}

export function getUnlockedTemplateIds(userId: number): Set<string> {
  const teamId = activeTeamId(userId);
  const rows = db
    .prepare("SELECT template_id FROM library_plans WHERE user_id = ? AND (team_id IS NULL OR team_id = ?)")
    .all(userId, teamId ?? -1) as { template_id: string }[];
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
  const teamId = activeTeamId(userId);
  const del = db.prepare("DELETE FROM schedule_events WHERE user_id = ? AND source = ? AND (team_id IS NULL OR team_id = ?)");
  const ins = db.prepare(
    "INSERT OR REPLACE INTO schedule_events (user_id, team_id, start, title, kind, opponent, location, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const tx = db.transaction(() => {
    del.run(userId, source, teamId ?? -1);
    for (const e of events) ins.run(userId, teamId, e.start, e.title.slice(0, 120), e.kind, e.opponent.slice(0, 80), e.location.slice(0, 120), source);
  });
  tx();
  return events.length;
}

export function countScheduleEvents(userId: number): number {
  const teamId = activeTeamId(userId);
  const r = db.prepare("SELECT COUNT(*) AS n FROM schedule_events WHERE user_id = ? AND (team_id IS NULL OR team_id = ?)").get(userId, teamId ?? -1) as { n: number };
  return r.n;
}

export function addScheduleEvent(userId: number, e: Omit<ScheduleEvent, "id" | "source">): void {
  db.prepare(
    "INSERT OR REPLACE INTO schedule_events (user_id, team_id, start, title, kind, opponent, location, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')",
  ).run(userId, activeTeamId(userId), e.start, e.title.slice(0, 120), e.kind, e.opponent.slice(0, 80), e.location.slice(0, 120));
}

export function deleteScheduleEvent(userId: number, id: number): void {
  db.prepare("DELETE FROM schedule_events WHERE user_id = ? AND id = ?").run(userId, id);
}

export function upcomingEvents(userId: number, days = 14): ScheduleEvent[] {
  const teamId = activeTeamId(userId);
  // start is a floating local wall-clock string, so it must be compared
  // against the coach's local now (with a 2h grace for events in progress),
  // never against server UTC.
  const localNow = new Date(Date.now() + tzOffsetMinutes(userId) * 60_000);
  const from = new Date(localNow.getTime() - 2 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  const to = new Date(localNow.getTime() + days * 86_400_000).toISOString().slice(0, 16).replace("T", " ");
  return db
    .prepare(
      `SELECT id, start, title, kind, opponent, location, source FROM schedule_events
       WHERE user_id = ? AND (team_id IS NULL OR team_id = ?) AND start >= ? AND start <= ?
       ORDER BY start ASC LIMIT 40`,
    )
    .all(userId, teamId ?? -1, from, to) as ScheduleEvent[];
}

export function setTeamSnapToken(userId: number, token: string | null): void {
  db.prepare("UPDATE users SET teamsnap_token = ? WHERE id = ?").run(token, userId);
}

export function getTeamSnapToken(userId: number): string | null {
  const row = db.prepare("SELECT teamsnap_token FROM users WHERE id = ?").get(userId) as { teamsnap_token: string | null } | undefined;
  return row?.teamsnap_token ?? null;
}

// ---- club curriculum (DOC themes per week per age band) ----
export function setCurriculum(clubId: number, rows: { weekStart: string; ageBand: string; theme: string }[]): void {
  const up = db.prepare(
    "INSERT INTO club_curriculum (club_id, week_start, age_band, theme) VALUES (?, ?, ?, ?) ON CONFLICT(club_id, week_start, age_band) DO UPDATE SET theme = excluded.theme",
  );
  const del = db.prepare("DELETE FROM club_curriculum WHERE club_id = ? AND week_start = ? AND age_band = ?");
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (r.theme.trim()) up.run(clubId, r.weekStart, r.ageBand, r.theme.trim().slice(0, 120));
      else del.run(clubId, r.weekStart, r.ageBand);
    }
  });
  tx();
}

export function getCurriculum(clubId: number, fromWeek: string, weeks = 8): { week_start: string; age_band: string; theme: string }[] {
  return db
    .prepare(
      "SELECT week_start, age_band, theme FROM club_curriculum WHERE club_id = ? AND week_start >= ? ORDER BY week_start ASC LIMIT ?",
    )
    .all(clubId, fromWeek, weeks * 8) as { week_start: string; age_band: string; theme: string }[];
}

export function clubThemeFor(clubId: number, weekStartStr: string, ageBand: string): string | null {
  const row = db
    .prepare("SELECT theme FROM club_curriculum WHERE club_id = ? AND week_start = ? AND age_band = ?")
    .get(clubId, weekStartStr, ageBand) as { theme: string } | undefined;
  return row?.theme ?? null;
}

// ---- kv (scheduler state) ----
// ---- timezone: day boundaries follow the coach's clock, not UTC ----
// The client reports its UTC offset (minutes east) once per session; every
// daily boundary — streaks, quests, caps, briefings, "upcoming" — uses it.
// A US-Eastern coach's day must not flip at 7pm local.
export function setUserTz(userId: number, offsetMinutes: number): void {
  const v = Math.max(-840, Math.min(840, Math.round(offsetMinutes)));
  kvSet(`tz:${userId}`, String(v));
}

export function tzOffsetMinutes(userId: number): number {
  const v = Number(kvGet(`tz:${userId}`));
  return Number.isFinite(v) ? v : 0;
}

export function userToday(userId: number, deltaDays = 0): string {
  return new Date(Date.now() + tzOffsetMinutes(userId) * 60_000 + deltaDays * 86_400_000).toISOString().slice(0, 10);
}


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

// ---- compute cost estimation ----
// List $/1M-token rates per model. Cached-input discounts are deliberately
// ignored, so estimates run slightly HIGH — the right direction for a
// spending ceiling. Prefix-matched so dated model ids still resolve.
const MODEL_RATES: [string, { in: number; out: number }][] = [
  ["claude-haiku-4-5", { in: 1, out: 5 }],
  ["claude-sonnet-5", { in: 3, out: 15 }],
  ["claude-fable-5", { in: 10, out: 50 }],
  ["claude-opus", { in: 5, out: 25 }],
  ["gpt-5-mini", { in: 0.25, out: 2 }],
  ["gpt-5.1", { in: 1.25, out: 10 }],
];

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_RATES.find(([prefix]) => model.startsWith(prefix))?.[1] ?? { in: 3, out: 15 };
  return (inputTokens * rate.in + outputTokens * rate.out) / 1_000_000;
}

function estCostWhere(where: string, ...params: unknown[]): number {
  const rows = db
    .prepare(`SELECT model, SUM(input_tokens) i, SUM(output_tokens) o FROM model_calls WHERE ${where} GROUP BY model`)
    .all(...params) as { model: string; i: number; o: number }[];
  return rows.reduce((sum, r) => sum + estimateCost(r.model, r.i, r.o), 0);
}

// Estimated $ this user has spent on model calls today (UTC day — a ceiling
// backstop, not a billing statement, so the boundary doesn't need to be local).
export function estCostToday(userId: number): number {
  return estCostWhere("user_id = ? AND t >= date('now')", userId);
}

// ---- founder admin overview: spend + acquisition + club-sales leads ----
export interface AdminOverview {
  totals: { users: number; pro: number; clubs: number; teams: number; signups7d: number };
  spend: {
    todayUsd: number;
    monthUsd: number;
    topUsers: { name: string; email: string; plan: string; calls: number; inputTokens: number; outputTokens: number; estUsd: number }[];
  };
  acquisition: { byReferral: Record<string, number>; byRole: Record<string, number> };
  leads: { name: string; email: string; clubName: string; clubSize: string; zip: string; clubInterest: boolean; createdAt: string }[];
  density: { clubs: { name: string; coaches: number }[]; zips: { zip: string; coaches: number }[] };
}

export function adminOverview(): AdminOverview {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const group = (col: string) =>
    Object.fromEntries(
      (db.prepare(`SELECT ${col} k, COUNT(*) n FROM users WHERE ${col} != '' GROUP BY ${col} ORDER BY n DESC`).all() as { k: string; n: number }[])
        .map((r) => [r.k, r.n]),
    );
  // Per-user, per-model sums this month -> priced in JS, top spenders first.
  const spendRows = db
    .prepare(
      `SELECT m.user_id uid, m.model, SUM(m.input_tokens) i, SUM(m.output_tokens) o, COUNT(*) c, u.name, u.email, u.plan
       FROM model_calls m JOIN users u ON u.id = m.user_id
       WHERE m.t >= date('now','start of month') GROUP BY m.user_id, m.model`,
    )
    .all() as { uid: number; model: string; i: number; o: number; c: number; name: string; email: string; plan: string }[];
  const byUser = new Map<number, AdminOverview["spend"]["topUsers"][number]>();
  for (const r of spendRows) {
    const u = byUser.get(r.uid) ?? { name: r.name, email: r.email, plan: r.plan, calls: 0, inputTokens: 0, outputTokens: 0, estUsd: 0 };
    u.calls += r.c;
    u.inputTokens += r.i;
    u.outputTokens += r.o;
    u.estUsd += estimateCost(r.model, r.i, r.o);
    byUser.set(r.uid, u);
  }
  const topUsers = [...byUser.values()].sort((a, b) => b.estUsd - a.estUsd).slice(0, 15);
  return {
    totals: {
      users: n("SELECT COUNT(*) n FROM users"),
      pro: n("SELECT COUNT(*) n FROM users WHERE plan = 'pro'"),
      clubs: n("SELECT COUNT(*) n FROM clubs"),
      teams: n("SELECT COUNT(*) n FROM teams"),
      signups7d: n("SELECT COUNT(*) n FROM users WHERE created_at >= datetime('now','-7 days')"),
    },
    spend: {
      todayUsd: estCostWhere("t >= date('now')"),
      monthUsd: estCostWhere("t >= date('now','start of month')"),
      topUsers,
    },
    acquisition: { byReferral: group("referral"), byRole: group("coach_role") },
    leads: (db
      .prepare(
        `SELECT name, email, club_name, club_size, zip, club_interest, created_at FROM users
         WHERE coach_role = 'director' OR club_interest = 1 ORDER BY club_interest DESC, created_at DESC LIMIT 50`,
      )
      .all() as { name: string; email: string; club_name: string; club_size: string; zip: string; club_interest: number; created_at: string }[])
      .map((r) => ({ name: r.name, email: r.email, clubName: r.club_name, clubSize: r.club_size, zip: r.zip, clubInterest: Boolean(r.club_interest), createdAt: r.created_at })),
    density: {
      clubs: (db
        .prepare("SELECT club_name name, COUNT(*) coaches FROM users WHERE club_name != '' GROUP BY LOWER(club_name) HAVING coaches >= 2 ORDER BY coaches DESC LIMIT 20")
        .all() as { name: string; coaches: number }[]),
      zips: (db
        .prepare("SELECT zip, COUNT(*) coaches FROM users WHERE zip != '' GROUP BY zip HAVING coaches >= 2 ORDER BY coaches DESC LIMIT 20")
        .all() as { zip: string; coaches: number }[]),
    },
  };
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

// Ownership check for the comment routes: a coach may only touch threads on
// their OWN club's sessions — the session id in the URL is not trusted.
export function clubSessionBelongsTo(sessionId: number, clubId: number): boolean {
  return Boolean(db.prepare("SELECT 1 FROM club_sessions WHERE id = ? AND club_id = ?").get(sessionId, clubId));
}

export function getClubComments(sessionId: number): ClubComment[] {
  return db
    .prepare("SELECT c.id, c.text, c.created_at, u.name AS author FROM club_comments c JOIN users u ON u.id = c.user_id WHERE c.session_id = ? ORDER BY c.id")
    .all(sessionId) as ClubComment[];
}
