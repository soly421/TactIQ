import { db } from "./db.js";
import { kvGet, kvSet } from "./store.js";

// ============================================================================
// The competition layer — the Duolingo engine, coaching-flavored.
//
// Weekly leagues: every coach sits in a license tier and competes on XP
// earned THIS WEEK (resets Monday 00:00 UTC). Top 20% promote, bottom 20%
// demote. Weekly XP means a brand-new coach can beat a 12,000-XP veteran —
// the ladder is always winnable, which is what makes it addictive.
//
// The Club Cup: clubs ranked by their coaches' combined weekly XP.
// Individual competition drives daily opens; club pride drives peer pressure.
// ============================================================================

export const LEAGUES = [
  { tier: 0, name: "Grassroots League", emoji: "🌱" },
  { tier: 1, name: "D License League", emoji: "🥉" },
  { tier: 2, name: "C License League", emoji: "🥈" },
  { tier: 3, name: "B License League", emoji: "🥇" },
  { tier: 4, name: "A License League", emoji: "🏅" },
  { tier: 5, name: "Pro License League", emoji: "💼" },
  { tier: 6, name: "Legends League", emoji: "👑" },
] as const;

// Monday 00:00 UTC of the current week — the league epoch.
export function weekStart(d = new Date()): string {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(d.getTime() - day * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

function nextMonday(): string {
  const ws = new Date(`${weekStart()}T00:00:00Z`);
  return new Date(ws.getTime() + 7 * 86_400_000).toISOString();
}

// XP earned since the week began, from the cumulative xp_history snapshots.
function weeklyXpFor(userId: number, currentXp: number): number {
  const row = db
    .prepare("SELECT xp FROM xp_history WHERE user_id = ? AND t < ? ORDER BY id DESC LIMIT 1")
    .get(userId, `${weekStart()} 00:00:00`) as { xp: number } | undefined;
  return Math.max(0, currentXp - (row?.xp ?? 0));
}

interface Standing {
  userId: number;
  name: string;
  weeklyXp: number;
  streak: number;
}

function leagueStandings(tier: number): Standing[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, p.xp, p.streak FROM users u JOIN progress p ON p.user_id = u.id
       WHERE p.league = ? AND p.last_active_day >= date('now', '-30 days')`,
    )
    .all(tier) as { id: number; name: string; xp: number; streak: number }[];
  return rows
    .map((r) => ({ userId: r.id, name: r.name, weeklyXp: weeklyXpFor(r.id, r.xp), streak: r.streak }))
    .sort((a, b) => b.weeklyXp - a.weeklyXp);
}

function zoneSizes(n: number): { promote: number; demote: number } {
  if (n < 2) return { promote: 0, demote: 0 };
  return { promote: Math.max(1, Math.floor(n * 0.2)), demote: n >= 5 ? Math.max(1, Math.floor(n * 0.2)) : 0 };
}

// Roll the league over when a new week begins. Lazy-evaluated on read, so it
// needs no dedicated scheduler and can't be missed.
export function maybeFinalizeWeek(): void {
  const ws = weekStart();
  if (kvGet("league:week") === ws) return;
  kvSet("league:week", ws);
  // Promote/demote based on LAST week's final standings (weekly XP as of now,
  // which at rollover time is last week's total since the epoch just moved).
  const promoteTo = db.prepare("UPDATE progress SET league = ? WHERE user_id = ?");
  for (const { tier } of LEAGUES) {
    const standings = leagueStandingsLastWeek(tier);
    const { promote, demote } = zoneSizes(standings.length);
    standings.slice(0, promote).forEach((s) => {
      if (tier < LEAGUES.length - 1 && s.weeklyXp > 0) promoteTo.run(tier + 1, s.userId);
    });
    standings.slice(standings.length - demote).forEach((s) => {
      if (tier > 0) promoteTo.run(tier - 1, s.userId);
    });
  }
  console.log(`[league] week ${ws} finalized — promotions and demotions applied`);
}

function leagueStandingsLastWeek(tier: number): Standing[] {
  const lastWeekStart = new Date(new Date(`${weekStart()}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const rows = db
    .prepare(
      `SELECT u.id, u.name, p.xp, p.streak FROM users u JOIN progress p ON p.user_id = u.id
       WHERE p.league = ? AND p.last_active_day >= date('now', '-30 days')`,
    )
    .all(tier) as { id: number; name: string; xp: number; streak: number }[];
  return rows
    .map((r) => {
      const before = db
        .prepare("SELECT xp FROM xp_history WHERE user_id = ? AND t < ? ORDER BY id DESC LIMIT 1")
        .get(r.id, `${lastWeekStart} 00:00:00`) as { xp: number } | undefined;
      const atWeekEnd = db
        .prepare("SELECT xp FROM xp_history WHERE user_id = ? AND t < ? ORDER BY id DESC LIMIT 1")
        .get(r.id, `${weekStart()} 00:00:00`) as { xp: number } | undefined;
      return { userId: r.id, name: r.name, weeklyXp: Math.max(0, (atWeekEnd?.xp ?? 0) - (before?.xp ?? 0)), streak: r.streak };
    })
    .sort((a, b) => b.weeklyXp - a.weeklyXp);
}

export function communitySnapshot(userId: number): {
  league: {
    tier: number;
    name: string;
    emoji: string;
    resetsAt: string;
    promoteCount: number;
    demoteCount: number;
    standings: { rank: number; name: string; weeklyXp: number; streak: number; you: boolean; zone: "promote" | "safe" | "demote" }[];
  };
  clubCup: { rank: number; club: string; weeklyXp: number; coaches: number; yours: boolean }[];
  recap: { weeklyXp: number; weeklyRank: number };
} {
  maybeFinalizeWeek();
  const me = db.prepare("SELECT p.league, p.xp, u.club_id FROM progress p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?").get(userId) as
    | { league: number; xp: number; club_id: number | null }
    | undefined;
  const tier = Math.min(me?.league ?? 0, LEAGUES.length - 1);
  const standings = leagueStandings(tier);
  const { promote, demote } = zoneSizes(standings.length);
  const league = {
    tier,
    name: LEAGUES[tier].name,
    emoji: LEAGUES[tier].emoji,
    resetsAt: nextMonday(),
    promoteCount: promote,
    demoteCount: demote,
    standings: standings.slice(0, 25).map((s, i) => ({
      rank: i + 1,
      name: s.name,
      weeklyXp: s.weeklyXp,
      streak: s.streak,
      you: s.userId === userId,
      zone: (i < promote ? "promote" : i >= standings.length - demote ? "demote" : "safe") as "promote" | "safe" | "demote",
    })),
  };

  const clubRows = db
    .prepare(
      `SELECT c.id, c.name, u.id AS user_id, p.xp FROM clubs c
       JOIN users u ON u.club_id = c.id JOIN progress p ON p.user_id = u.id
       WHERE p.last_active_day >= date('now', '-30 days')`,
    )
    .all() as { id: number; name: string; user_id: number; xp: number }[];
  const byClub = new Map<number, { club: string; weeklyXp: number; coaches: number; yours: boolean }>();
  for (const r of clubRows) {
    const entry = byClub.get(r.id) ?? { club: r.name, weeklyXp: 0, coaches: 0, yours: r.id === me?.club_id };
    entry.weeklyXp += weeklyXpFor(r.user_id, r.xp);
    entry.coaches += 1;
    byClub.set(r.id, entry);
  }
  const clubCup = [...byClub.values()]
    .sort((a, b) => b.weeklyXp - a.weeklyXp)
    .slice(0, 15)
    .map((c, i) => ({ rank: i + 1, ...c }));

  const weeklyXp = weeklyXpFor(userId, me?.xp ?? 0);
  const weeklyRank = standings.findIndex((s) => s.userId === userId) + 1;
  return { league, clubCup, recap: { weeklyXp, weeklyRank: weeklyRank || standings.length + 1 } };
}
