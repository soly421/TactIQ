import { getProgress, kvGet, kvSet, pushXpHistory, saveProgress, userToday, type Progress } from "./store.js";
import { recordQuestProgress, type QuestDef } from "./quests.js";
import { weekStart } from "./community.js";

// One automatic streak freeze per week: miss exactly one day and the flame
// survives. Life happens; punishing a single missed Tuesday kills streaks
// (and retention) for no reason. Miss two days and it's a genuine reset.
export function streakFreezeAvailable(userId: number): boolean {
  return kvGet(`freeze:${userId}:${weekStart()}`) === null;
}

export const FREE_DAILY_MESSAGES = 30;

export type XpAction = "chat" | "session" | "formation" | "guidance" | "squad" | "advisor-built" | "library" | "matchday" | "rate" | "film" | "board" | "debate" | "staff";

const XP_RULES: Record<XpAction, number> = {
  staff: 12,
  chat: 5,
  session: 50,
  formation: 40,
  guidance: 25,
  squad: 15,
  "advisor-built": 60,
  library: 35,
  matchday: 45,
  rate: 2,
  film: 45,
  board: 8,
  debate: 10,
};

export const LEVELS = [
  { level: 1, xp: 0, title: "Volunteer" },
  { level: 2, xp: 100, title: "Rookie Coach" },
  { level: 3, xp: 250, title: "Assistant Coach" },
  { level: 4, xp: 500, title: "Head Coach" },
  { level: 5, xp: 1000, title: "Tactician" },
  { level: 6, xp: 2000, title: "Strategist" },
  { level: 7, xp: 3500, title: "Technical Director" },
  { level: 8, xp: 5500, title: "Maestro" },
  { level: 9, xp: 8000, title: "Visionary" },
  { level: 10, xp: 12000, title: "Legend" },
];

export interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  earned: (p: Progress) => boolean;
}

export const BADGES: BadgeDef[] = [
  { id: "first-session", name: "First Whistle", emoji: "📣", description: "Generate your first training session", earned: (p) => (p.counts.session ?? 0) >= 1 },
  { id: "session-5", name: "Session Machine", emoji: "⚙️", description: "Generate 5 training sessions", earned: (p) => (p.counts.session ?? 0) >= 5 },
  { id: "session-20", name: "Curriculum Builder", emoji: "🏗️", description: "Generate 20 training sessions", earned: (p) => (p.counts.session ?? 0) >= 20 },
  { id: "first-formation", name: "Shape Shifter", emoji: "🔷", description: "Run your first formation analysis", earned: (p) => (p.counts.formation ?? 0) >= 1 },
  { id: "philosopher", name: "Philosopher", emoji: "🧠", description: "Brainstorm with 5 different advisors", earned: (p) => p.advisorsUsed.length >= 5 },
  { id: "round-table", name: "Round Table", emoji: "⚔️", description: "Brainstorm with 12 different advisors", earned: (p) => p.advisorsUsed.length >= 12 },
  { id: "scholar", name: "Scholar", emoji: "📚", description: "Get tactical guidance 3 times", earned: (p) => (p.counts.guidance ?? 0) >= 3 },
  { id: "streak-3", name: "On Fire", emoji: "🔥", description: "3-day coaching streak", earned: (p) => p.streak >= 3 },
  { id: "streak-7", name: "Unstoppable", emoji: "💥", description: "7-day coaching streak", earned: (p) => p.streak >= 7 },
  { id: "squad-set", name: "Squad Assembled", emoji: "🛡️", description: "Set up your team profile", earned: (p) => (p.counts.squad ?? 0) >= 1 },
  { id: "creator", name: "Mad Scientist", emoji: "🧬", description: "Build your own custom advisor", earned: (p) => (p.counts["advisor-built"] ?? 0) >= 1 },
  { id: "librarian", name: "Librarian", emoji: "📖", description: "Unlock 3 sessions from the Library", earned: (p) => (p.counts.library ?? 0) >= 3 },
  { id: "gameday", name: "Game Day Ready", emoji: "📣", description: "Prepare your first match with Match Day", earned: (p) => (p.counts.matchday ?? 0) >= 1 },
  { id: "full-staff", name: "Full Staff", emoji: "🎬", description: "Run pre-game, live, and post-game in Match Day", earned: (p) => (p.counts.matchday ?? 0) >= 3 },
  { id: "quality-scout", name: "Quality Scout", emoji: "🔎", description: "Rate 10 outputs to sharpen TactIQ", earned: (p) => (p.counts.rate ?? 0) >= 10 },
  { id: "film-analyst", name: "Film Analyst", emoji: "🎞️", description: "Analyze your first video clip in the Film Room", earned: (p) => (p.counts.film ?? 0) >= 1 },
  { id: "grandmaster", name: "Grandmaster", emoji: "♟️", description: "Get 25 engine reads on the tactics board", earned: (p) => (p.counts.board ?? 0) >= 25 },
];

export function levelFor(xp: number) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) current = l;
  const next = LEVELS.find((l) => l.xp > xp) ?? null;
  return { ...current, nextXp: next?.xp ?? null, nextTitle: next?.title ?? null };
}

export interface AwardResult {
  xpGained: number;
  newBadges: { id: string; name: string; emoji: string; description: string }[];
  questsCompleted: { id: string; title: string; emoji: string; bonusXp: number }[];
  leveledUp: boolean;
}

export function award(userId: number, action: XpAction, advisorId?: string): AwardResult {
  const p = getProgress(userId);
  const before = levelFor(p.xp).level;

  const t = userToday(userId);
  if (p.lastActiveDay !== t) {
    const yesterday = userToday(userId, -1);
    const dayBefore = userToday(userId, -2);
    if (p.lastActiveDay === yesterday) {
      p.streak += 1;
    } else if (p.lastActiveDay === dayBefore && streakFreezeAvailable(userId)) {
      // Missed exactly one day — burn this week's automatic streak freeze.
      kvSet(`freeze:${userId}:${weekStart()}`, "used");
      p.streak += 1;
    } else {
      p.streak = 1;
    }
    p.lastActiveDay = t;
  }

  let gained = XP_RULES[action];
  p.counts[action] = (p.counts[action] ?? 0) + 1;
  if (advisorId && !p.advisorsUsed.includes(advisorId)) p.advisorsUsed.push(advisorId);

  const questsCompleted: QuestDef[] = recordQuestProgress(userId, action);
  gained += questsCompleted.reduce((a, q) => a + q.bonusXp, 0);
  p.xp += gained;

  const newBadges = BADGES.filter((b) => !p.badges.includes(b.id) && b.earned(p)).map((b) => {
    p.badges.push(b.id);
    return { id: b.id, name: b.name, emoji: b.emoji, description: b.description };
  });

  saveProgress(userId, p);
  pushXpHistory(userId, p.xp);

  return {
    xpGained: gained,
    newBadges,
    questsCompleted: questsCompleted.map((q) => ({ id: q.id, title: q.title, emoji: q.emoji, bonusXp: q.bonusXp })),
    leveledUp: levelFor(p.xp).level > before,
  };
}
