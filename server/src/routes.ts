import { Router } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { debateAdvisorPrompt, routeDebatePair, ADVISORS, advisorSystemPrompt, assistantSystemPrompt, customAdvisorSystemPrompt, getAdvisor } from "./personas.js";
import { baseSystemPrompt } from "./knowledge.js";
import { SESSION_PLAN_SCHEMA, FORMATION_ANALYSIS_SCHEMA, GAME_PLAN_SCHEMA, SEASON_PLAN_SCHEMA } from "./schemas.js";
import { generateText, bandFor as bandForAgeServer, generateStructured, streamToSSE, teamContext, userContent } from "./generate.js";
import { streamText } from "./providers.js";
import {
  MOCK_CHAT_REPLY, MOCK_DEBRIEF, MOCK_FILM, MOCK_FORMATION, MOCK_GAME_PLAN, MOCK_GUIDANCE, mockFormation, mockSessionPlan,
  MOCK_LIVE_REPLY, MOCK_SEASON_PLAN, MOCK_SESSION_PLAN, mockSeasonPlan,
} from "./mock.js";
import { setCoachProfile, getCoachProfile, getSeasonEntryById, deleteSeasonEntry, refundMessage, topAdvisorNames, setUserTz, userToday,
  adminOverview, estCostToday, getUserBilling, markClubInterest,
  addCustomAdvisor, addSeasonEntry, deleteCustomAdvisor, getCustomAdvisors, getLibraryPlan,
  getPlanTier, getProgress, getSeason, getSquad, getUnlockedTemplateIds, getUsage, getXpHistory,
  activeTeamId, addFeedback, clubThemeFor, createTeam, deleteTeam, getUserClub, feedbackCount, incrementUsage, kvGet, kvSet, kvIncrement, kvDecrement, listTeams, saveLibraryPlan, saveSquad, setActiveTeam, setPlanTier, tokensToday, upcomingEvents, xpAtStartOfToday,
  type CustomAdvisor, type SquadProfile,
} from "./store.js";
import { award, BADGES, FREE_DAILY_MESSAGES, levelFor } from "./gamification.js";
import { weekStart } from "./community.js";
import { castVote, debateState } from "./debate.js";
import { questState } from "./quests.js";
import { engineSummary, hasAnyProvider, tierFor, type Plan } from "./providers.js";
import { stripeConfigured } from "./billing.js";
import { maybeResyncIcs } from "./schedule.js";

// "U11" -> "U11-U12" (server twin of the client bandForAge)
import { bumpMonthly, entitlementsFor, getStaff, monthlyCount, signOrCheckAdvisor, upgradeError } from "./entitlements.js";
import { SCHOOLS, SESSION_TEMPLATES, getTemplate } from "./library.js";

import { requireAuth, type AuthedRequest } from "./auth.js";

export const api = Router();

// Flatten whitespace so stored memory summaries stay single-line.
const snip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

const PRO_DAILY_MESSAGES = 300;

api.get("/health", (_req, res) => {
  res.json({ ok: true, live: hasAnyProvider() });
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

// ---- daily compute ceiling: caps DOLLARS, not requests ----
// The request caps below bound abuse in units; this bounds it in money.
// Estimated from the model_calls ledger at list rates (see estimateCost).
// A legit coach spends $0.10-0.50/day, so these never touch real usage —
// they exist so a scripted account can't turn a $29.99 plan into a $2k bill.
const COST_CEILING_USD: Record<Plan, number> = {
  free: Number(process.env.COST_CEILING_FREE || 1),
  pro: Number(process.env.COST_CEILING_PRO || 5),
};

function overComputeCeiling(userId: number): boolean {
  return estCostToday(userId) >= COST_CEILING_USD[planOf(userId)];
}

const CEILING_MSG = "You've hit today's fair-use compute ceiling — that was a heavy day, coach! Everything resets tomorrow.";

function consumeMessage(userId: number): { ok: boolean; remaining: number } {
  const limit = dailyLimit(userId);
  const used = getUsage(userId);
  if (used >= limit || overComputeCeiling(userId)) return { ok: false, remaining: Math.max(0, limit - used) };
  incrementUsage(userId);
  return { ok: true, remaining: limit - used - 1 };
}

// Structured generations (sessions, formations, game plans) are the priciest
// calls. Legit coaches never hit these ceilings; scripted abuse does.
const STRUCTURED_PER_DAY: Record<Plan, number> = { free: 3, pro: 150 };

function consumeStructured(userId: number): boolean {
  if (overComputeCeiling(userId)) return false;
  const key = `structcap:${userId}:${userToday(userId)}`;
  // Reserve atomically before the model call: parallel requests each get a
  // distinct incremented value, so a burst can't share one pre-value and slip
  // past the cap. Over-cap reservations are refunded immediately.
  const reserved = kvIncrement(key);
  if (reserved > STRUCTURED_PER_DAY[planOf(userId)]) {
    kvDecrement(key);
    return false;
  }
  return true;
}

// A failed generation must not cost the coach a slot: every cap that was
// consumed optimistically gets refunded in the endpoint's catch block.
function refundStructured(userId: number): void {
  kvDecrement(`structcap:${userId}:${userToday(userId)}`);
}

function structuredLimitMsg(userId: number): string {
  if (overComputeCeiling(userId)) return CEILING_MSG;
  return planOf(userId) === "free"
    ? "Daily build limit reached (3 on Free). Upgrade to Pro for 150 builds a day on the flagship engine."
    : "Daily build limit reached — that's a lot of sessions, coach! It resets tomorrow.";
}

function quotaError(userId: number): string {
  if (overComputeCeiling(userId)) return CEILING_MSG;
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
  if (!entitlementsFor(planOf(uid(req))).customAdvisors) {
    res.status(403).json(upgradeError("Building custom advisors is a Pro feature."));
    return;
  }
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
  const { advisorId, messages, secondOpinion } = req.body as {
    advisorId: string;
    messages: { role: "user" | "assistant"; content: string }[];
    secondOpinion?: boolean;
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
  // Free tier: the first N advisors you talk to become your signed staff.
  if (builtIn) {
    const ent = entitlementsFor(planOf(userId));
    if (!signOrCheckAdvisor(userId, advisorId, ent.maxStaffAdvisors)) {
      res.status(403).json(upgradeError(`Your staff is full (${ent.maxStaffAdvisors} advisors on the free plan). Upgrade to Pro to work with all ${ADVISORS.length} coaching minds.`));
      return;
    }
  }
  const gamify = award(userId, "chat", advisorId);
  const system = builtIn
    ? advisorSystemPrompt(builtIn, teamContext(userId), Boolean(secondOpinion))
    : customAdvisorSystemPrompt(custom!, teamContext(userId), Boolean(secondOpinion));
  const advisorName = builtIn?.name ?? custom!.name;

  await streamToSSE(res, {
    tier: tierFor(planOf(userId), "chat"),
    userId,
    system,
    messages: messages as Anthropic.Beta.BetaMessageParam[],
    maxTokens: 6000,
    onEngineError: () => refundMessage(userId),
    mockText: MOCK_CHAT_REPLY,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: (fullText) => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      addSeasonEntry(userId, {
        kind: "chat",
        title: secondOpinion ? `Second opinion from ${advisorName}` : `Brainstorm with ${advisorName}`,
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
    onEngineError: () => refundMessage(userId),
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
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: structuredLimitMsg(userId) });
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
      mock: (() => { const m = mockSessionPlan(ageGroup, theme, Number(durationMinutes)); return { ...m, title: `${m.title} (demo sample)` }; })(),
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
    refundStructured(userId);
    res.status(500).json({ error: "Generation failed — nothing was counted against your daily limit. Try again." });
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
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: structuredLimitMsg(userId) });
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
    refundStructured(userId);
    res.status(500).json({ error: "Scan failed — nothing was counted against your daily limit. Try a clearer photo." });
  }
});

// ---- Season periodization planner ----
api.post("/season-plan", async (req, res) => {
  const userId = uid(req);
  if (!entitlementsFor(planOf(userId)).seasonPlanner) {
    res.status(403).json(upgradeError("The season periodization planner is a Pro feature."));
    return;
  }
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: structuredLimitMsg(userId) });
    return;
  }
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
      maxTokens: 14000,
      mock: mockSeasonPlan(Number(weeks), squad?.ageGroup),
    });
    const gamify = award(userId, "session");
    const entryId = addSeasonEntry(userId, { kind: "session", title: `Season plan: ${plan_.title}`, summary: `${plan_.weeks.length} weeks`, payload: plan_ });
    res.json({ plan: plan_, award: gamify, entryId });
  } catch (err) {
    console.error(err);
    refundStructured(userId);
    res.status(500).json({ error: "Generation failed — nothing was counted against your daily limit. Try again." });
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
  // A plan cached in demo mode (labeled "(demo sample)") must not be replayed
  // once a real engine is configured — regenerate it live instead.
  const cachedIsDemo = Boolean(cached && String((cached as { title?: string }).title ?? "").includes("(demo sample)"));
  if (cached && !(hasAnyProvider() && cachedIsDemo)) {
    res.json({ plan: cached, cached: true });
    return;
  }
  const ent = entitlementsFor(planOf(userId));
  if (monthlyCount("libunlock", userId) >= ent.libraryUnlocksPerMonth) {
    res.status(403).json(upgradeError(`You've used all ${ent.libraryUnlocksPerMonth} free Library unlocks this month. Pro unlocks the whole catalog — all ${SESSION_TEMPLATES.length} sessions.`));
    return;
  }
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: structuredLimitMsg(userId) });
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
      // Demo unlocks build from the catalog's own exercise content — the
      // signature exercise keyword-matches itself, so the drills are real.
      mock: (() => { const m = mockSessionPlan(template.ageBand, template.theme, 75); return { ...m, title: `${template.topicName} (demo sample)` }; })(),
    });

    saveLibraryPlan(userId, template.id, plan_);
    bumpMonthly("libunlock", userId);
    const gamify = award(userId, "library");
    const entryId = addSeasonEntry(userId, { kind: "session", title: `Library: ${template.title}`, summary: `${template.phase} · ${template.format}`, payload: plan_ });
    res.json({ plan: plan_, award: gamify, entryId });
  } catch (err) {
    console.error(err);
    refundStructured(userId);
    res.status(500).json({ error: "Generation failed — nothing was counted against your daily limit. Try again." });
  }
});

// ---- Formation lab ----
api.post("/formation", async (req, res) => {
  const userId = uid(req);
  const { format, ageGroup, style, squadNotes, opponentNotes, depth } = req.body ?? {};
  const fDepth = depth === "deep" ? "deep" : depth === "standard" ? "standard" : "light";
  if (fDepth !== "light" && planOf(userId) === "free") {
    res.status(403).json(upgradeError(fDepth === "deep"
      ? "Deep Tactical analysis (the flagship engine) is a Pro feature."
      : "Standard Tactical analysis is a Pro feature — free coaches get Quick reads."));
    return;
  }
  if (!format || !ageGroup) {
    res.status(400).json({ error: "format and ageGroup are required" });
    return;
  }
  // Product policy (matches US Soccer): at 4v4 there are no formations —
  // kids learn the whole pitch. The UI never offers it; guard the API too.
  if (String(format) === "4v4") {
    res.status(400).json({ error: "At 4v4 there are no formations — that age is about touches, not positions. Formations start at 7v7 (U9)." });
    return;
  }
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: structuredLimitMsg(userId) });
    return;
  }
  try {
    const analysis = await generateStructured<typeof MOCK_FORMATION>({
      tier: fDepth,
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
      maxTokens: 8000,
      mock: mockFormation(String(format)),
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
    refundStructured(userId);
    res.status(500).json({ error: "Generation failed — nothing was counted against your daily limit. Try again." });
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
    onEngineError: () => refundMessage(userId),
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
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: structuredLimitMsg(userId) });
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
      maxTokens: 8000,
      mock: { ...MOCK_GAME_PLAN, matchTitle: `vs ${opponent} — ${competition || "league game"} (demo sample)` },
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
    refundStructured(userId);
    res.status(500).json({ error: "Generation failed — nothing was counted against your daily limit. Try again." });
  }
});

api.post("/matchday/live", async (req, res) => {
  const userId = uid(req);
  if (!entitlementsFor(planOf(userId)).liveBench) {
    res.status(403).json(upgradeError("Live Bench — real-time sideline adjustments during the game — is a Pro feature."));
    return;
  }
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
    onEngineError: () => refundMessage(userId),
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
    tier: tierFor(planOf(userId), "structured"),
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
    onEngineError: () => refundMessage(userId),
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
  // A "-note" kind is the optional comment following a thumbs-down the coach
  // already submitted — one rating, one award.
  const isFollowUpNote = String(kind ?? "").endsWith("-note");
  const gamify = isFollowUpNote ? null : award(userId, "rate");
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
  const entF = entitlementsFor(planOf(userId));
  if (monthlyCount("filmclip", userId) >= entF.filmClipsPerMonth) {
    res.status(403).json(upgradeError(`Free coaches get ${entF.filmClipsPerMonth} Film Room clip per month. Pro is unlimited.`));
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
    tier: tierFor(planOf(userId), "structured"),
    userId,
    system: `${baseSystemPrompt()}${teamContext(userId)}

FILM ROOM MODE. You are the video analyst on the coach's staff. The coach uploaded keyframes from one continuous clip, in order, with timestamps. Read the sequence like film: track how the shape, spacing, and key players change frame to frame. Reference timestamps for every observation. Be specific about WHERE on the field things happen and WHO (jersey color/position) is involved. Respond in markdown:
## What I See  (timestamped observations across the sequence)
## The Problem  (the single biggest tactical issue this clip reveals)
## Fix It  (the picture/instruction to give players)
## Train It  (1-2 activities that recreate and fix this exact moment)`,
    messages: [{ role: "user", content }],
    maxTokens: 6000,
    onEngineError: () => refundMessage(userId),
    mockText: MOCK_FILM,
    doneExtra: { award: gamify, remaining: quota.remaining },
    onDone: (fullText) => {
      bumpMonthly("filmclip", userId); // the monthly clip only counts on success
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

function sanitizeSquad(s: SquadProfile): SquadProfile {
  return {
    teamName: s.teamName,
    coachExperience: (["new", "intermediate", "experienced"] as const).includes(s.coachExperience) ? s.coachExperience : "intermediate",
    ageGroup: s.ageGroup,
    format: s.format || "9v9",
    level: s.level || "rec",
    preferredStyle: s.preferredStyle || "",
    rosterNotes: s.rosterNotes || "",
    seasonGoals: s.seasonGoals || "",
    nextOpponent: String(s.nextOpponent ?? "").slice(0, 80),
    nextGameDate: String(s.nextGameDate ?? "").slice(0, 10),
    icsUrl: String(s.icsUrl ?? "").slice(0, 500),
    players: (Array.isArray(s.players) ? s.players : []).slice(0, 30).map((p) => ({
      name: String(p?.name ?? "").slice(0, 60),
      number: String(p?.number ?? "").slice(0, 4),
      positions: String(p?.positions ?? "").slice(0, 40),
      foot: String(p?.foot ?? "").slice(0, 10),
      notes: String(p?.notes ?? "").slice(0, 300),
    })),
  };
}

// Saves the ACTIVE team's profile.
api.put("/team", (req, res) => {
  const userId = uid(req);
  const s = req.body as SquadProfile;
  if (!s?.teamName || !s?.ageGroup) {
    res.status(400).json({ error: "teamName and ageGroup are required" });
    return;
  }
  const squad = sanitizeSquad(s);
  // The calendar link is imported on a different card than the profile form —
  // a profile save that omits icsUrl must never wipe an existing import.
  if (s.icsUrl === undefined) squad.icsUrl = getSquad(userId)?.icsUrl ?? "";
  saveSquad(userId, squad);
  const gamify = award(userId, "squad");
  res.json({ squad, award: gamify });
});

// ---- Multi-team: list, create, switch, delete ----
api.get("/teams", (req, res) => {
  res.json({
    teams: listTeams(uid(req)).map((t) => ({
      id: t.id, active: t.active,
      teamName: t.squad.teamName, ageGroup: t.squad.ageGroup, format: t.squad.format, level: t.squad.level,
      players: (t.squad.players ?? []).filter((p) => p.name).length,
    })),
  });
});

api.post("/teams", (req, res) => {
  const userId = uid(req);
  const s = req.body as SquadProfile;
  if (!s?.teamName || !s?.ageGroup) {
    res.status(400).json({ error: "teamName and ageGroup are required" });
    return;
  }
  const maxTeams = entitlementsFor(planOf(userId)).maxTeams;
  if (listTeams(userId).length >= maxTeams) {
    res.status(maxTeams === 1 ? 403 : 400).json(
      maxTeams === 1 ? upgradeError("Multiple teams is a Pro feature — run up to 8 squads with separate memory.") : { error: "Maximum of 8 teams per account." },
    );
    return;
  }
  const teamId = createTeam(userId, sanitizeSquad(s));
  const gamify = award(userId, "squad");
  res.json({ teamId, award: gamify });
});

api.post("/teams/:id/activate", (req, res) => {
  if (!setActiveTeam(uid(req), Number(req.params.id))) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  res.json({ ok: true });
});

api.delete("/teams/:id", (req, res) => {
  if (!deleteTeam(uid(req), Number(req.params.id))) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  res.json({ ok: true });
});

api.get("/season", (req, res) => {
  // Metadata only — full artifacts (session plans, game plans, formations)
  // are fetched per-entry so the timeline stays light at any season length.
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  res.json({
    season: getSeason(uid(req), limit).map(({ payload, ...meta }) => ({ ...meta, hasArtifact: payload !== undefined })),
  });
});

// The repository read: reopen any saved artifact exactly as it was generated.
api.get("/season/:id", (req, res) => {
  const entry = getSeasonEntryById(uid(req), Number(req.params.id));
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json({ entry });
});

// Repository housekeeping: a coach can prune their own history. Note the
// entry also leaves season memory — deleting it means the AI forgets it too.
api.delete("/season/:id", (req, res) => {
  if (!deleteSeasonEntry(uid(req), Number(req.params.id))) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json({ ok: true });
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

// ---- The Tactical Painter: the coach DESCRIBES the situation, the engine
// paints the answer on the board — positions for every player, the ball's
// route, numbered instructions, one headline. Verified geometric facts are
// computed client-side and passed in as ground truth; the paint is validated
// against hard geometry on the way back. The math checks, the AI talks.
const BOARD_READS_PER_DAY: Record<Plan, number> = { free: 20, pro: 300 };

const BOARD_SCENARIO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "rationale", "positions", "ballPath", "callouts"],
  properties: {
    headline: { type: "string", description: "The ONE instruction to shout from the touchline for this situation" },
    rationale: { type: "string", description: "2-3 sentences reading the WHOLE picture: their threat, our answer, the trade we accept" },
    positions: {
      type: "array",
      description: "Target position for EVERY one of our players (every label exactly once)",
      items: {
        type: "object", additionalProperties: false, required: ["label", "x", "y"],
        properties: { label: { type: "string" }, x: { type: "number" }, y: { type: "number" } },
      },
    },
    opponentPositions: {
      type: "array",
      description: "Optional: adjusted positions for their players if the described situation moves them",
      items: {
        type: "object", additionalProperties: false, required: ["label", "x", "y"],
        properties: { label: { type: "string" }, x: { type: "number" }, y: { type: "number" } },
      },
    },
    ballPath: {
      type: "array", minItems: 2, maxItems: 6,
      description: "The ball's route for this plan, first touch to the moment it succeeds",
      items: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number" }, y: { type: "number" } } },
    },
    callouts: {
      type: "array", minItems: 3, maxItems: 5,
      description: "On-field coaching instructions, anchored where the action happens",
      items: {
        type: "object", additionalProperties: false, required: ["kind", "x", "y", "text"],
        properties: {
          kind: { type: "string", enum: ["press", "free", "exploit", "danger"] },
          x: { type: "number" }, y: { type: "number" },
          fromLabel: { type: "string", description: "Our player whose job this is — draws the assignment arrow" },
          text: { type: "string", description: "The instruction, in touchline language a youth coach would shout" },
        },
      },
    },
  },
};

interface PaintedPicture {
  headline: string;
  rationale: string;
  positions: { label: string; x: number; y: number }[];
  opponentPositions?: { label: string; x: number; y: number }[];
  ballPath: { x: number; y: number }[];
  callouts: { kind: "press" | "free" | "exploit" | "danger"; x: number; y: number; fromLabel?: string; text: string }[];
}

const clampGrid = (v: unknown, lo = 3, hi = 97) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 50)));

// Hard geometric sanitation of the model's paint — labels, bounds, caps.
// The client re-validates and collision-resolves; this is the server floor.
function sanitizePicture(raw: PaintedPicture, sentLabels: string[], oppLabels: string[] = []): PaintedPicture {
  const labelSet = new Set(sentLabels);
  const seen = new Set<string>();
  const positions = (raw.positions ?? [])
    .filter((p) => labelSet.has(String(p.label)) && !seen.has(String(p.label)) && (seen.add(String(p.label)), true))
    .map((p) => ({ label: String(p.label).slice(0, 8), x: clampGrid(p.x), y: clampGrid(p.y) }));
  const oppSet = new Set(oppLabels);
  const oppSeen = new Set<string>();
  const opponentPositions = (raw.opponentPositions ?? [])
    .filter((p) => oppSet.has(String(p.label)) && !oppSeen.has(String(p.label)) && (oppSeen.add(String(p.label)), true))
    .slice(0, 15)
    .map((p) => ({ label: String(p.label).slice(0, 8), x: clampGrid(p.x), y: clampGrid(p.y) }));
  return {
    headline: String(raw.headline ?? "").slice(0, 160),
    rationale: String(raw.rationale ?? "").slice(0, 600),
    positions,
    opponentPositions: opponentPositions.length ? opponentPositions : undefined,
    ballPath: (raw.ballPath ?? []).slice(0, 6).map((p) => ({ x: clampGrid(p.x), y: clampGrid(p.y) })),
    callouts: (raw.callouts ?? []).slice(0, 5).map((c) => ({
      kind: (["press", "free", "exploit", "danger"] as const).includes(c.kind) ? c.kind : "exploit",
      x: clampGrid(c.x), y: clampGrid(c.y),
      fromLabel: c.fromLabel ? String(c.fromLabel).slice(0, 8) : undefined,
      text: String(c.text ?? "").slice(0, 240),
    })).filter((c) => c.text.length > 10),
  };
}

api.post("/board/scenario", async (req, res) => {
  const userId = uid(req);
  const day = userToday(userId);
  const key = `boardcap:${userId}:${day}`;
  const cap = BOARD_READS_PER_DAY[planOf(userId)];
  // Validate the request BEFORE reserving a slot so bad input never burns quota.
  const { format, formation, scenario, board, opponents, opponent, facts, depth } = req.body ?? {};
  const scenarioTxt = String(scenario ?? "").trim().slice(0, 500);
  const fmt = String(format ?? "").slice(0, 20);
  const form = String(formation ?? "").slice(0, 40);
  const rowOk = (p: unknown) => !!p && typeof p === "object"
    && ["string", "number", "undefined"].includes(typeof (p as { label?: unknown }).label);
  if (!formation || !Array.isArray(board) || board.length < 5 || !board.every(rowOk) || scenarioTxt.length < 3) {
    res.status(400).json({ error: "formation, the board, and a described scenario are required" });
    return;
  }
  const depthTier = depth === "deep" ? "deep" : depth === "standard" ? "standard" : "light";
  if (depthTier !== "light" && planOf(userId) === "free") {
    res.status(403).json(upgradeError(depthTier === "deep"
      ? "Deep Tactical paints (the flagship engine) are a Pro feature."
      : "Standard Tactical paints are a Pro feature — free coaches get Quick paints."));
    return;
  }
  if (overComputeCeiling(userId)) {
    res.status(429).json({ error: CEILING_MSG });
    return;
  }
  // Reserve the slot ATOMICALLY before the awaited model call — parallel
  // requests each get a distinct incremented value, so a burst can't all read
  // the same pre-value and slip past the cap. Refund below on any failure.
  const reserved = kvIncrement(key);
  if (reserved > cap) {
    kvDecrement(key);
    res.status(planOf(userId) === "free" ? 403 : 429).json(
      planOf(userId) === "free"
        ? upgradeError(`You've used all ${BOARD_READS_PER_DAY.free} free board paints today — Pro gets ${BOARD_READS_PER_DAY.pro}/day.`)
        : { error: "Daily engine limit reached — resets tomorrow." },
    );
    return;
  }
  try {
    const boardIn = (board as { label: string; role: string; x: number; y: number }[]).slice(0, 24);
    const sentLabels = boardIn.map((p) => String(p.label ?? "?").slice(0, 8));
    const boardTxt = boardIn
      .map((p) => `${String(p.label ?? "?").slice(0, 8)} (${String(p.role ?? "?").slice(0, 4)}) at [${Math.round(Number(p.x) || 0)},${Math.round(Number(p.y) || 0)}]`)
      .join("; ");
    const oppsIn = (Array.isArray(opponents) ? (opponents as { label: string; x: number; y: number }[]) : [])
      .filter(rowOk)
      .slice(0, 15);
    const oppLabels = oppsIn.map((o) => String(o.label ?? "O?").slice(0, 8));
    const oppTxt = oppsIn
      .map((o) => `${String(o.label ?? "O?").slice(0, 8)} at [${Math.round(Number(o.x) || 0)},${Math.round(Number(o.y) || 0)}]`)
      .join("; ");
    const factsTxt = (Array.isArray(facts) ? facts : []).slice(0, 10).map((f) => `- ${String(f).slice(0, 160)}`).join("\n");

    const raw = await generateStructured<PaintedPicture>({
      tier: depthTier,
      userId,
      system: `${baseSystemPrompt()}${teamContext(userId)}

You are TactIQ's TACTICAL PAINTER — a professional first-team analyst who answers a coach's described situation by DRAWING it: exact positions, the ball's route, and touchline instructions. Coordinates: 100x100 grid, y=0 is the OPPONENT goal (up = attacking), y=100 our own goal, x=0 the left touchline, x=100 the right touchline; our GK belongs around y=85-95 (push toward ~78 only when sweeping behind a high line) unless the coach's situation explicitly demands otherwise.

Paint by mainstream doctrine, adapted to the described situation and the age group in team memory:
- Defending: pressure-cover-balance; blocks compact 30-35 units front-to-back, shifted toward the ball with the weak side tucked; the back line NEVER chases out of shape in a press — the front curves runs and traps on the touchline, mids lock pivots.
- Build-up: create the +1 against their first line; the spare man carries; a receiver between their lines, half-turned.
- Transitions: first pass into feet, runners beyond, ALWAYS 2+1 rest defense behind the ball.
- Crosses/box: goal-side marks, front-post zone, the cutback zone owned by a named player.

Hard rules for the paint:
- positions must contain EVERY one of our labels exactly once — no additions, no omissions.
- Realistic spacing: no two players within 5 grid units; keep the picture connected (no player more than ~26 from every teammate unless the situation demands a target/outlet).
- VERIFIED FACTS below were computed geometrically from the actual board — trust them over your own counting, and reference their numbers in your words.
- callouts name OUR players by label (and by roster name from team memory when natural), in concrete touchline language a youth coach would actually shout. Anchor each callout where the action happens; set fromLabel to the player whose job it is.
- ballPath tells this plan's story: it STARTS where the ball actually is in the coach's situation (their ball if we're defending — the path then shows where we win it and where it goes), travels, and ends when the plan WORKS.
- If you reposition their players, opponentPositions must reuse EXACTLY the opponent labels listed — never invent new ones.
- headline: the ONE instruction to shout first. rationale: read the whole picture — their threat, our answer, the trade.`,
      user: `Format: ${fmt}. Our formation: ${form}.
Our current board: ${boardTxt}
${oppTxt ? `Their players on the board (same grid): ${oppTxt}` : "No opposition placed — paint against a typical opponent for this age group."}
${opponent ? `Their game plan, as scouted by the coach: ${String(opponent).slice(0, 300)}` : ""}
${factsTxt ? `VERIFIED GEOMETRIC FACTS (computed from the board — ground truth):\n${factsTxt}` : ""}

THE COACH'S SITUATION — paint the answer to exactly this:
"${scenarioTxt}"`,
      schema: BOARD_SCENARIO_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 3000,
      mock: {
        headline: "Demo — the live engine paints your exact scenario (client renders the authored picture instead)",
        rationale: "Without an engine key the app paints the closest authored scenario locally. Add ANTHROPIC_API_KEY and this becomes a live tactical read of your described situation.",
        positions: boardIn.map((p) => ({ label: String(p.label ?? "?").slice(0, 8), x: Math.round(Number(p.x) || 50), y: Math.round(Number(p.y) || 50) })),
        ballPath: [{ x: 50, y: 88 }, { x: 50, y: 50 }],
        callouts: [
          { kind: "exploit" as const, x: 50, y: 50, text: "Demo mode — the live engine will place instructions exactly where the action is for your scenario" },
          { kind: "free" as const, x: 50, y: 70, text: "Your positions and opposition are already being read — only the judgment layer is waiting on the key" },
          { kind: "danger" as const, x: 50, y: 30, text: "Set ANTHROPIC_API_KEY on the server to activate live paints" },
        ],
      },
    });
    const picture = sanitizePicture(raw, sentLabels, oppLabels);
    // A paint that lost more than 20% of the squad is a failed paint — the
    // coach never sees a half-drawn board.
    if (picture.positions.length < Math.ceil(sentLabels.length * 0.8)) {
      kvDecrement(key); // refund the reserved slot — an incomplete paint doesn't count
      res.status(502).json({ error: "The engine returned an incomplete picture — try again, it won't count against your daily limit." });
      return;
    }
    addSeasonEntry(userId, {
      kind: "formation",
      title: `Board: ${snip(scenarioTxt, 70)}`,
      summary: `${form} (${fmt}) — ${snip(picture.headline, 130)}`,
    });
    const gamify = award(userId, "board");
    res.json({ picture, award: gamify, readsLeft: Math.max(0, cap - reserved) });
  } catch (err) {
    console.error(err);
    kvDecrement(key); // refund the reserved slot — a failed paint doesn't count
    res.status(500).json({ error: "The paint failed — nothing was counted against your daily limit. Try again." });
  }
});

// ---- Read my change: the coach moved a player; the engine reads the trade ----
// Whole-board aware — it gets the shape BEFORE and AFTER plus what moved, and
// returns what the move gained, what it cost, and an overall read. Shares the
// same daily board cap, ceiling, depth gate and reserve-before-await guards.
const MOVE_READ_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["gains", "costs", "overall", "verdict"],
  properties: {
    gains: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" }, description: "What this change GAINED — concrete, whole-board" },
    costs: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" }, description: "What this change GAVE UP — concrete, whole-board" },
    overall: { type: "string", description: "One-line read of the RESULTING shape and the trade" },
    verdict: { type: "string", enum: ["better", "tradeoff", "risky"] },
  },
};
interface MoveReadOut { gains: string[]; costs: string[]; overall: string; verdict: "better" | "tradeoff" | "risky"; }
function sanitizeMoveRead(raw: MoveReadOut): MoveReadOut {
  const strs = (a: unknown, n: number) => (Array.isArray(a) ? a : []).map((s) => String(s).slice(0, 200)).filter((s) => s.length > 3).slice(0, n);
  const gains = strs(raw?.gains, 4);
  const costs = strs(raw?.costs, 4);
  return {
    gains: gains.length ? gains : ["A connected shape."],
    costs: costs.length ? costs : ["Watch the space you left behind."],
    overall: String(raw?.overall ?? "").slice(0, 260) || "A trade — you gained one thing and gave up another.",
    verdict: (["better", "tradeoff", "risky"] as const).includes(raw?.verdict) ? raw.verdict : "tradeoff",
  };
}

api.post("/board/read-move", async (req, res) => {
  const userId = uid(req);
  const day = userToday(userId);
  const capKey = `boardcap:${userId}:${day}`;
  const cap = BOARD_READS_PER_DAY[planOf(userId)];
  const { format, formation, scenario, board, previous, moved, opponents, opponent, facts, depth } = req.body ?? {};
  const rowOk = (p: unknown) => !!p && typeof p === "object";
  if (!Array.isArray(board) || board.length < 5 || !board.every(rowOk) || !Array.isArray(moved) || moved.length === 0) {
    res.status(400).json({ error: "Move a player first, then read the change." });
    return;
  }
  const depthTier = depth === "deep" ? "deep" : depth === "standard" ? "standard" : "light";
  if (depthTier !== "light" && planOf(userId) === "free") {
    res.status(403).json(upgradeError("Deeper move reads are a Pro feature — free coaches get the Quick read."));
    return;
  }
  if (overComputeCeiling(userId)) {
    res.status(429).json({ error: CEILING_MSG });
    return;
  }
  const reserved = kvIncrement(capKey);
  if (reserved > cap) {
    kvDecrement(capKey);
    res.status(planOf(userId) === "free" ? 403 : 429).json(
      planOf(userId) === "free"
        ? upgradeError(`You've used all ${BOARD_READS_PER_DAY.free} free board reads today — Pro gets ${BOARD_READS_PER_DAY.pro}/day.`)
        : { error: "Daily engine limit reached — resets tomorrow." },
    );
    return;
  }
  try {
    const cur = (board as { label: string; role: string; x: number; y: number }[]).slice(0, 24);
    const prev = (Array.isArray(previous) ? previous : []).slice(0, 24) as { label: string; x: number; y: number }[];
    const mv = (moved as { label: string; from?: { x: number; y: number }; x: number; y: number }[]).slice(0, 11);
    const line = (p: { label: string; x: number; y: number }) => `${String(p.label ?? "?").slice(0, 8)}[${Math.round(Number(p.x) || 0)},${Math.round(Number(p.y) || 0)}]`;
    const movedTxt = mv.map((m) => `${String(m.label ?? "?").slice(0, 8)}: ${m.from ? `[${Math.round(Number(m.from.x) || 0)},${Math.round(Number(m.from.y) || 0)}]` : "?"} -> [${Math.round(Number(m.x) || 0)},${Math.round(Number(m.y) || 0)}]`).join("; ");
    const factsTxt = (Array.isArray(facts) ? facts : []).slice(0, 10).map((f) => `- ${String(f).slice(0, 160)}`).join("\n");
    const out = await generateStructured<MoveReadOut>({
      tier: depthTier,
      userId,
      system: `${baseSystemPrompt()}${teamContext(userId)}

You are TactIQ's board analyst. The coach just MOVED one or more players on the tactics board. Read the TRADE — not a canned per-piece line, but what the change actually gains and costs given the WHOLE board and the opponent.
Coordinates: 100x100 grid, y=0 is the OPPONENT goal (up = attacking), y=100 our own goal, x=0 the left touchline.
Rules:
- gains and costs must be concrete and reference the real picture (who is now free, what space opened, which line is thin, where the ball can go). Name players by label.
- overall: one line on the RESULTING shape (its structure and the single most important consequence).
- verdict: "better" if the gain clearly outweighs the cost, "risky" if it opens something dangerous (keeper exposed, no rest defense, a line split, a big gap), else "tradeoff".
- Judge against mainstream doctrine (pressure-cover-balance, rest defense, staying connected). Be honest — if it breaks the shape, say so.`,
      user: `Format: ${String(format ?? "").slice(0, 20)}. Our formation: ${String(formation ?? "").slice(0, 40)}.
${scenario ? `The situation the shape was built for: "${String(scenario).slice(0, 300)}"` : ""}
${opponent ? `Their game plan: ${String(opponent).slice(0, 300)}` : ""}
Shape BEFORE the move: ${prev.map(line).join(" ")}
Shape AFTER the move: ${cur.map(line).join(" ")}
${(Array.isArray(opponents) ? opponents : []).length ? `Their players on the board: ${(opponents as { label: string; x: number; y: number }[]).slice(0, 15).map(line).join(" ")}` : ""}
What the coach MOVED: ${movedTxt}
${factsTxt ? `VERIFIED GEOMETRIC FACTS (from the board — ground truth):\n${factsTxt}` : ""}

Read this change.`,
      schema: MOVE_READ_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 900,
      mock: {
        gains: ["Demo read — the live engine weighs this exact move against your whole board and the opposition."],
        costs: ["Add ANTHROPIC_API_KEY on the server to activate live move reads."],
        overall: "Demo mode — this is where the engine tells you what the move gained, what it cost, and whether the shape still holds.",
        verdict: "tradeoff" as const,
      },
    });
    const read = sanitizeMoveRead(out);
    res.json({ read, readsLeft: Math.max(0, cap - reserved) });
  } catch (err) {
    console.error(err);
    kvDecrement(capKey); // refund — a failed read doesn't count
    res.status(500).json({ error: "The read failed — nothing was counted against your daily limit. Try again." });
  }
});

// ---- The Touchline Debate: weekly dilemma, tap to vote, verdict Saturday ----
api.get("/debate", (req, res) => {
  res.json(debateState(uid(req)));
});

api.post("/debate/vote", (req, res) => {
  const userId = uid(req);
  const state = debateState(userId);
  const choice = String(req.body?.choice ?? "");
  if (!state.debate.options.some((o) => o.id === choice)) {
    res.status(400).json({ error: "Pick one of the options" });
    return;
  }
  const firstVote = state.yourVote === null;
  castVote(userId, choice);
  const gamify = firstVote ? award(userId, "debate") : null;
  res.json({ ...debateState(userId), award: gamify });
});

// ---- The Staff Room: two opposed advisors argue the coach's question,
// Coach Sam breaks the tie against THIS team's memory ----
api.post("/staff-debate", async (req, res) => {
  const userId = uid(req);
  if (planOf(userId) !== "pro") {
    res.status(403).json(upgradeError("Staff debates — two opposed coaching minds arguing YOUR question, with Coach Sam's tiebreak — are a Pro feature."));
    return;
  }
  const question = String(req.body?.question ?? "").trim().slice(0, 400);
  if (!question) {
    res.status(400).json({ error: "Ask the staff a question" });
    return;
  }
  // a debate is three voices — it costs three messages. Reserve all three
  // ATOMICALLY before the awaited model calls so parallel debates can't share
  // one pre-count and slip past the daily cap; refund all three on any failure.
  const limit = dailyLimit(userId);
  if (overComputeCeiling(userId)) {
    res.status(429).json({ error: quotaError(userId) });
    return;
  }
  incrementUsage(userId); incrementUsage(userId); incrementUsage(userId);
  if (getUsage(userId) > limit) {
    refundMessage(userId); refundMessage(userId); refundMessage(userId);
    res.status(429).json({ error: quotaError(userId) });
    return;
  }
  const [advA, advB] = routeDebatePair(question);
  const ctx = teamContext(userId);
  try {
    const [aText, bText] = await Promise.all([
      generateText({
        tier: tierFor(planOf(userId), "chat"),
        userId,
        system: debateAdvisorPrompt(advA, advB, ctx),
        user: question,
        maxTokens: 500,
        mock: `[Demo debate — set ANTHROPIC_API_KEY for the live staff room]\n\nMy school's answer: control the situation structurally before you chase outcomes. With a live engine this reads YOUR question and roster and argues my actual doctrine — and disagrees with ${advB.name} where our schools genuinely split.`,
      }),
      generateText({
        tier: tierFor(planOf(userId), "chat"),
        userId,
        system: debateAdvisorPrompt(advB, advA, ctx),
        user: question,
        maxTokens: 500,
        mock: `[Demo debate]\n\nMy school sees it differently: solve the immediate percentages first. Live, this is my doctrine arguing with ${advA.name}'s — two real philosophies, one question, your team.`,
      }),
    ]);
    const verdict = await generateText({
      tier: tierFor(planOf(userId), "chat"),
      userId,
      system: `${assistantSystemPrompt(ctx)}

STAFF VERDICT MODE: two of your specialist advisors have answered the coach's question and disagree (or differ in emphasis). Your job is the tiebreak.
- Side with one, or synthesize — but COMMIT, and ground the call in THIS team's memory (age, roster, results, what they've trained).
- Steal the best single idea from the losing side and say so.
- Under 120 words. End with ONE concrete action for the next session or game.`,
      user: `The coach asked the staff: "${question}"

${advA.name} (${advA.tagline}) argued:
${aText}

${advB.name} (${advB.tagline}) argued:
${bText}

Give your verdict.`,
      maxTokens: 450,
      mock: "[Demo verdict]\n\nFor your team, I'd lean toward the first read — but steal the set-piece idea from the second. With a live engine this verdict is grounded in your actual roster, results, and training history. Next session: 20 minutes on the picture we just argued about.",
    });

    const gamify = award(userId, "staff");
    const entryId = addSeasonEntry(userId, {
      kind: "chat",
      title: `Staff debate: ${snip(question, 60)}`,
      summary: `${advA.name}: ${snip(aText, 90)} | ${advB.name}: ${snip(bText, 90)} | Verdict: ${snip(verdict, 110)}`,
      payload: {
        staffDebate: true,
        question,
        a: { advisorId: advA.id, name: advA.name, emoji: advA.emoji, tagline: advA.tagline, text: aText },
        b: { advisorId: advB.id, name: advB.name, emoji: advB.emoji, tagline: advB.tagline, text: bText },
        verdict,
      },
    });
    res.json({
      a: { advisorId: advA.id, name: advA.name, emoji: advA.emoji, tagline: advA.tagline, text: aText },
      b: { advisorId: advB.id, name: advB.name, emoji: advB.emoji, tagline: advB.tagline, text: bText },
      verdict,
      award: gamify,
      entryId,
    });
  } catch (err) {
    console.error(err);
    refundMessage(userId); refundMessage(userId); refundMessage(userId); // three voices refunded on failure
    res.status(500).json({ error: "The staff room hit a snag — try again." });
  }
});

// ---- Entitlements: what this coach's plan includes, with live usage ----
api.get("/entitlements", (req, res) => {
  const userId = uid(req);
  const plan = planOf(userId);
  const ent = entitlementsFor(plan);
  const cap = (n: number) => (n >= Number.MAX_SAFE_INTEGER ? null : n);
  res.json({
    plan,
    staff: getStaff(userId),
    maxStaffAdvisors: cap(ent.maxStaffAdvisors),
    customAdvisors: ent.customAdvisors,
    libraryUnlocksLeft: ent.libraryUnlocksPerMonth >= Number.MAX_SAFE_INTEGER ? null : Math.max(0, ent.libraryUnlocksPerMonth - monthlyCount("libunlock", userId)),
    filmClipsLeft: ent.filmClipsPerMonth >= Number.MAX_SAFE_INTEGER ? null : Math.max(0, ent.filmClipsPerMonth - monthlyCount("filmclip", userId)),
    liveBench: ent.liveBench,
    seasonPlanner: ent.seasonPlanner,
    maxTeams: ent.maxTeams,
    libraryCount: SESSION_TEMPLATES.length,
    billingConfigured: stripeConfigured,
  });
});

// ---- Home: the assistant coach's desk, aggregated ----

const PHASE_KEYWORDS: [string, RegExp][] = [
  ["defending", /defend|set piece|corner|block|compact|press(?:ure|ing)? ?(?:cover|triggers)|1v1 defending|marking/i],
  ["possession", /rondo|possession|build|passing|out of the back|switch|keep-?away/i],
  ["attacking", /finish|attack|cross|shoot|combination|striker|final third|1v1 attacking|dribbl/i],
  ["transition", /transition|counter|press(?:ing)?\b/i],
  ["technical", /ball mastery|first touch|technical|turns|skills|weak foot|scanning/i],
];

function classifyTheme(text: string): string {
  for (const [phase, re] of PHASE_KEYWORDS) if (re.test(text)) return phase;
  return "technical";
}

function parseRecord(entries: { title: string }[]): { w: number; d: number; l: number; gf: number; ga: number; form: string[] } {
  const rec = { w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] as string[] };
  for (const e of entries) {
    if (!e.title.startsWith("Post-game debrief")) continue;
    const m = /(\d+)\s*[-–]\s*(\d+)\s*(W|L|D|T)?/i.exec(e.title);
    if (!m) continue;
    const [, a, b, letterRaw] = m;
    const letter = (letterRaw ?? (Number(a) > Number(b) ? "W" : Number(a) < Number(b) ? "L" : "D")).toUpperCase().replace("T", "D");
    if (letter === "W") rec.w += 1;
    else if (letter === "L") rec.l += 1;
    else rec.d += 1;
    rec.gf += Number(a);
    rec.ga += Number(b);
    if (rec.form.length < 5) rec.form.push(letter);
  }
  return rec;
}

function suggestTheme(lastStory: string, balance: Record<string, number>): { theme: string; reason: string } {
  const s = lastStory.toLowerCase();
  if (/corner|set piece|free kick/.test(s)) return { theme: "Defending Set Pieces", reason: "your last debrief flagged set pieces" };
  if (/press|play(ing)? out|build|goal kick/.test(s)) return { theme: "Playing Out of the Back", reason: "your last debrief flagged build-up under pressure" };
  if (/counter|caught|transition/.test(s)) return { theme: "Stopping Counters (Rest Defense)", reason: "your last debrief flagged transitions against" };
  if (/finish|chance|couldn'?t score|missed/.test(s)) return { theme: "Finishing & Shooting", reason: "your last debrief flagged chance conversion" };
  if (/conced|defend|leak/.test(s)) return { theme: "Compactness & Team Shape", reason: "your last debrief flagged defending" };
  const phases = ["defending", "possession", "attacking", "transition", "technical"];
  const least = phases.sort((a, b) => (balance[a] ?? 0) - (balance[b] ?? 0))[0];
  const themeByPhase: Record<string, string> = {
    defending: "1v1 Defending", possession: "Rondos & Keep-Away", attacking: "Finishing & Shooting",
    transition: "Transition Games (Both Ways)", technical: "Ball Mastery & First Touch",
  };
  return { theme: themeByPhase[least], reason: `you haven't trained ${least} recently` };
}

api.get("/home", async (req, res) => {
  const userId = uid(req);
  await maybeResyncIcs(userId).catch(() => {});
  const squad = getSquad(userId);
  const season = getSeason(userId, 60);
  const matches = season.filter((e) => e.kind === "match");
  const record = parseRecord(matches);
  const lastDebrief = matches.find((e) => e.title.startsWith("Post-game debrief")) ?? null;
  const lastStoryMatch = lastDebrief ? /Coach's account: "([^"]*)"/.exec(lastDebrief.summary) : null;
  const lastMatch = lastDebrief
    ? { title: lastDebrief.title.replace("Post-game debrief: ", ""), story: lastStoryMatch?.[1] ?? "", date: lastDebrief.date }
    : null;

  const events = upcomingEvents(userId, 14);
  const nextGameEvent = events.find((e) => e.kind === "game") ?? null;
  const nextGame = nextGameEvent
    ? { opponent: nextGameEvent.opponent || nextGameEvent.title, date: nextGameEvent.start, location: nextGameEvent.location }
    : squad?.nextOpponent
      ? { opponent: squad.nextOpponent, date: squad.nextGameDate || "", location: "" }
      : null;

  const recentSessions = season.filter((e) => e.kind === "session").slice(0, 6);
  const balance: Record<string, number> = { defending: 0, possession: 0, attacking: 0, transition: 0, technical: 0 };
  for (const s of recentSessions) balance[classifyTheme(`${s.title} ${s.summary}`)] += 1;

  const suggestion = suggestTheme(lastMatch?.story ?? "", balance);

  // Club curriculum theme for this coach's age band this week
  const club = getUserClub(userId);
  const clubTheme = club && squad ? clubThemeFor(club.id, weekStart(), bandForAgeServer(squad.ageGroup)) : null;

  res.json({
    clubTheme,
    squad,
    record,
    lastMatch,
    nextGame,
    week: events.filter((e) => new Date(e.start.replace(" ", "T")).getTime() < Date.now() + 7 * 86400000),
    trainingBalance: balance,
    sessionsLogged: recentSessions.length,
    suggestion,
    briefing: await dailyBriefing(userId, { record, lastMatch, nextGame, suggestion }),
    staffMemo: await staffMemo(userId),
  });
});

// Coach Sam's written morning briefing: one cached light-tier call per day.
async function dailyBriefing(
  userId: number,
  ctx: {
    record: { w: number; d: number; l: number };
    lastMatch: { title: string; story: string } | null;
    nextGame: { opponent: string; date: string } | null;
    suggestion: { theme: string; reason: string };
  },
): Promise<string> {
  const day = userToday(userId);
  const key = `brief:${userId}:${activeTeamId(userId) ?? 0}:${day}:${hasAnyProvider() ? "live" : "demo"}`;
  const cached = kvGet(key);
  if (cached) return cached;
  let text: string;
  // The briefing is a freebie (no quota slot), so the dollar ceiling is its
  // only gate — an over-ceiling account gets the assembled-from-memory line.
  if (!hasAnyProvider() || overComputeCeiling(userId)) {
    text = `Morning, coach. ${ctx.lastMatch ? `Last time out: ${ctx.lastMatch.title}${ctx.lastMatch.story ? ` — "${ctx.lastMatch.story}".` : "."}` : "No games logged yet — set up your team and log your first match day."} ${ctx.nextGame ? `Next up: ${ctx.nextGame.opponent}${ctx.nextGame.date ? ` on ${String(ctx.nextGame.date).slice(0, 10)}` : ""}.` : ""} I'd train ${ctx.suggestion.theme} this week — ${ctx.suggestion.reason}.`;
  } else {
    try {
      const result = await streamText({
        tier: "light",
        userId,
        system: `${baseSystemPrompt()}${teamContext(userId)}\n\nYou are Coach Sam writing the coach's short morning briefing for TactIQ's home page. 60-90 words, warm but specific, grounded ONLY in the team memory above. Structure: one line on the last game, one insight worth acting on, one recommendation for this week's training (name a Library exercise), one line on the next opponent if known. Plain text, no headers or lists.`,
        messages: [{ role: "user", content: `Write today's briefing. Suggested focus: ${ctx.suggestion.theme} (${ctx.suggestion.reason}).` }],
        maxTokens: 400,
        onDelta: () => {},
      });
      text = result.text.trim();
    } catch {
      return "";
    }
  }
  kvSet(key, text);
  return text;
}

// The client reports its UTC offset so every daily boundary (streaks,
// quests, caps, briefings, schedule windows) follows the coach's clock.
api.post("/tz", (req, res) => {
  const offset = Number(req.body?.offset);
  if (Number.isFinite(offset)) setUserTz(uid(req), offset);
  res.json({ ok: true });
});

// The weekly staff memo: Coach Sam plus the coach's two most-consulted
// advisors on this week's trends — one model call, cached per week.
async function staffMemo(userId: number): Promise<string> {
  const week = weekStart();
  const key = `memo:${userId}:${activeTeamId(userId) ?? 0}:${week}:${hasAnyProvider() ? "live" : "demo"}`;
  const cached = kvGet(key);
  if (cached) return cached;

  const consulted = topAdvisorNames(userId, 2);
  const staff = consulted.length
    ? ADVISORS.filter((a) => consulted.includes(a.name)).slice(0, 2)
    : [];
  // No consultations yet — no memo; the staff room has to be earned into.
  if (staff.length === 0) return "";

  const staffLine = staff.map((a) => `${a.emoji} ${a.name} (${a.tagline})`).join(" and ");
  let text: string;
  // Same rule as the briefing: over the compute ceiling, skip the model call.
  if (overComputeCeiling(userId)) return "";
  if (!hasAnyProvider()) {
    text = `**Staff memo — week of ${week}**\nThis week's staff table: ${staffLine}. With a live engine key, the three of us write you a real memo here every Monday — the week in one line, the trend we're watching in your season record, one note from each advisor in their own voice, and the priority for this week's training.`;
  } else {
    try {
      text = await generateText({
        tier: "standard",
        userId,
        system: `${assistantSystemPrompt(teamContext(userId))}

STAFF MEMO MODE: you are writing the coach's Monday staff memo together with the two advisors they consult most: ${staffLine}. Exactly five short lines, markdown, each on its own line:
1. **The week:** last game/training week in one honest line (from team memory).
2. **Trend:** the one pattern in the season record worth watching.
3. One-line note from the first advisor, in their voice, prefixed with their name.
4. One-line note from the second advisor, in their voice, prefixed with their name.
5. **This week:** the single training priority, with a Library exercise named if natural.
Ground everything in the team memory above. No preamble, no sign-off.`,
        user: `Write this week's staff memo (week of ${week}).`,
        maxTokens: 400,
        mock: "",
      });
    } catch {
      return "";
    }
  }
  kvSet(key, text);
  return text;
}

// ---- Onboarding: who is this coach? Collected once, used everywhere ----
const COACH_ROLES = ["head", "assistant", "parent", "director", "trainer"];
const REFERRALS = ["coach", "club", "social", "search", "event", "other"];
const CLUB_SIZES = ["1-5", "6-15", "16-40", "40+"];
const CHALLENGES = ["sessions", "tactics", "development", "parents"];

api.get("/onboarding", (req, res) => {
  const userId = uid(req);
  res.json({
    completed: kvGet(`onboard:${userId}`) === "done",
    hasTeam: Boolean(getSquad(userId)),
    profile: getCoachProfile(userId),
  });
});

api.post("/onboarding", (req, res) => {
  const userId = uid(req);
  const { coachRole, referral, zip, clubName, clubSize, challenge, clubInterest, skipped } = req.body ?? {};
  if (!skipped) {
    setCoachProfile(userId, {
      coachRole: COACH_ROLES.includes(String(coachRole)) ? String(coachRole) : "",
      referral: REFERRALS.includes(String(referral)) ? String(referral) : "",
      zip: String(zip ?? ""),
      clubName: String(clubName ?? ""),
      clubSize: CLUB_SIZES.includes(String(clubSize)) ? String(clubSize) : "",
      challenge: CHALLENGES.includes(String(challenge)) ? String(challenge) : "",
      clubInterest: Boolean(clubInterest),
    });
  }
  kvSet(`onboard:${userId}`, "done");
  res.json({ ok: true });
});

// A director raising a hand mid-wizard is the hottest lead the funnel can
// produce — recorded even if they later skip the rest of onboarding.
api.post("/onboarding/club-interest", (req, res) => {
  markClubInterest(uid(req));
  res.json({ ok: true });
});

// ---- Founder admin: spend, acquisition, club-sales leads ----
// Gated by ADMIN_EMAILS (comma-separated). Unset = nobody, including in dev.
api.get("/admin/overview", (req, res) => {
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const email = getUserBilling(uid(req))?.email?.toLowerCase();
  if (!email || !admins.includes(email)) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }
  res.json(adminOverview());
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
  });
});
