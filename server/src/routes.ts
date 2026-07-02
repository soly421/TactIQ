import { Router } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { ADVISORS, advisorSystemPrompt, getAdvisor } from "./personas.js";
import { baseSystemPrompt } from "./knowledge.js";
import { SESSION_PLAN_SCHEMA, FORMATION_ANALYSIS_SCHEMA } from "./schemas.js";
import { generateStructured, streamToSSE, teamContext } from "./generate.js";
import { MOCK_CHAT_REPLY, MOCK_FORMATION, MOCK_GUIDANCE, MOCK_SESSION_PLAN } from "./mock.js";
import { addSeasonEntry, loadStore, rollUsage, saveStore, type SquadProfile } from "./store.js";
import { award, BADGES, FREE_DAILY_MESSAGES, levelFor } from "./gamification.js";
import { hasApiKey, MODEL } from "./anthropic.js";

export const api = Router();

api.get("/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, live: hasApiKey });
});

api.get("/advisors", (_req, res) => {
  res.json(ADVISORS.map(({ style, ...pub }) => ({ ...pub })));
});

function consumeMessage(): { ok: boolean; remaining: number } {
  const store = loadStore();
  rollUsage(store);
  if (store.usage.messages >= FREE_DAILY_MESSAGES) {
    return { ok: false, remaining: 0 };
  }
  store.usage.messages += 1;
  saveStore();
  return { ok: true, remaining: FREE_DAILY_MESSAGES - store.usage.messages };
}

// ---- Advisor brainstorm chat (SSE) ----
api.post("/chat", async (req, res) => {
  const { advisorId, messages } = req.body as {
    advisorId: string;
    messages: { role: "user" | "assistant"; content: string }[];
  };
  const advisor = getAdvisor(advisorId);
  if (!advisor || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "advisorId and messages are required" });
    return;
  }
  const quota = consumeMessage();
  if (!quota.ok) {
    res.status(429).json({ error: `Daily free limit of ${FREE_DAILY_MESSAGES} messages reached. Resets tomorrow.` });
    return;
  }
  const gamify = award("chat", advisor.id);

  await streamToSSE(res, {
    system: advisorSystemPrompt(advisor, teamContext()),
    messages: messages as Anthropic.Beta.BetaMessageParam[],
    maxTokens: 6000,
    mockText: MOCK_CHAT_REPLY,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: (full) => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      addSeasonEntry({
        kind: "chat",
        title: `Brainstorm with ${advisor.name}`,
        summary: (lastUser?.content ?? "").slice(0, 120),
      });
      void full;
    },
  });
});

// ---- Training session generation (structured + visualized) ----
api.post("/session-plan", async (req, res) => {
  const { ageGroup, playersAvailable, durationMinutes, theme, level, notes } = req.body ?? {};
  if (!ageGroup || !theme) {
    res.status(400).json({ error: "ageGroup and theme are required" });
    return;
  }
  try {
    const plan = await generateStructured<typeof MOCK_SESSION_PLAN>({
      system: `${baseSystemPrompt()}${teamContext()}

You design world-class youth training sessions. Every drill must include a renderable diagram on a 100x100 grid (y=0 is the top of the drill area). Place players, cones, balls, goals, and 2-5 movement arrows that show the KEY picture of the activity. Diagrams must be realistic: sensible spacing, correct player counts matching the organization text. Follow the arrival -> technical -> pressure -> game arc. Total drill minutes must equal the requested duration.`,
      user: `Design a training session:
- Age group: ${ageGroup}
- Players available: ${playersAvailable || "unknown"}
- Duration: ${durationMinutes || 75} minutes
- Theme / focus: ${theme}
- Team level: ${level || "recreational travel"}
- Extra notes: ${notes || "none"}`,
      schema: SESSION_PLAN_SCHEMA as unknown as Record<string, unknown>,
      mock: MOCK_SESSION_PLAN,
    });

    const gamify = award("session");
    addSeasonEntry({ kind: "session", title: plan.title, summary: `${plan.ageGroup} · ${plan.theme}`, payload: plan });
    res.json({ plan, award: gamify });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

// ---- Formation lab (structured) ----
api.post("/formation", async (req, res) => {
  const { format, ageGroup, style, squadNotes, opponentNotes } = req.body ?? {};
  if (!format || !ageGroup) {
    res.status(400).json({ error: "format and ageGroup are required" });
    return;
  }
  try {
    const analysis = await generateStructured<typeof MOCK_FORMATION>({
      system: `${baseSystemPrompt()}${teamContext()}

You recommend formations and game models for youth teams. Positions are placed on a 100x100 grid where y=0 is the OPPONENT'S goal (attacking direction is up) and y=100 is your own goal line. GK around y=90-94. Spacing must look like a real team shape.`,
      user: `Recommend and analyze a formation:
- Game format: ${format}
- Age group: ${ageGroup}
- Desired playing style: ${style || "coach is open to suggestions"}
- Squad characteristics: ${squadNotes || "typical mixed-ability youth squad"}
- Opponent/league context: ${opponentNotes || "none"}`,
      schema: FORMATION_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 16000,
      mock: MOCK_FORMATION,
    });

    const gamify = award("formation");
    addSeasonEntry({
      kind: "formation",
      title: `Formation: ${analysis.recommendedFormation}`,
      summary: `${ageGroup} ${format} · ${style || "open style"}`,
      payload: analysis,
    });
    res.json({ analysis, award: gamify });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

// ---- Guided tactical advice (SSE) ----
api.post("/guidance", async (req, res) => {
  const { ageGroup, level, topic, question } = req.body ?? {};
  if (!ageGroup || !question) {
    res.status(400).json({ error: "ageGroup and question are required" });
    return;
  }
  const quota = consumeMessage();
  if (!quota.ok) {
    res.status(429).json({ error: `Daily free limit of ${FREE_DAILY_MESSAGES} messages reached. Resets tomorrow.` });
    return;
  }
  const gamify = award("guidance");

  await streamToSSE(res, {
    system: `${baseSystemPrompt()}${teamContext()}

You are answering a structured coaching question. Respond in clean markdown with exactly these sections:
## The Picture  (what's really happening, tactically — 2-3 sentences)
## The Fix  (your specific tactical/coaching answer, concrete and age-appropriate)
## Train It  (2-3 practical activities with area sizes, player counts, rules, and coaching points)
## Say This To Your Players  (the exact age-appropriate words/pictures to use)`,
    messages: [
      {
        role: "user",
        content: `Age group: ${ageGroup}\nLevel: ${level || "recreational"}\nTopic: ${topic || "general"}\nQuestion: ${question}`,
      },
    ],
    maxTokens: 6000,
    mockText: MOCK_GUIDANCE,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: () => {
      addSeasonEntry({ kind: "guidance", title: topic || "Tactical guidance", summary: String(question).slice(0, 120) });
    },
  });
});

// ---- Team profile (season-long memory) ----
api.get("/team", (_req, res) => {
  res.json({ squad: loadStore().squad });
});

api.put("/team", (req, res) => {
  const store = loadStore();
  const s = req.body as SquadProfile;
  if (!s?.teamName || !s?.ageGroup) {
    res.status(400).json({ error: "teamName and ageGroup are required" });
    return;
  }
  store.squad = {
    teamName: s.teamName,
    ageGroup: s.ageGroup,
    format: s.format || "9v9",
    level: s.level || "rec",
    preferredStyle: s.preferredStyle || "",
    rosterNotes: s.rosterNotes || "",
    seasonGoals: s.seasonGoals || "",
  };
  saveStore();
  const gamify = award("squad");
  res.json({ squad: store.squad, award: gamify });
});

api.get("/season", (_req, res) => {
  res.json({ season: loadStore().season });
});

// ---- Gamified progress ----
const MOCK_LEADERBOARD = [
  { name: "Coach Martinez", xp: 4210 },
  { name: "Coach Kim", xp: 3380 },
  { name: "Coach Okafor", xp: 2115 },
  { name: "Coach Rossi", xp: 1540 },
  { name: "Coach Nguyen", xp: 890 },
  { name: "Coach Baker", xp: 430 },
  { name: "Coach Silva", xp: 160 },
];

api.get("/progress", (_req, res) => {
  const store = loadStore();
  rollUsage(store);
  const p = store.progress;
  const lvl = levelFor(p.xp);
  const leaderboard = [...MOCK_LEADERBOARD, { name: "You", xp: p.xp }]
    .sort((a, b) => b.xp - a.xp)
    .map((row, i) => ({ rank: i + 1, ...row, you: row.name === "You" }));

  res.json({
    xp: p.xp,
    level: lvl,
    streak: p.streak,
    counts: p.counts,
    advisorsUsed: p.advisorsUsed.length,
    badges: BADGES.map((b) => ({
      id: b.id,
      name: b.name,
      emoji: b.emoji,
      description: b.description,
      earned: p.badges.includes(b.id),
    })),
    usage: { used: store.usage.messages, limit: FREE_DAILY_MESSAGES },
    leaderboard,
  });
});
