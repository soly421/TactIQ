import { Router } from "express";
import { requireAuth, type AuthedRequest } from "./auth.js";
import { addClubComment, addClubSession, clubCoaches, clubReport, clubSessionBelongsTo, getClubBilling, getClubComments, getClubSessions, getCurriculum, getUserClub, setClubPhilosophy, setCurriculum } from "./store.js";
import { weekStart } from "./community.js";
import { levelFor } from "./gamification.js";

// Club mode: what a Director of Coaching needs — coach oversight, club-wide
// session distribution, and a club philosophy that flows into every member's AI.
export const clubRouter = Router();
clubRouter.use(requireAuth);

function uid(req: unknown): number {
  return (req as AuthedRequest).userId;
}

clubRouter.get("/overview", (req, res) => {
  const club = getUserClub(uid(req));
  if (!club) {
    res.status(404).json({ error: "You're not in a club yet. Join with a club code or create one in My Team." });
    return;
  }
  const coaches = clubCoaches(club.id).map((c) => ({
    ...c,
    level: levelFor(c.xp),
    sessions: c.counts.session ?? 0,
    matchdays: c.counts.matchday ?? 0,
    chats: c.counts.chat ?? 0,
  }));
  res.json({
    club: { name: club.name, code: club.code, philosophy: club.philosophy, isAdmin: club.role === "admin" },
    coaches,
    totals: {
      coaches: coaches.length,
      sessions: coaches.reduce((a, c) => a + c.sessions, 0),
      xp: coaches.reduce((a, c) => a + c.xp, 0),
      activeToday: coaches.filter((c) => c.lastActiveDay === new Date().toISOString().slice(0, 10)).length,
    },
  });
});

// The DOC monthly report: the artifact that justifies the club license —
// per-coach activity over the last 30 days plus the license status.
clubRouter.get("/report", (req, res) => {
  const club = getUserClub(uid(req));
  if (!club) {
    res.status(404).json({ error: "Not in a club" });
    return;
  }
  const report = clubReport(club.id, 30);
  const billing = getClubBilling(club.id);
  res.json({
    clubName: club.name,
    periodDays: 30,
    license: { planTier: billing?.planTier ?? "free", seats: billing?.seats ?? 0 },
    ...report,
  });
});

// The club curriculum calendar: the DOC sets weekly themes per age band;
// every coach's AI aligns to them automatically.
clubRouter.get("/curriculum", (req, res) => {
  const club = getUserClub(uid(req));
  if (!club) {
    res.status(404).json({ error: "Not in a club" });
    return;
  }
  res.json({ weekStart: weekStart(), rows: getCurriculum(club.id, weekStart(), 8), isAdmin: club.role === "admin" });
});

clubRouter.put("/curriculum", (req, res) => {
  const club = getUserClub(uid(req));
  if (!club || club.role !== "admin") {
    res.status(403).json({ error: "Only the club admin can set the curriculum" });
    return;
  }
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  setCurriculum(
    club.id,
    rows.slice(0, 100).map((r: { weekStart?: string; ageBand?: string; theme?: string }) => ({
      weekStart: String(r.weekStart ?? "").slice(0, 10),
      ageBand: String(r.ageBand ?? "").slice(0, 10),
      theme: String(r.theme ?? ""),
    })),
  );
  res.json({ rows: getCurriculum(club.id, weekStart(), 8) });
});

clubRouter.put("/philosophy", (req, res) => {
  const club = getUserClub(uid(req));
  if (!club || club.role !== "admin") {
    res.status(403).json({ error: "Only the club admin can set the philosophy" });
    return;
  }
  setClubPhilosophy(club.id, String(req.body?.philosophy ?? ""));
  res.json({ ok: true });
});

clubRouter.get("/sessions", (req, res) => {
  const club = getUserClub(uid(req));
  if (!club) {
    res.status(404).json({ error: "Not in a club" });
    return;
  }
  res.json({ sessions: getClubSessions(club.id) });
});

clubRouter.post("/sessions", (req, res) => {
  const club = getUserClub(uid(req));
  if (!club || club.role !== "admin") {
    res.status(403).json({ error: "Only the club admin can upload club sessions" });
    return;
  }
  const { title, description, content } = req.body ?? {};
  if (!title || !content) {
    res.status(400).json({ error: "title and content are required" });
    return;
  }
  addClubSession(club.id, uid(req), {
    title: String(title).slice(0, 120),
    description: String(description ?? "").slice(0, 300),
    content: String(content).slice(0, 20000),
  });
  res.json({ ok: true, sessions: getClubSessions(club.id) });
});

clubRouter.get("/sessions/:id/comments", (req, res) => {
  const club = getUserClub(uid(req));
  if (!club || !clubSessionBelongsTo(Number(req.params.id), club.id)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ comments: getClubComments(Number(req.params.id)) });
});

clubRouter.post("/sessions/:id/comments", (req, res) => {
  const club = getUserClub(uid(req));
  if (!club || !clubSessionBelongsTo(Number(req.params.id), club.id)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const text = String(req.body?.text ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "Comment text required" });
    return;
  }
  addClubComment(club.id, Number(req.params.id), uid(req), text);
  res.json({ comments: getClubComments(Number(req.params.id)) });
});
