import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// SQLite via better-sqlite3: real relational storage, WAL mode, multi-user.
// DATABASE_PATH env overrides for mounted volumes in production.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH ?? path.resolve(__dirname, "../data/tactiq.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'coach',
  club_id INTEGER REFERENCES clubs(id),
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS squads (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS season_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_season_user ON season_entries(user_id, id DESC);

CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_active_day TEXT NOT NULL DEFAULT '',
  badges TEXT NOT NULL DEFAULT '[]',
  counts TEXT NOT NULL DEFAULT '{}',
  advisors_used TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS xp_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  t TEXT NOT NULL DEFAULT (datetime('now')),
  xp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_history(user_id, id DESC);

CREATE TABLE IF NOT EXISTS usage_daily (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  messages INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS custom_advisors (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_advisors_user ON custom_advisors(user_id);

CREATE TABLE IF NOT EXISTS library_plans (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, template_id)
);

CREATE TABLE IF NOT EXISTS club_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_club_sessions ON club_sessions(club_id, id DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id INTEGER,
  kind TEXT NOT NULL,
  vote INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id, id DESC);

CREATE TABLE IF NOT EXISTS club_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES club_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_club_comments ON club_comments(session_id, id);

CREATE TABLE IF NOT EXISTS quest_log (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, quest_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_teams_user ON teams(user_id);

CREATE TABLE IF NOT EXISTS schedule_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  opponent TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  UNIQUE(user_id, start, title)
);
CREATE INDEX IF NOT EXISTS idx_schedule_user ON schedule_events(user_id, start);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  t TEXT NOT NULL DEFAULT (datetime('now')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tier TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_model_calls_user ON model_calls(user_id, id DESC);
`);

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Idempotent column adds for older databases.
try { db.exec("ALTER TABLE clubs ADD COLUMN philosophy TEXT NOT NULL DEFAULT ''"); } catch { /* exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN stripe_customer_id TEXT"); } catch { /* exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT"); } catch { /* exists */ }
try { db.exec("ALTER TABLE clubs ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'free'"); } catch { /* exists */ }
try { db.exec("ALTER TABLE clubs ADD COLUMN seats INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
try { db.exec("ALTER TABLE clubs ADD COLUMN stripe_customer_id TEXT"); } catch { /* exists */ }
try { db.exec("ALTER TABLE clubs ADD COLUMN stripe_subscription_id TEXT"); } catch { /* exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN teamsnap_token TEXT"); } catch { /* exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN active_team_id INTEGER"); } catch { /* exists */ }
try { db.exec("ALTER TABLE progress ADD COLUMN league INTEGER NOT NULL DEFAULT 0"); } catch { /* exists */ }
try { db.exec("ALTER TABLE season_entries ADD COLUMN team_id INTEGER"); } catch { /* exists */ }
try { db.exec("ALTER TABLE schedule_events ADD COLUMN team_id INTEGER"); } catch { /* exists */ }
try { db.exec("ALTER TABLE library_plans ADD COLUMN team_id INTEGER"); } catch { /* exists */ }

// One-time migration: accounts created before multi-team support have their
// single squad in the legacy `squads` table — promote it to a team row.
try {
  const legacy = db.prepare(
    "SELECT s.user_id, s.data FROM squads s WHERE NOT EXISTS (SELECT 1 FROM teams t WHERE t.user_id = s.user_id)",
  ).all() as { user_id: number; data: string }[];
  const ins = db.prepare("INSERT INTO teams (user_id, data) VALUES (?, ?)");
  const setActive = db.prepare("UPDATE users SET active_team_id = ? WHERE id = ? AND active_team_id IS NULL");
  for (const row of legacy) {
    const info = ins.run(row.user_id, row.data);
    setActive.run(Number(info.lastInsertRowid), row.user_id);
  }
  if (legacy.length > 0) console.log(`[db] migrated ${legacy.length} squads to multi-team`);
} catch { /* squads table may not exist in fresh installs */ }
