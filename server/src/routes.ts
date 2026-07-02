import { Router } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { ADVISORS, advisorSystemPrompt, assistantSystemPrompt, customAdvisorSystemPrompt, getAdvisor } from "./personas.js";
import { baseSystemPrompt } from "./knowledge.js";
import { SESSION_PLAN_SCHEMA, FORMATION_ANALYSIS_SCHEMA, GAME_PLAN_SCHEMA } from "./schemas.js";
import { generateStructured, streamToSSE, teamContext, userContent } from "./generate.js";
import { MOCK_CHAT_REPLY, MOCK_DEBRIEF, MOCK_FORMATION, MOCK_GAME_PLAN, MOCK_GUIDANCE, MOCK_LIVE_REPLY, MOCK_SESSION_PLAN } from "./mock.js";
import { addSeasonEntry, loadStore, rollUsage, saveStore, type CustomAdvisor, type SquadProfile } from "./store.js";
import { award, BADGES, FREE_DAILY_MESSAGES, levelFor } from "./gamification.js";
import { engineFor, hasApiKey, type Plan } from "./anthropic.js";
import { SCHOOLS, SESSION_TEMPLATES, getTemplate } from "./library.js";

export const api = Router();

const PRO_DAILY_MESSAGES = 300;

function plan(): Plan {
  return loadStore().settings.plan;
}

function dailyLimit(): number {
  return plan() === "pro" ? PRO_DAILY_MESSAGES : FREE_DAILY_MESSAGES;
}

api.get("/health", (_req, res) => {
  res.json({ ok: true, live: hasApiKey, plan: plan(), chatModel: engineFor(plan(), "chat"), structuredModel: engineFor(plan(), "structured") });
});

// ---- Advisors (built-in + custom) ----
api.get("/advisors", (_req, res) => {
  const builtIn = ADVISORS.map(({ style, ...pub }) => ({ ...pub, custom: false }));
  const custom = loadStore().customAdvisors.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    tagline: c.tagline,
    category: c.category,
    goodFor: c.goodFor,
    formats: ["4v4", "7v7", "9v9", "11v11", "HS"],
    custom: true,
  }));
  res.json([...custom, ...builtIn]);
});

api.post("/advisors/custom", (req, res) => {
  const { name, emoji, tagline, category, goodFor, philosophy } = req.body ?? {};
  if (!name || !philosophy) {
    res.status(400).json({ error: "name and philosophy are required" });
    return;
  }
  const store = loadStore();
  const adv: CustomAdvisor = {
    id: `custom-${Math.random().toString(36).slice(2, 8)}`,
    name: String(name).slice(0, 40),
    emoji: String(emoji || "🧠").slice(0, 4),
    tagline: String(tagline || "My custom coaching mind").slice(0, 90),
    category: ["attacking", "defending", "possession", "transition", "development", "management"].includes(category)
      ? category
      : "management",
    goodFor: String(goodFor || "Whatever this coach needs.").slice(0, 300),
    philosophy: String(philosophy).slice(0, 2000),
    custom: true,
  };
  store.customAdvisors.push(adv);
  saveStore();
  const gamify = award("advisor-built");
  res.json({ advisor: adv, award: gamify });
});

api.delete("/advisors/custom/:id", (req, res) => {
  const store = loadStore();
  store.customAdvisors = store.customAdvisors.filter((a) => a.id !== req.params.id);
  saveStore();
  res.json({ ok: true });
});

function consumeMessage(): { ok: boolean; remaining: number } {
  const store = loadStore();
  rollUsage(store);
  const limit = dailyLimit();
  if (store.usage.messages >= limit) {
    return { ok: false, remaining: 0 };
  }
  store.usage.messages += 1;
  saveStore();
  return { ok: true, remaining: limit - store.usage.messages };
}

function quotaError() {
  return `Daily message limit reached (${dailyLimit()}). ${plan() === "free" ? "Upgrade to Pro for 10x messages and the flagship engine." : "Resets tomorrow."}`;
}

// ---- Advisor brainstorm chat (SSE) ----
api.post("/chat", async (req, res) => {
  const { advisorId, messages } = req.body as {
    advisorId: string;
    messages: { role: "user" | "assistant"; content: string }[];
  };
  const builtIn = getAdvisor(advisorId);
  const custom = loadStore().customAdvisors.find((a) => a.id === advisorId);
  if ((!builtIn && !custom) || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "advisorId and messages are required" });
    return;
  }
  const quota = consumeMessage();
  if (!quota.ok) {
    res.status(429).json({ error: quotaError() });
    return;
  }
  const gamify = award("chat", advisorId);
  const system = builtIn
    ? advisorSystemPrompt(builtIn, teamContext())
    : customAdvisorSystemPrompt(custom!, teamContext());
  const advisorName = builtIn?.name ?? custom!.name;

  await streamToSSE(res, {
    model: engineFor(plan(), "chat"),
    system,
    messages: messages as Anthropic.Beta.BetaMessageParam[],
    maxTokens: 6000,
    mockText: MOCK_CHAT_REPLY,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: () => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      addSeasonEntry({
        kind: "chat",
        title: `Brainstorm with ${advisorName}`,
        summary: (lastUser?.content ?? "").slice(0, 120),
      });
    },
  });
});

// ---- General assistant coach chat (SSE, supports one image per message) ----
api.post("/assistant", async (req, res) => {
  const { messages } = req.body as {
    messages: { role: "user" | "assistant"; content: string; image?: string }[];
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages are required" });
    return;
  }
  const quota = consumeMessage();
  if (!quota.ok) {
    res.status(429).json({ error: quotaError() });
    return;
  }
  const gamify = award("chat");

  const apiMessages = messages.map((m) => ({
    role: m.role,
    content: m.role === "user" ? userContent(m.content, m.image) : m.content,
  })) as Anthropic.Beta.BetaMessageParam[];

  await streamToSSE(res, {
    model: engineFor(plan(), "chat"),
    system: assistantSystemPrompt(teamContext()),
    messages: apiMessages,
    maxTokens: 6000,
    mockText: MOCK_CHAT_REPLY,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: () => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      addSeasonEntry({ kind: "chat", title: "Chat with Coach T", summary: (lastUser?.content ?? "").slice(0, 120) });
    },
  });
});

// ---- Training session generation (structured + visualized) ----
api.post("/session-plan", async (req, res) => {
  const { ageGroup, playersAvailable, durationMinutes, theme, level, notes, school } = req.body ?? {};
  if (!ageGroup || !theme) {
    res.status(400).json({ error: "ageGroup and theme are required" });
    return;
  }
  try {
    const schoolInfo = SCHOOLS.find((s) => s.id === school);
    const plan_ = await generateStructured<typeof MOCK_SESSION_PLAN>({
      model: engineFor(plan(), "structured"),
      system: `${baseSystemPrompt()}${teamContext()}

You design world-class youth training sessions. Every drill must include a renderable diagram on a 100x100 grid (y=0 is the top of the drill area). Place players, cones, balls, goals, and 2-5 movement arrows that show the KEY picture of the activity. Diagrams must be realistic: sensible spacing, correct player counts matching the organization text. Follow the arrival -> technical -> pressure -> game arc. Total drill minutes must equal the requested duration.${schoolInfo ? `\n\nDesign this session in the tradition of the ${schoolInfo.name} (${schoolInfo.region}): ${schoolInfo.description}` : ""}`,
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
    addSeasonEntry({ kind: "session", title: plan_.title, summary: `${plan_.ageGroup} · ${plan_.theme}`, payload: plan_ });
    res.json({ plan: plan_, award: gamify });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

// ---- Session Library ----
api.get("/library", (_req, res) => {
  const store = loadStore();
  res.json({
    schools: SCHOOLS,
    templates: SESSION_TEMPLATES.map((t) => ({ ...t, unlocked: Boolean(store.libraryPlans[t.id]) })),
  });
});

api.post("/library/:id/generate", async (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) {
    res.status(404).json({ error: "Unknown template" });
    return;
  }
  const store = loadStore();
  const cached = store.libraryPlans[template.id];
  if (cached) {
    res.json({ plan: cached, cached: true });
    return;
  }
  const school = SCHOOLS.find((s) => s.id === template.school)!;
  try {
    const plan_ = await generateStructured<typeof MOCK_SESSION_PLAN>({
      model: engineFor(plan(), "structured"),
      system: `${baseSystemPrompt()}${teamContext()}

You design world-class youth training sessions. Every drill must include a renderable diagram on a 100x100 grid (y=0 is the top of the drill area). Place players, cones, balls, goals, and 2-5 movement arrows that show the KEY picture of the activity. Diagrams must be realistic. Follow the arrival -> technical -> pressure -> game arc.

This session is from TactIQ's library — design it faithfully in the tradition of the ${school.name} (${school.region}): ${school.description}`,
      user: `Build this library session in full:
- Title: ${template.title}
- Format: ${template.format} (${template.zone})
- Age band: ${template.ageBand}
- Theme: ${template.theme}
- Concept: ${template.description}
- Duration: 75 minutes${store.squad ? `\nAdapt player counts and complexity to the coach's team profile where sensible.` : ""}`,
      schema: SESSION_PLAN_SCHEMA as unknown as Record<string, unknown>,
      mock: { ...MOCK_SESSION_PLAN, title: template.title, theme: template.theme, ageGroup: template.ageBand },
    });

    store.libraryPlans[template.id] = plan_;
    saveStore();
    const gamify = award("library");
    addSeasonEntry({ kind: "session", title: `Library: ${template.title}`, summary: `${school.name} · ${template.format}`, payload: plan_ });
    res.json({ plan: plan_, award: gamify });
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
      model: engineFor(plan(), "structured"),
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
    res.status(429).json({ error: quotaError() });
    return;
  }
  const gamify = award("guidance");

  await streamToSSE(res, {
    model: engineFor(plan(), "chat"),
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
    coachExperience: (["new", "intermediate", "experienced"] as const).includes(s.coachExperience) ? s.coachExperience : "intermediate",
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

// ---- Settings / plan tier ----
api.get("/settings", (_req, res) => {
  const p = plan();
  res.json({ plan: p, chatModel: engineFor(p, "chat"), structuredModel: engineFor(p, "structured"), dailyLimit: dailyLimit() });
});

api.put("/settings/plan", (req, res) => {
  const { plan: newPlan } = req.body ?? {};
  if (newPlan !== "free" && newPlan !== "pro") {
    res.status(400).json({ error: "plan must be 'free' or 'pro'" });
    return;
  }
  const store = loadStore();
  store.settings.plan = newPlan;
  saveStore();
  res.json({ plan: newPlan, chatModel: engineFor(newPlan, "chat"), structuredModel: engineFor(newPlan, "structured"), dailyLimit: dailyLimit() });
});


// ---- Match Day: the professional assistant coach, pre / live / post ----
api.post("/matchday/pregame", async (req, res) => {
  const { opponent, competition, opponentNotes, ourLineupThoughts, conditions } = req.body ?? {};
  if (!opponent) {
    res.status(400).json({ error: "opponent is required" });
    return;
  }
  try {
    const gamePlan = await generateStructured<typeof MOCK_GAME_PLAN>({
      model: engineFor(plan(), "structured"),
      system: `${baseSystemPrompt()}${teamContext()}

You are the coach's professional assistant coach preparing a match briefing — the kind a pro staff produces before kickoff, translated to youth soccer. Be specific to the opponent intel provided. The pregameTalk must be word-for-word and age-appropriate. Keep every item actionable from the sideline.`,
      user: `Prepare the full pre-game briefing:
- Opponent: ${opponent}
- Competition/context: ${competition || "league game"}
- What we know about them: ${opponentNotes || "little — prepare a balanced plan with in-game reads to identify their style fast"}
- Our lineup/availability thoughts: ${ourLineupThoughts || "full squad expected"}
- Conditions (field, weather, roster size): ${conditions || "normal"}`,
      schema: GAME_PLAN_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 16000,
      mock: MOCK_GAME_PLAN,
    });
    const gamify = award("matchday");
    addSeasonEntry({ kind: "guidance", title: `Game plan: ${gamePlan.matchTitle}`, summary: gamePlan.keysToTheGame[0] ?? "", payload: gamePlan });
    res.json({ gamePlan, award: gamify });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

api.post("/matchday/live", async (req, res) => {
  const { messages } = req.body as { messages: { role: "user" | "assistant"; content: string }[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages are required" });
    return;
  }
  const quota = consumeMessage();
  if (!quota.ok) {
    res.status(429).json({ error: quotaError() });
    return;
  }
  const gamify = award("matchday");
  await streamToSSE(res, {
    model: engineFor(plan(), "chat"),
    system: `${baseSystemPrompt()}${teamContext()}

LIVE MATCH MODE. The coach is ON THE SIDELINE mid-game and reading on a phone. Rules:
- Maximum 120 words. Numbered, scannable, zero fluff.
- Give 2-3 concrete adjustments they can make RIGHT NOW (shape tweak, personnel role, restart tactic, message to shout).
- Ask at most ONE clarifying question, and only if truly necessary.
- End with one short composure cue for the coach — kids mirror the sideline.`,
    messages: messages as Anthropic.Beta.BetaMessageParam[],
    maxTokens: 1500,
    mockText: MOCK_LIVE_REPLY,
    doneExtra: { award: gamify, remaining: quota.remaining },
  });
});

api.post("/matchday/postgame", async (req, res) => {
  const { result, story, statsPaste, image } = req.body ?? {};
  if (!result && !story && !statsPaste) {
    res.status(400).json({ error: "Tell me at least the result or what happened" });
    return;
  }
  const quota = consumeMessage();
  if (!quota.ok) {
    res.status(429).json({ error: quotaError() });
    return;
  }
  const gamify = award("matchday");
  await streamToSSE(res, {
    model: engineFor(plan(), "chat"),
    system: `${baseSystemPrompt()}${teamContext()}

POST-GAME DEBRIEF MODE. You are the analyst on the coach's staff producing the after-match report. If the coach pasted platform data (Veo, Trace, Wyscout, Hudl exports — possession, xG, shots, heatmap descriptions, sprint data) interpret it properly per <modern_game_intelligence>, including its single-game noisiness. If a screenshot is attached (stats page, heatmap, freeze-frame), read it and cite specifics from it. Respond in markdown with exactly:
## What the Data Says  (or "## The Story" if no data — 3-4 sentences, honest)
## What Went Well  (specific, credit the kids)
## Fix This Week  (2-3 priorities, each mapped to a trainable action)
## Player Messages  (2-4 short individual messages worth delivering)
## Next Session Focus  (one theme + which Library school/session fits)`,
    messages: [
      {
        role: "user",
        content: userContent(
          `Result: ${result || "not given"}\nWhat happened (coach's account): ${story || "not given"}\nPlatform data pasted (Veo/Trace/Wyscout/other):\n${statsPaste || "none"}`,
          image,
        ),
      },
    ],
    maxTokens: 6000,
    mockText: MOCK_DEBRIEF,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: () => {
      addSeasonEntry({ kind: "guidance", title: `Post-game debrief${result ? `: ${result}` : ""}`, summary: String(story || statsPaste || "").slice(0, 120) });
    },
  });
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

  const todayStart = new Date().toISOString().slice(0, 10);
  const xpToday = p.xp - (store.xpHistory.filter((h) => h.t.slice(0, 10) < todayStart).at(-1)?.xp ?? 0);

  res.json({
    xp: p.xp,
    xpToday,
    xpHistory: store.xpHistory.slice(-60),
    level: lvl,
    streak: p.streak,
    counts: p.counts,
    advisorsUsed: p.advisorsUsed.length,
    plan: store.settings.plan,
    badges: BADGES.map((b) => ({
      id: b.id,
      name: b.name,
      emoji: b.emoji,
      description: b.description,
      earned: p.badges.includes(b.id),
    })),
    usage: { used: store.usage.messages, limit: dailyLimit() },
    leaderboard,
  });
});
