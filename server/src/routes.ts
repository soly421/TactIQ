import { Router } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { ADVISORS, advisorSystemPrompt, assistantSystemPrompt, customAdvisorSystemPrompt, getAdvisor } from "./personas.js";
import { baseSystemPrompt } from "./knowledge.js";
import { SESSION_PLAN_SCHEMA, FORMATION_ANALYSIS_SCHEMA, GAME_PLAN_SCHEMA, SEASON_PLAN_SCHEMA } from "./schemas.js";
import { generateStructured, streamToSSE, teamContext, userContent } from "./generate.js";
import {
  MOCK_CHAT_REPLY, MOCK_DEBRIEF, MOCK_FILM, MOCK_FORMATION, MOCK_GAME_PLAN, MOCK_GUIDANCE,
  MOCK_LIVE_REPLY, MOCK_SEASON_PLAN, MOCK_SESSION_PLAN,
} from "./mock.js";
import {
  addCustomAdvisor, addSeasonEntry, deleteCustomAdvisor, getCustomAdvisors, getLibraryPlan,
  getPlanTier, getProgress, getSeason, getSquad, getUnlockedTemplateIds, getUsage, getXpHistory,
  addFeedback, feedbackCount, incrementUsage, leaderboard, saveLibraryPlan, saveSquad, setPlanTier, tokensToday, xpAtStartOfToday,
  type CustomAdvisor, type SquadProfile,
} from "./store.js";
import { award, BADGES, FREE_DAILY_MESSAGES, levelFor } from "./gamification.js";
import { questState } from "./quests.js";
import { engineSummary, hasAnyProvider, tierFor, type Plan } from "./providers.js";
import { stripeConfigured } from "./billing.js";
import { SCHOOLS, SESSION_TEMPLATES, getTemplate } from "./library.js";

import { requireAuth, type AuthedRequest } from "./auth.js";

export const api = Router();

// Flatten whitespace so stored memory summaries stay single-line.
const snip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

const PRO_DAILY_MESSAGES = 300;

api.get("/health", (_req, res) => {
  res.json({ ok: true, live: hasAnyProvider() });
});

// ---- Try-before-signup: one instant session, no account, cheapest tier ----
// The Speak/Cursor lesson: deliver the magic moment BEFORE asking for signup.
const tryCounts = new Map<string, { day: string; n: number }>();
const TRY_PER_DAY = 3;

api.post("/try/session", async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";
  const day = new Date().toISOString().slice(0, 10);
  const entry = tryCounts.get(ip);
  const n = entry?.day === day ? entry.n : 0;
  if (n >= TRY_PER_DAY) {
    res.status(429).json({ error: "Free preview limit reached for today — create a free account to keep going." });
    return;
  }
  tryCounts.set(ip, { day, n: n + 1 });
  if (tryCounts.size > 5000) tryCounts.clear(); // bounded memory

  const { ageGroup, theme } = req.body ?? {};
  if (!ageGroup || !theme) {
    res.status(400).json({ error: "ageGroup and theme are required" });
    return;
  }
  try {
    const plan_ = await generateStructured<typeof MOCK_SESSION_PLAN>({
      tier: "light",
      userId: 0, // unauthenticated preview — excluded from the per-user ledger
      system: `${baseSystemPrompt()}

You design world-class youth training sessions. Every drill must include a renderable diagram on a 100x100 grid. Follow the arrival -> technical -> pressure -> game arc. This is a first-taste preview for a coach who hasn't signed up yet — make it genuinely excellent.`,
      user: `Design a 75-minute training session for a ${ageGroup} team. Theme: ${theme}.`,
      schema: SESSION_PLAN_SCHEMA as unknown as Record<string, unknown>,
      mock: { ...MOCK_SESSION_PLAN, title: `${theme} (demo sample)` },
    });
    res.json({ plan: plan_, remaining: TRY_PER_DAY - n - 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Generation failed — try again" });
  }
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
    tier: tierFor(planOf(userId), "chat"),
    userId,
    system,
    messages: messages as Anthropic.Beta.BetaMessageParam[],
    maxTokens: 6000,
    mockText: MOCK_CHAT_REPLY,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: (fullText) => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      addSeasonEntry(userId, {
        kind: "chat",
        title: `Brainstorm with ${advisorName}`,
        summary: `Coach asked: "${snip(lastUser?.content ?? "", 110)}" — ${advisorName} advised: ${snip(fullText, 180)}`,
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
    tier: tierFor(planOf(userId), "chat"),
    userId,
    system: assistantSystemPrompt(teamContext(userId)),
    messages: apiMessages,
    maxTokens: 6000,
    mockText: MOCK_CHAT_REPLY,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: (fullText) => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      addSeasonEntry(userId, {
        kind: "chat",
        title: "Chat with Coach Sam",
        summary: `Coach asked: "${snip(lastUser?.content ?? "", 110)}" — advised: ${snip(fullText, 180)}`,
      });
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
      tier: tierFor(planOf(userId), "structured"),
      userId,
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
    const entryId = addSeasonEntry(userId, {
      kind: "session",
      title: plan_.title,
      summary: `${plan_.ageGroup} · ${plan_.theme} · exercises: ${plan_.drills.map((d) => d.name).join(", ").slice(0, 160)}`,
      payload: plan_,
    });
    res.json({ plan: plan_, award: gamify, entryId });
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
    const scanUser = userContent(`Digitize this session sketch.${notes ? ` Coach's notes: ${notes}` : ""}`, image);
    const plan_ = await generateStructured<typeof MOCK_SESSION_PLAN>({
      tier: tierFor(planOf(userId), "structured"),
      userId,
      system: `${baseSystemPrompt()}${teamContext(userId)}

The coach has photographed a hand-drawn training session (whiteboard, notebook, or napkin). Read every activity in the image — layouts, player counts, arrows, labels — and reconstruct the FULL session digitally. Where the sketch is ambiguous, make the most sensible coaching interpretation. Every drill needs a clean renderable diagram on the 100x100 grid with movement arrows, plus coaching points appropriate to the age group.`,
      user: scanUser,
      schema: SESSION_PLAN_SCHEMA as unknown as Record<string, unknown>,
      mock: { ...MOCK_SESSION_PLAN, title: "Scanned Session (demo)" },
    });
    const gamify = award(userId, "session");
    const entryId = addSeasonEntry(userId, { kind: "session", title: `Scanned: ${plan_.title}`, summary: plan_.theme, payload: plan_ });
    res.json({ plan: plan_, award: gamify, entryId });
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
      tier: tierFor(planOf(userId), "structured"),
      userId,
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
    const entryId = addSeasonEntry(userId, { kind: "session", title: `Season plan: ${plan_.title}`, summary: `${plan_.weeks.length} weeks`, payload: plan_ });
    res.json({ plan: plan_, award: gamify, entryId });
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
  try {
    const plan_ = await generateStructured<typeof MOCK_SESSION_PLAN>({
      tier: tierFor(planOf(userId), "structured"),
      userId,
      system: `${baseSystemPrompt()}${teamContext(userId)}

You design world-class youth training sessions. Every drill must include a renderable diagram on a 100x100 grid (y=0 is the top of the drill area). Place players, cones, balls, goals, and 2-5 movement arrows that show the KEY picture of the activity. Diagrams must be realistic. Follow the arrival -> technical -> pressure -> game arc.

This session is from TactIQ's library. Build it to spec:
- Topic: ${template.topicName} (${template.phase} phase)${template.collection === "signature" ? `\n- This is a SIGNATURE exercise${template.tradition ? ` from the ${template.tradition}` : ""}: build the session AROUND this exact exercise as the centerpiece — stay faithful to its organization and rules, add a fitting warm-up before and a game after.` : ""}
- Core concept to train: ${template.concept}
- Complexity: ${template.complexity} — ${template.complexity === "foundation" ? "core habits, simple pictures, minimal rules" : template.complexity === "intermediate" ? "add pressure, decisions, and game-realistic pictures" : "full tactical detail, opposition pictures, position-specific roles"}
- The session must be UNIQUE and specific to this topic/complexity/age — not a generic template.`,
      user: `Build this library session in full:
- Title basis: ${template.title}
- Age band: ${template.ageBand} (${template.format})
- Duration: 75 minutes${getSquad(userId) ? `\nAdapt player counts and complexity to the coach's team profile where sensible.` : ""}
Give it a specific, evocative title of your own (not the catalog label).`,
      schema: SESSION_PLAN_SCHEMA as unknown as Record<string, unknown>,
      mock: { ...MOCK_SESSION_PLAN, title: `${template.topicName} (demo sample)`, theme: template.theme, ageGroup: template.ageBand },
    });

    saveLibraryPlan(userId, template.id, plan_);
    const gamify = award(userId, "library");
    const entryId = addSeasonEntry(userId, { kind: "session", title: `Library: ${template.title}`, summary: `${template.phase} · ${template.format}`, payload: plan_ });
    res.json({ plan: plan_, award: gamify, entryId });
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
      tier: tierFor(planOf(userId), "structured"),
      userId,
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
    const entryId = addSeasonEntry(userId, {
      kind: "formation",
      title: `Formation: ${analysis.recommendedFormation}`,
      summary: `${ageGroup} ${format} · ${style || "open style"}`,
      payload: analysis,
    });
    res.json({ analysis, award: gamify, entryId });
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
    tier: tierFor(planOf(userId), "chat"),
    userId,
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
    onDone: (fullText) => {
      addSeasonEntry(userId, {
        kind: "guidance",
        title: topic || "Tactical guidance",
        summary: `Problem: "${snip(String(question), 110)}" — advice given: ${snip(fullText, 180)}`,
      });
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
      tier: tierFor(planOf(userId), "structured"),
      userId,
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
    const entryId = addSeasonEntry(userId, {
      kind: "match",
      title: `Game plan vs ${opponent}`,
      summary: `${competition || "league game"} — key: ${gamePlan.keysToTheGame[0] ?? ""}${opponentNotes ? ` | opponent intel: ${String(opponentNotes).slice(0, 100)}` : ""}`,
      payload: gamePlan,
    });
    res.json({ gamePlan, award: gamify, entryId });
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
    tier: tierFor(planOf(userId), "chat"),
    userId,
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
    onDone: (fullText) => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      addSeasonEntry(userId, {
        kind: "match",
        title: "Live bench — in-game situation",
        summary: `Sideline report: "${snip(lastUser?.content ?? "", 110)}" — adjustment: ${snip(fullText, 160)}`,
      });
    },
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
    tier: tierFor(planOf(userId), "chat"),
    userId,
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
    onDone: (fullText) => {
      addSeasonEntry(userId, {
        kind: "match",
        title: `Post-game debrief${result ? `: ${result}` : ""}`,
        summary: `Coach's account: "${snip(String(story || statsPaste || ""), 110)}" — takeaways: ${snip(fullText, 180)}`,
      });
    },
  });
});


// ---- Output ratings: the crowdsourced eval dataset ----
api.post("/feedback", (req, res) => {
  const userId = uid(req);
  const { entryId, kind, vote, note } = req.body ?? {};
  if (vote !== 1 && vote !== -1) {
    res.status(400).json({ error: "vote must be 1 or -1" });
    return;
  }
  addFeedback(userId, { entryId: entryId ?? null, kind: String(kind ?? "output").slice(0, 30), vote, note });
  const gamify = award(userId, "rate");
  res.json({ ok: true, award: gamify, totalRatings: feedbackCount(userId) });
});

// ---- Film Room: keyframe sequence -> timestamped tactical analysis (SSE) ----
api.post("/film-analysis", async (req, res) => {
  const userId = uid(req);
  const { frames, context } = req.body as { frames: { t: number; image: string }[]; context?: string };
  if (!Array.isArray(frames) || frames.length === 0) {
    res.status(400).json({ error: "frames are required" });
    return;
  }
  if (frames.length > 10) {
    res.status(400).json({ error: "Maximum 10 frames per clip" });
    return;
  }
  const quota = consumeMessage(userId);
  if (!quota.ok) {
    res.status(429).json({ error: quotaError(userId) });
    return;
  }
  const gamify = award(userId, "film");

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of frames) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(f.image ?? "");
    if (!match) continue;
    content.push({ type: "text", text: `Frame at ${Number(f.t).toFixed(1)}s:` });
    content.push({ type: "image", source: { type: "base64", media_type: match[1] as "image/png" | "image/jpeg" | "image/webp", data: match[2] } });
  }
  content.push({
    type: "text",
    text: `These are sequential keyframes from one video clip of my team (timestamps shown). ${context || "Analyze what happens tactically across the sequence."}`,
  });

  await streamToSSE(res, {
    tier: tierFor(planOf(userId), "chat"),
    userId,
    system: `${baseSystemPrompt()}${teamContext(userId)}

FILM ROOM MODE. You are the video analyst on the coach's staff. The coach uploaded keyframes from one continuous clip, in order, with timestamps. Read the sequence like film: track how the shape, spacing, and key players change frame to frame. Reference timestamps for every observation. Be specific about WHERE on the field things happen and WHO (jersey color/position) is involved. Respond in markdown:
## What I See  (timestamped observations across the sequence)
## The Problem  (the single biggest tactical issue this clip reveals)
## Fix It  (the picture/instruction to give players)
## Train It  (1-2 activities that recreate and fix this exact moment)`,
    messages: [{ role: "user", content }],
    maxTokens: 6000,
    mockText: MOCK_FILM,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: (fullText) => {
      addSeasonEntry(userId, {
        kind: "film",
        title: "Film Room breakdown",
        summary: `Clip: "${snip(context ?? "video clip analysis", 100)}" — analysis found: ${snip(fullText, 180)}`,
      });
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
    players: (Array.isArray(s.players) ? s.players : []).slice(0, 30).map((p) => ({
      name: String(p?.name ?? "").slice(0, 60),
      number: String(p?.number ?? "").slice(0, 4),
      positions: String(p?.positions ?? "").slice(0, 40),
      foot: String(p?.foot ?? "").slice(0, 10),
      notes: String(p?.notes ?? "").slice(0, 300),
    })),
  };
  saveSquad(userId, squad);
  const gamify = award(userId, "squad");
  res.json({ squad, award: gamify });
});

api.get("/season", (req, res) => {
  res.json({ season: getSeason(uid(req)) });
});

// ---- Settings / plan tier ----
function settingsPayload(userId: number) {
  const p = planOf(userId);
  const engines = engineSummary(p);
  return {
    plan: p,
    dailyLimit: dailyLimit(userId),
    engines,
    chatModel: engines.chat.model,
    structuredModel: engines.structured.model,
    billingConfigured: stripeConfigured,
    tokensToday: tokensToday(userId),
  };
}

api.get("/settings", (req, res) => {
  res.json(settingsPayload(uid(req)));
});

// Dev/demo plan toggle. When Stripe is configured the plan tier is
// server-authoritative — it only changes via verified billing webhooks.
api.put("/settings/plan", (req, res) => {
  const userId = uid(req);
  if (stripeConfigured) {
    res.status(400).json({ error: "Your plan is managed through billing — use Upgrade / Manage billing." });
    return;
  }
  const { plan: newPlan } = req.body ?? {};
  if (newPlan !== "free" && newPlan !== "pro") {
    res.status(400).json({ error: "plan must be 'free' or 'pro'" });
    return;
  }
  setPlanTier(userId, newPlan);
  res.json(settingsPayload(userId));
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
