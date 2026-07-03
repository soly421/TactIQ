import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { db } from "./db.js";
import { consumePasswordReset, createPasswordReset, findUserByEmail } from "./store.js";
import { emailConfigured, sendPasswordReset } from "./email.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "tactiq-dev-secret-change-in-production";
if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET not set — using a development secret. Set JWT_SECRET in production.");
}
const TOKEN_TTL = "30d";

export interface AuthedRequest extends Request {
  userId: number;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  club_id: number | null;
  plan: string;
}

function publicUser(u: UserRow) {
  const club = u.club_id
    ? (db.prepare("SELECT id, name, code FROM clubs WHERE id = ?").get(u.club_id) as { id: number; name: string; code: string } | undefined)
    : undefined;
  return { id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan, club: club ?? null };
}

function sign(userId: number): string {
  return jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function resolveClub(clubCode?: string, clubName?: string): { id: number; created: boolean } | null {
  if (clubCode) {
    const row = db.prepare("SELECT id FROM clubs WHERE code = ?").get(clubCode.trim().toUpperCase()) as { id: number } | undefined;
    if (!row) throw new Error("Unknown club code");
    return { id: row.id, created: false };
  }
  if (clubName) {
    const code = clubName.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() + Math.floor(100 + Math.random() * 900);
    const info = db.prepare("INSERT INTO clubs (name, code) VALUES (?, ?)").run(clubName.trim().slice(0, 60), code);
    return { id: Number(info.lastInsertRowid), created: true };
  }
  return null;
}

// Credential endpoints get a small in-memory throttle: 20 attempts per IP
// per 15 minutes. Not a fortress — a speed bump that stops naive scripts.
const attempts = new Map<string, { n: number; resetAt: number }>();
function throttled(req: { ip?: string; headers: Record<string, unknown> }): boolean {
  const ip = String(req.headers["x-forwarded-for"] ?? req.ip ?? "?").split(",")[0].trim();
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now > a.resetAt) {
    attempts.set(ip, { n: 1, resetAt: now + 15 * 60_000 });
    if (attempts.size > 5000) attempts.clear(); // bounded
    return false;
  }
  a.n += 1;
  return a.n > 20;
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  if (throttled(req as unknown as { ip?: string; headers: Record<string, unknown> })) {
    res.status(429).json({ error: "Too many attempts — wait a few minutes and try again." });
    return;
  }
  const { email, password, name, clubCode, clubName } = req.body ?? {};
  if (!email || !password || !name) {
    res.status(400).json({ error: "email, password, and name are required" });
    return;
  }
  if (String(password).length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(String(email).toLowerCase());
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }
  let club: { id: number; created: boolean } | null = null;
  try {
    club = resolveClub(clubCode, clubName);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Club error" });
    return;
  }
  const hash = await bcrypt.hash(String(password), 10);
  const info = db
    .prepare("INSERT INTO users (email, password_hash, name, club_id, role) VALUES (?, ?, ?, ?, ?)")
    .run(String(email).toLowerCase().trim(), hash, String(name).trim().slice(0, 60), club?.id ?? null, club?.created ? "admin" : "coach");
  const userId = Number(info.lastInsertRowid);
  db.prepare("INSERT INTO progress (user_id) VALUES (?)").run(userId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow;
  res.json({ token: sign(userId), user: publicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  if (throttled(req as unknown as { ip?: string; headers: Record<string, unknown> })) {
    res.status(429).json({ error: "Too many attempts — wait a few minutes and try again." });
    return;
  }
  const { email, password } = req.body ?? {};
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email ?? "").toLowerCase().trim()) as UserRow | undefined;
  if (!user || !(await bcrypt.compare(String(password ?? ""), user.password_hash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  res.json({ token: sign(user.id), user: publicUser(user) });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get((req as AuthedRequest).userId) as UserRow | undefined;
  if (!user) {
    res.status(401).json({ error: "Account not found" });
    return;
  }
  res.json({ user: publicUser(user) });
});

// Join or create a club after registration
authRouter.post("/club", requireAuth, (req, res) => {
  const { clubCode, clubName } = req.body ?? {};
  try {
    const club = resolveClub(clubCode, clubName);
    if (!club) {
      res.status(400).json({ error: "Provide a clubCode to join or a clubName to create" });
      return;
    }
    db.prepare("UPDATE users SET club_id = ?, role = ? WHERE id = ?").run(club.id, club.created ? "admin" : "coach", (req as AuthedRequest).userId);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get((req as AuthedRequest).userId) as UserRow;
    res.json({ user: publicUser(user) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Club error" });
  }
});

// Password reset: request a one-hour token by email. Always answers 200 so
// the endpoint can't be used to probe which emails have accounts.
authRouter.post("/forgot", async (req, res) => {
  if (!emailConfigured) {
    res.status(400).json({ error: "Password reset by email isn't configured on this server yet — contact your club admin." });
    return;
  }
  const user = findUserByEmail(String(req.body?.email ?? ""));
  if (user) {
    const token = crypto.randomBytes(24).toString("base64url");
    createPasswordReset(user.id, token);
    await sendPasswordReset(user.email, user.name, token);
  }
  res.json({ ok: true, message: "If that email has an account, a reset link is on its way." });
});

authRouter.post("/reset", async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || String(password ?? "").length < 8) {
    res.status(400).json({ error: "A reset token and a password of at least 8 characters are required" });
    return;
  }
  const userId = consumePasswordReset(String(token));
  if (!userId) {
    res.status(400).json({ error: "That reset link is invalid or expired — request a new one." });
    return;
  }
  const hash = await bcrypt.hash(String(password), 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
  res.json({ token: sign(userId) });
});

// Full account + data deletion (privacy requirement)
authRouter.delete("/account", requireAuth, (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run((req as AuthedRequest).userId);
  res.json({ ok: true });
});

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    (req as AuthedRequest).userId = Number(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: "Session expired — sign in again" });
  }
}
