import { db } from "./db.js";
import { userToday } from "./store.js";
import type { XpAction } from "./gamification.js";

export interface QuestDef {
  id: string;
  title: string;
  emoji: string;
  action: XpAction;
  target: number;
  bonusXp: number;
}

const QUEST_POOL: QuestDef[] = [
  { id: "chat-3", title: "Brainstorm 3 messages with any advisor", emoji: "💬", action: "chat", target: 3, bonusXp: 30 },
  { id: "session-1", title: "Design a training session", emoji: "📋", action: "session", target: 1, bonusXp: 40 },
  { id: "formation-1", title: "Run a formation analysis", emoji: "🔷", action: "formation", target: 1, bonusXp: 35 },
  { id: "guidance-1", title: "Get tactical guidance in the Playbook", emoji: "💡", action: "guidance", target: 1, bonusXp: 25 },
  { id: "library-1", title: "Unlock a session from the Library", emoji: "📚", action: "library", target: 1, bonusXp: 35 },
  { id: "matchday-1", title: "Use Match Day (pre, live, or post)", emoji: "📣", action: "matchday", target: 1, bonusXp: 40 },
  { id: "chat-5", title: "Have a 5-message tactics debate", emoji: "🗣️", action: "chat", target: 5, bonusXp: 45 },
  { id: "rate-3", title: "Rate 3 outputs (👍/👎)", emoji: "🔎", action: "rate", target: 3, bonusXp: 20 },
  { id: "film-1", title: "Break down a clip in the Film Room", emoji: "🎞️", action: "film", target: 1, bonusXp: 40 },
];

// Deterministic 3 quests per day, seeded by the coach's LOCAL day so the set
// never reshuffles mid-evening when UTC rolls over.
export function questsForToday(userId: number): QuestDef[] {
  const d = userToday(userId);
  const seed = [...d].reduce((a, c) => a + c.charCodeAt(0), 0);
  const picks: QuestDef[] = [];
  for (let i = 0; picks.length < 3 && i < QUEST_POOL.length * 3; i++) {
    const q = QUEST_POOL[(seed + i * 3 + i) % QUEST_POOL.length];
    if (!picks.some((p) => p.id === q.id)) picks.push(q);
  }
  return picks;
}

export interface QuestState extends QuestDef {
  progress: number;
  done: boolean;
}

export function questState(userId: number): QuestState[] {
  const d = userToday(userId);
  return questsForToday(userId).map((q) => {
    const row = db
      .prepare("SELECT progress, done FROM quest_log WHERE user_id = ? AND day = ? AND quest_id = ?")
      .get(userId, d, q.id) as { progress: number; done: number } | undefined;
    return { ...q, progress: row?.progress ?? 0, done: Boolean(row?.done) };
  });
}

// Called from award(): bump matching quests; return completed quests (for bonus XP).
export function recordQuestProgress(userId: number, action: XpAction): QuestDef[] {
  const d = userToday(userId);
  const completed: QuestDef[] = [];
  for (const q of questsForToday(userId)) {
    if (q.action !== action) continue;
    db.prepare(
      "INSERT INTO quest_log (user_id, day, quest_id, progress) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, day, quest_id) DO UPDATE SET progress = progress + 1",
    ).run(userId, d, q.id);
    const row = db
      .prepare("SELECT progress, done FROM quest_log WHERE user_id = ? AND day = ? AND quest_id = ?")
      .get(userId, d, q.id) as { progress: number; done: number };
    if (row.progress >= q.target && !row.done) {
      db.prepare("UPDATE quest_log SET done = 1 WHERE user_id = ? AND day = ? AND quest_id = ?").run(userId, d, q.id);
      completed.push(q);
    }
  }
  return completed;
}
