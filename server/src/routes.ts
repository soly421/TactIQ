import { Router } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { ADVISORS, advisorSystemPrompt, assistantSystemPrompt, customAdvisorSystemPrompt, getAdvisor } from "./personas.js";
import { baseSystemPrompt } from "./knowledge.js";
import { SESSION_PLAN_SCHEMA, FORMATION_ANALYSIS_SCHEMA, GAME_PLAN_SCHEMA, SEASON_PLAN_SCHEMA } from "./schemas.js";
import { generateStructured, streamToSSE, teamContext, userContent } from "./generate.js";
import { streamText } from "./providers.js";
import {
  MOCK_CHAT_REPLY, MOCK_DEBRIEF, MOCK_FILM, MOCK_FORMATION, MOCK_GAME_PLAN, MOCK_GUIDANCE,
  MOCK_LIVE_REPLY, MOCK_SEASON_PLAN, MOCK_SESSION_PLAN,
} from "./mock.js";
import {
  addCustomAdvisor, addSeasonEntry, deleteCustomAdvisor, getCustomAdvisors, getLibraryPlan,
  getPlanTier, getProgress, getSeason, getSquad, getUnlockedTemplateIds, getUsage, getXpHistory,
  activeTeamId, addFeedback, clubThemeFor, createTeam, deleteTeam, getUserClub, feedbackCount, incrementUsage, kvGet, kvSet, leaderboard, listTeams, saveLibraryPlan, saveSquad, setActiveTeam, setPlanTier, tokensToday, upcomingEvents, xpAtStartOfToday,
  type CustomAdvisor, type SquadProfile,
} from "./store.js";
import { award, BADGES, FREE_DAILY_MESSAGES, levelFor, streakFreezeAvailable } from "./gamification.js";
import { communitySnapshot, weekStart } from "./community.js";
import { castVote, debateState } from "./debate.js";
import { questState } from "./quests.js";
import { engineSummary, hasAnyProvider, tierFor, type Plan } from "./providers.js";
import { stripeConfigured } from "./billing.js";
import { maybeResyncIcs } from "./schedule.js";

// "U11" -> "U11-U12" (server twin of the client bandForAge)
function bandForAgeServer(ageGroup: string): string {
  if (/hs|high/i.test(ageGroup)) return "HS";
  const n = Number(/\d+/.exec(ageGroup)?.[0]);
  if (!n) return "U11-U12";
  if (n <= 8) return "U6-U8";
  if (n <= 10) return "U9-U10";
  if (n <= 12) return "U11-U12";
  if (n <= 14) return "U13-U14";
  if (n <= 16) return "U15-U16";
  return "HS";
}
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

// Structured generations (sessions, formations, game plans) are the priciest
// calls. Legit coaches never hit these ceilings; scripted abuse does.
const STRUCTURED_PER_DAY: Record<Plan, number> = { free: 10, pro: 150 };

function consumeStructured(userId: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const key = `structcap:${userId}:${day}`;
  const used = Number(kvGet(key) ?? 0);
  if (used >= STRUCTURED_PER_DAY[planOf(userId)]) return false;
  kvSet(key, String(used + 1));
  return true;
}

const STRUCTURED_LIMIT_MSG = "Daily build limit reached — that's a lot of sessions, coach! It resets tomorrow.";

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
  // Free tier: the first N advisors you talk to become your signed staff.
  if (builtIn) {
    const ent = entitlementsFor(planOf(userId));
    if (!signOrCheckAdvisor(userId, advisorId, ent.maxStaffAdvisors)) {
      res.status(403).json(upgradeError(`Your staff is full (${ent.maxStaffAdvisors} advisors on the free plan). Upgrade to Pro to work with all 15 coaching minds.`));
      return;
    }
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
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: STRUCTURED_LIMIT_MSG });
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
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: STRUCTURED_LIMIT_MSG });
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
  if (!entitlementsFor(planOf(userId)).seasonPlanner) {
    res.status(403).json(upgradeError("The season periodization planner is a Pro feature."));
    return;
  }
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: STRUCTURED_LIMIT_MSG });
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
  const ent = entitlementsFor(planOf(userId));
  if (monthlyCount("libunlock", userId) >= ent.libraryUnlocksPerMonth) {
    res.status(403).json(upgradeError(`You've used all ${ent.libraryUnlocksPerMonth} free Library unlocks this month. Pro unlocks the whole catalog — all 907 sessions.`));
    return;
  }
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: STRUCTURED_LIMIT_MSG });
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
    bumpMonthly("libunlock", userId);
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
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: STRUCTURED_LIMIT_MSG });
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
  if (!consumeStructured(userId)) {
    res.status(429).json({ error: STRUCTURED_LIMIT_MSG });
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
  bumpMonthly("filmclip", userId);
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

// ---- The Board Engine: real-time AI read of a modified formation ----
// Chess.com for coaches: drop a piece, the engine tells you what you gained
// and what you gave away. Cheapest tier, tiny output, daily cap.
const BOARD_READS_PER_DAY: Record<Plan, number> = { free: 20, pro: 300 };

const BOARD_VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "gains", "risks", "counterMove"],
  properties: {
    headline: { type: "string", description: "One punchy sentence naming the tactical idea of this move" },
    gains: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3, description: "What this shape wins, concretely (zones, overloads, numbers)" },
    risks: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3, description: "What it concedes and WHERE the space is" },
    counterMove: { type: "string", description: "The one adjustment that covers the biggest risk (name the role that must react)" },
  },
};

api.post("/board/move", async (req, res) => {
  const userId = uid(req);
  const day = new Date().toISOString().slice(0, 10);
  const key = `boardcap:${userId}:${day}`;
  const used = Number(kvGet(key) ?? 0);
  if (used >= BOARD_READS_PER_DAY[planOf(userId)]) {
    res.status(planOf(userId) === "free" ? 403 : 429).json(
      planOf(userId) === "free"
        ? upgradeError(`You've used all ${BOARD_READS_PER_DAY.free} free engine reads today — Pro gets ${BOARD_READS_PER_DAY.pro}/day.`)
        : { error: "Daily engine limit reached — resets tomorrow." },
    );
    return;
  }
  const { format, formation, scenario, board, move, history } = req.body ?? {};
  if (!formation || !Array.isArray(board) || !move) {
    res.status(400).json({ error: "formation, board, and move are required" });
    return;
  }
  kvSet(key, String(used + 1));
  try {
    const boardTxt = (board as { label: string; role: string; x: number; y: number }[])
      .map((p) => `${p.label} (${p.role}) at [${Math.round(p.x)},${Math.round(p.y)}]`)
      .join("; ");
    const verdict = await generateStructured<{ headline: string; gains: string[]; risks: string[]; counterMove: string }>({
      tier: "light",
      userId,
      system: `${baseSystemPrompt()}${teamContext(userId)}

You are TactIQ's BOARD ENGINE — the chess engine for soccer shapes. The coach is moving players on a tactics board and you evaluate each move in real time. Coordinates are a 100x100 grid: y=0 is the OPPONENT goal (up = attacking), y=100 their own goal, x=0 left touchline. Be concrete about ZONES and NUMBERS ("their winger now gets the left channel 1v1", "you have a 3v2 in build-up"). Each item under 15 words. If the coach's roster is in team memory, reference actual player names where natural. Youth-appropriate, age-aware.`,
      user: `Format: ${format}. Formation: ${formation}. Scenario: ${scenario}.
Current board: ${boardTxt}
The coach just moved: ${move}
${Array.isArray(history) && history.length ? `Earlier moves this session: ${history.slice(-4).join("; ")}` : ""}
Evaluate THIS move in the context of the whole current shape.`,
      schema: BOARD_VERDICT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 500,
      mock: {
        headline: "Bold — you've traded cover for control (demo read)",
        gains: ["Extra man ahead of the ball in build-up", "Their pivot now has two problems to mark"],
        risks: ["The vacated zone is open for their counter", "Back line must shift across to cover"],
        counterMove: "Drop the near-side midfielder one line to screen the gap.",
      },
    });
    const gamify = award(userId, "board");
    res.json({ verdict, award: gamify, readsLeft: BOARD_READS_PER_DAY[planOf(userId)] - used - 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Engine read failed — try the next move." });
  }
});

// ---- Community: weekly league, club cup, recap ----
api.get("/community", (req, res) => {
  const userId = uid(req);
  const snap = communitySnapshot(userId);
  const p = getProgress(userId);
  res.json({
    ...snap,
    streak: { current: p.streak, freezeAvailable: streakFreezeAvailable(userId) },
    recap: {
      ...snap.recap,
      sessions: p.counts.session ?? 0,
      matchdays: p.counts.matchday ?? 0,
      chats: p.counts.chat ?? 0,
      ratings: p.counts.rate ?? 0,
    },
  });
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
  const day = new Date().toISOString().slice(0, 10);
  const key = `brief:${userId}:${activeTeamId(userId) ?? 0}:${day}`;
  const cached = kvGet(key);
  if (cached) return cached;
  let text: string;
  if (!hasAnyProvider()) {
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
