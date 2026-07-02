import { loadStore, saveStore, today, type Progress } from "./store.js";

export const FREE_DAILY_MESSAGES = 30;

export type XpAction = "chat" | "session" | "formation" | "guidance" | "squad";

const XP_RULES: Record<XpAction, number> = {
  chat: 5,
  session: 50,
  formation: 40,
  guidance: 25,
  squad: 15,
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
  leveledUp: boolean;
}

export function award(action: XpAction, advisorId?: string): AwardResult {
  const store = loadStore();
  const p = store.progress;
  const before = levelFor(p.xp).level;

  // streak
  const t = today();
  if (p.lastActiveDay !== t) {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    p.streak = p.lastActiveDay === yesterday ? p.streak + 1 : 1;
    p.lastActiveDay = t;
  }

  p.xp += XP_RULES[action];
  p.counts[action] = (p.counts[action] ?? 0) + 1;
  if (advisorId && !p.advisorsUsed.includes(advisorId)) p.advisorsUsed.push(advisorId);

  const newBadges = BADGES.filter((b) => !p.badges.includes(b.id) && b.earned(p)).map((b) => {
    p.badges.push(b.id);
    return { id: b.id, name: b.name, emoji: b.emoji, description: b.description };
  });

  saveStore();
  return { xpGained: XP_RULES[action], newBadges, leveledUp: levelFor(p.xp).level > before };
}
