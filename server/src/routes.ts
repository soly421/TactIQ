import { Router } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { ADVISORS, advisorSystemPrompt, assistantSystemPrompt, customAdvisorSystemPrompt, getAdvisor } from "./personas.js";
import { baseSystemPrompt } from "./knowledge.js";
import { SESSION_PLAN_SCHEMA, FORMATION_ANALYSIS_SCHEMA, GAME_PLAN_SCHEMA, SEASON_PLAN_SCHEMA } from "./schemas.js";
import { generateStructured, streamToSSE, teamContext, userContent } from "./generate.js";
import {
  MOCK_CHAT_REPLY, MOCK_DEBRIEF, MOCK_FORMATION, MOCK_GAME_PLAN, MOCK_GUIDANCE,
  MOCK_LIVE_REPLY, MOCK_SEASON_PLAN, MOCK_SESSION_PLAN,
} from "./mock.js";
import {
  addCustomAdvisor, addSeasonEntry, deleteCustomAdvisor, getCustomAdvisors, getLibraryPlan,
  getPlanTier, getProgress, getSeason, getSquad, getUnlockedTemplateIds, getUsage, getXpHistory,
  incrementUsage, leaderboard, saveLibraryPlan, saveSquad, setPlanTier, xpAtStartOfToday,
  type CustomAdvisor, type SquadProfile,
} from "./store.js";
import { award, BADGES, FREE_DAILY_MESSAGES, levelFor } from "./gamification.js";
import { questState } from "./quests.js";
import { engineFor, hasApiKey, type Plan } from "./anthropic.js";
import { SCHOOLS, SESSION_TEMPLATES, getTemplate } from "./library.js";
import { requireAuth, type AuthedRequest } from "./auth.js";

export const api = Router();

const PRO_DAILY_MESSAGES = 300;

api.get("/health", (_req, res) => {
  res.json({ ok: true, live: hasApiKey });
});

// Everything below requires a signed-in coach.
api.use(requireAuth);

function uid(req: unknown): number {
  return (req as AuthedRequest).userId;
}

function planOf(userId: number): Plan {
  return getPlanTier(userId);
}

function dailyLimit(userId: number): number {
  return planOf(userId) === "pro" ? PRO_DAILY_MESSAGES : FREE_DAILY_MESSAGES;
}

function consumeMessage(userId: number): { ok: boolean; remaining: number } {
  const limit = dailyLimit(userId);
  const used = getUsage(userId);
  if (used >= limit) return { ok: false, remaining: 0 };
  incrementUsage(userId);
  return { ok: true, remaining: limit - used - 1 };
}

function quotaError(userId: number): string {
  return `Daily message limit reached (${dailyLimit(userId)}). ${planOf(userId) === "free" ? "Upgrade to Pro for 10x messages and the flagship engine." : "Resets tomorrow."}`;
}

// ---- Advisors (built-in + custom) ----
api.get("/advisors", (req, res) => {
  const builtIn = ADVISORS.map(({ style, ...pub }) => ({ ...pub, custom: false }));
  const custom = getCustomAdvisors(uid(req)).map((c) => ({
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
  const adv: CustomAdvisor = {
    id: `custom-${Math.random().toString(36).slice(2, 10)}`,
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
  addCustomAdvisor(uid(req), adv);
  const gamify = award(uid(req), "advisor-built");
  res.json({ advisor: adv, award: gamify });
});

api.delete("/advisors/custom/:id", (req, res) => {
  deleteCustomAdvisor(uid(req), req.params.id);
  res.json({ ok: true });
});

// ---- Advisor brainstorm chat (SSE) ----
api.post("/chat", async (req, res) => {
  const userId = uid(req);
  const { advisorId, messages } = req.body as {
    advisorId: string;
    messages: { role: "user" | "assistant"; content: string }[];
  };
  const builtIn = getAdvisor(advisorId);
  const custom = getCustomAdvisors(userId).find((a) => a.id === advisorId);
  if ((!builtIn && !custom) || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "advisorId and messages are required" });
    return;
  }
  const quota = consumeMessage(userId);
  if (!quota.ok) {
    res.status(429).json({ error: quotaError(userId) });
    return;
  }
  const gamify = award(userId, "chat", advisorId);
  const system = builtIn
    ? advisorSystemPrompt(builtIn, teamContext(userId))
    : customAdvisorSystemPrompt(custom!, teamContext(userId));
  const advisorName = builtIn?.name ?? custom!.name;

  await streamToSSE(res, {
    model: engineFor(planOf(userId), "chat"),
    system,
    messages: messages as Anthropic.Beta.BetaMessageParam[],
    maxTokens: 6000,
    mockText: MOCK_CHAT_REPLY,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: () => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      addSeasonEntry(userId, {
        kind: "chat",
        title: `Brainstorm with ${advisorName}`,
        summary: (lastUser?.content ?? "").slice(0, 120),
      });
    },
  });
});

// ---- General assistant coach chat (SSE, supports one image per message) ----
api.post("/assistant", async (req, res) => {
  const userId = uid(req);
  const { messages } = req.body as {
    messages: { role: "user" | "assistant"; content: string; image?: string }[];
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages are required" });
    return;
  }
  const quota = consumeMessage(userId);
  if (!quota.ok) {
    res.status(429).json({ error: quotaError(userId) });
    return;
  }
  const gamify = award(userId, "chat");

  const apiMessages = messages.map((m) => ({
    role: m.role,
    content: m.role === "user" ? userContent(m.content, m.image) : m.content,
  })) as Anthropic.Beta.BetaMessageParam[];

  await streamToSSE(res, {
    model: engineFor(planOf(userId), "chat"),
    system: assistantSystemPrompt(teamContext(userId)),
    messages: apiMessages,
    maxTokens: 6000,
    mockText: MOCK_CHAT_REPLY,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: () => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      addSeasonEntry(userId, { kind: "chat", title: "Chat with Coach T", summary: (lastUser?.content ?? "").slice(0, 120) });
    },
  });
});

// ---- Training session generation ----
api.post("/session-plan", async (req, res) => {
  const userId = uid(req);
  const { ageGroup, playersAvailable, durationMinutes, theme, level, notes, school } = req.body ?? {};
  if (!ageGroup || !theme) {
    res.status(400).json({ error: "ageGroup and theme are required" });
    return;
  }
  try {
    const schoolInfo = SCHOOLS.find((s) => s.id === school);
    const plan_ = await generateStructured<typeof MOCK_SESSION_PLAN>({
      model: engineFor(planOf(userId), "structured"),
      system: `${baseSystemPrompt()}${teamContext(userId)}

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

    const gamify = award(userId, "session");
    addSeasonEntry(userId, { kind: "session", title: plan_.title, summary: `${plan_.ageGroup} · ${plan_.theme}`, payload: plan_ });
    res.json({ plan: plan_, award: gamify });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

// ---- Session Scan: photo of a hand-drawn/whiteboard session -> digital session ----
api.post("/session-scan", async (req, res) => {
  const userId = uid(req);
  const { image, notes } = req.body ?? {};
  if (!image) {
    res.status(400).json({ error: "Attach a photo of your session sketch" });
    return;
  }
  try {
    const { getClient, hasApiKey: live, requestExtras } = await import("./anthropic.js");
    if (!live) {
      const gamify = award(userId, "session");
      res.json({ plan: { ...MOCK_SESSION_PLAN, title: "Scanned Session (demo)" }, award: gamify });
      return;
    }
    const model = engineFor(planOf(userId), "structured");
    const extras = requestExtras(model);
    const stream = getClient().beta.messages.stream({
      model,
      max_tokens: 24000,
      ...(extras.betas.length ? { betas: extras.betas } : {}),
      ...(extras.fallbacks ? { fallbacks: extras.fallbacks } : {}),
      system: `${baseSystemPrompt()}${teamContext(userId)}

The coach has photographed a hand-drawn training session (whiteboard, notebook, or napkin). Read every activity in the image — layouts, player counts, arrows, labels — and reconstruct the FULL session digitally. Where the sketch is ambiguous, make the most sensible coaching interpretation. Every drill needs a clean renderable diagram on the 100x100 grid with movement arrows, plus coaching points appropriate to the age group.`,
      messages: [{ role: "user", content: userContent(`Digitize this session sketch.${notes ? ` Coach's notes: ${notes}` : ""}`, image) }],
      output_config: { format: { type: "json_schema", schema: SESSION_PLAN_SCHEMA as unknown as Record<string, unknown> } },
    });
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new Error("Couldn't process this image. Try a clearer photo.");
    const text = final.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("No output returned");
    const plan_ = JSON.parse(text.text) as typeof MOCK_SESSION_PLAN;
    const gamify = award(userId, "session");
    addSeasonEntry(userId, { kind: "session", title: `Scanned: ${plan_.title}`, summary: plan_.theme, payload: plan_ });
    res.json({ plan: plan_, award: gamify });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

// ---- Season periodization planner ----
api.post("/season-plan", async (req, res) => {
  const userId = uid(req);
  const { weeks, focus, gamesPerWeek, practicesPerWeek } = req.body ?? {};
  const squad = getSquad(userId);
  try {
    const plan_ = await generateStructured<typeof MOCK_SEASON_PLAN>({
      model: engineFor(planOf(userId), "structured"),
      system: `${baseSystemPrompt()}${teamContext(userId)}

You design season-long periodized curricula for youth teams: coherent blocks that build on each other, age-appropriate load, themes that connect training to weekend games. Weeks must progress logically (foundation -> possession/defending blocks -> integration -> competition prep), revisiting core habits throughout.`,
      user: `Design a ${weeks || 12}-week season plan:
- Team: ${squad ? `${squad.teamName}, ${squad.ageGroup}, ${squad.format}, ${squad.level}` : "a typical U10 travel team"}
- Practices per week: ${practicesPerWeek || 2}
- Games per week: ${gamesPerWeek || 1}
- Season focus (coach's words): ${focus || "overall development with the team's preferred style"}`,
      schema: SEASON_PLAN_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 20000,
      mock: MOCK_SEASON_PLAN,
    });
    const gamify = award(userId, "session");
    addSeasonEntry(userId, { kind: "session", title: `Season plan: ${plan_.title}`, summary: `${plan_.weeks.length} weeks`, payload: plan_ });
    res.json({ plan: plan_, award: gamify });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

// ---- Session Library ----
api.get("/library", (req, res) => {
  const unlocked = getUnlockedTemplateIds(uid(req));
  res.json({
    schools: SCHOOLS,
    templates: SESSION_TEMPLATES.map((t) => ({ ...t, unlocked: unlocked.has(t.id) })),
  });
});

api.post("/library/:id/generate", async (req, res) => {
  const userId = uid(req);
  const template = getTemplate(req.params.id);
  if (!template) {
    res.status(404).json({ error: "Unknown template" });
    return;
  }
  const cached = getLibraryPlan(userId, template.id);
  if (cached) {
    res.json({ plan: cached, cached: true });
    return;
  }
  const school = SCHOOLS.find((s) => s.id === template.school)!;
  try {
    const plan_ = await generateStructured<typeof MOCK_SESSION_PLAN>({
      model: engineFor(planOf(userId), "structured"),
      system: `${baseSystemPrompt()}${teamContext(userId)}

You design world-class youth training sessions. Every drill must include a renderable diagram on a 100x100 grid (y=0 is the top of the drill area). Place players, cones, balls, goals, and 2-5 movement arrows that show the KEY picture of the activity. Diagrams must be realistic. Follow the arrival -> technical -> pressure -> game arc.

This session is from TactIQ's library — design it faithfully in the tradition of the ${school.name} (${school.region}): ${school.description}`,
      user: `Build this library session in full:
- Title: ${template.title}
- Format: ${template.format} (${template.zone})
- Age band: ${template.ageBand}
- Theme: ${template.theme}
- Concept: ${template.description}
- Duration: 75 minutes${getSquad(userId) ? `\nAdapt player counts and complexity to the coach's team profile where sensible.` : ""}`,
      schema: SESSION_PLAN_SCHEMA as unknown as Record<string, unknown>,
      mock: { ...MOCK_SESSION_PLAN, title: template.title, theme: template.theme, ageGroup: template.ageBand },
    });

    saveLibraryPlan(userId, template.id, plan_);
    const gamify = award(userId, "library");
    addSeasonEntry(userId, { kind: "session", title: `Library: ${template.title}`, summary: `${school.name} · ${template.format}`, payload: plan_ });
    res.json({ plan: plan_, award: gamify });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

// ---- Formation lab ----
api.post("/formation", async (req, res) => {
  const userId = uid(req);
  const { format, ageGroup, style, squadNotes, opponentNotes } = req.body ?? {};
  if (!format || !ageGroup) {
    res.status(400).json({ error: "format and ageGroup are required" });
    return;
  }
  try {
    const analysis = await generateStructured<typeof MOCK_FORMATION>({
      model: engineFor(planOf(userId), "structured"),
      system: `${baseSystemPrompt()}${teamContext(userId)}

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

    const gamify = award(userId, "formation");
    addSeasonEntry(userId, {
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
  const userId = uid(req);
  const { ageGroup, level, topic, question } = req.body ?? {};
  if (!ageGroup || !question) {
    res.status(400).json({ error: "ageGroup and question are required" });
    return;
  }
  const quota = consumeMessage(userId);
  if (!quota.ok) {
    res.status(429).json({ error: quotaError(userId) });
    return;
  }
  const gamify = award(userId, "guidance");

  await streamToSSE(res, {
    model: engineFor(planOf(userId), "chat"),
    system: `${baseSystemPrompt()}${teamContext(userId)}

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
      addSeasonEntry(userId, { kind: "guidance", title: topic || "Tactical guidance", summary: String(question).slice(0, 120) });
    },
  });
});

// ---- Match Day ----
api.post("/matchday/pregame", async (req, res) => {
  const userId = uid(req);
  const { opponent, competition, opponentNotes, ourLineupThoughts, conditions } = req.body ?? {};
  if (!opponent) {
    res.status(400).json({ error: "opponent is required" });
    return;
  }
  try {
    const gamePlan = await generateStructured<typeof MOCK_GAME_PLAN>({
      model: engineFor(planOf(userId), "structured"),
      system: `${baseSystemPrompt()}${teamContext(userId)}

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
    const gamify = award(userId, "matchday");
    addSeasonEntry(userId, { kind: "guidance", title: `Game plan: ${gamePlan.matchTitle}`, summary: gamePlan.keysToTheGame[0] ?? "", payload: gamePlan });
    res.json({ gamePlan, award: gamify });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

api.post("/matchday/live", async (req, res) => {
  const userId = uid(req);
  const { messages } = req.body as { messages: { role: "user" | "assistant"; content: string }[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages are required" });
    return;
  }
  const quota = consumeMessage(userId);
  if (!quota.ok) {
    res.status(429).json({ error: quotaError(userId) });
    return;
  }
  const gamify = award(userId, "matchday");
  await streamToSSE(res, {
    model: engineFor(planOf(userId), "chat"),
    system: `${baseSystemPrompt()}${teamContext(userId)}

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
  const userId = uid(req);
  const { result, story, statsPaste, image } = req.body ?? {};
  if (!result && !story && !statsPaste) {
    res.status(400).json({ error: "Tell me at least the result or what happened" });
    return;
  }
  const quota = consumeMessage(userId);
  if (!quota.ok) {
    res.status(429).json({ error: quotaError(userId) });
    return;
  }
  const gamify = award(userId, "matchday");
  await streamToSSE(res, {
    model: engineFor(planOf(userId), "chat"),
    system: `${baseSystemPrompt()}${teamContext(userId)}

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
      addSeasonEntry(userId, { kind: "guidance", title: `Post-game debrief${result ? `: ${result}` : ""}`, summary: String(story || statsPaste || "").slice(0, 120) });
    },
  });
});

// ---- Team profile ----
api.get("/team", (req, res) => {
  res.json({ squad: getSquad(uid(req)) });
});

api.put("/team", (req, res) => {
  const userId = uid(req);
  const s = req.body as SquadProfile;
  if (!s?.teamName || !s?.ageGroup) {
    res.status(400).json({ error: "teamName and ageGroup are required" });
    return;
  }
  const squad: SquadProfile = {
    teamName: s.teamName,
    coachExperience: (["new", "intermediate", "experienced"] as const).includes(s.coachExperience) ? s.coachExperience : "intermediate",
    ageGroup: s.ageGroup,
    format: s.format || "9v9",
    level: s.level || "rec",
    preferredStyle: s.preferredStyle || "",
    rosterNotes: s.rosterNotes || "",
    seasonGoals: s.seasonGoals || "",
  };
  saveSquad(userId, squad);
  const gamify = award(userId, "squad");
  res.json({ squad, award: gamify });
});

api.get("/season", (req, res) => {
  res.json({ season: getSeason(uid(req)) });
});

// ---- Settings / plan tier ----
api.get("/settings", (req, res) => {
  const userId = uid(req);
  const p = planOf(userId);
  res.json({ plan: p, chatModel: engineFor(p, "chat"), structuredModel: engineFor(p, "structured"), dailyLimit: dailyLimit(userId) });
});

api.put("/settings/plan", (req, res) => {
  const userId = uid(req);
  const { plan: newPlan } = req.body ?? {};
  if (newPlan !== "free" && newPlan !== "pro") {
    res.status(400).json({ error: "plan must be 'free' or 'pro'" });
    return;
  }
  setPlanTier(userId, newPlan);
  res.json({ plan: newPlan, chatModel: engineFor(newPlan, "chat"), structuredModel: engineFor(newPlan, "structured"), dailyLimit: dailyLimit(userId) });
});

// ---- Gamified progress ----
api.get("/progress", (req, res) => {
  const userId = uid(req);
  const p = getProgress(userId);
  const lvl = levelFor(p.xp);
  res.json({
    xp: p.xp,
    xpToday: p.xp - xpAtStartOfToday(userId),
    xpHistory: getXpHistory(userId),
    level: lvl,
    streak: p.streak,
    counts: p.counts,
    advisorsUsed: p.advisorsUsed.length,
    plan: getPlanTier(userId),
    quests: questState(userId),
    badges: BADGES.map((b) => ({
      id: b.id,
      name: b.name,
      emoji: b.emoji,
      description: b.description,
      earned: p.badges.includes(b.id),
    })),
    usage: { used: getUsage(userId), limit: dailyLimit(userId) },
    leaderboard: leaderboard(userId),
  });
});
