// Database connection. Uses a local SQLite file by default, or a Turso
// cloud database when TURSO_DATABASE_URL is set (see README).
import { createClient } from '@libsql/client';
import fs from 'node:fs';

let url = process.env.TURSO_DATABASE_URL;
if (!url) {
  const file = process.env.DB_FILE || 'data/chorequest.db';
  fs.mkdirSync(file.split('/').slice(0, -1).join('/') || '.', { recursive: true });
  url = 'file:' + file;
}

export const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AZN',
  streak_days INTEGER NOT NULL DEFAULT 3,
  streak_bonus INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  color TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'kid',
  jar_split TEXT NOT NULL DEFAULT '{"spend":50,"save":30,"give":20}',
  goal_name TEXT,
  goal_icon TEXT,
  goal_price INTEGER,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chores (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  title TEXT NOT NULL,
  icon TEXT NOT NULL,
  price INTEGER NOT NULL,
  assignee_id TEXT,
  repeat TEXT NOT NULL DEFAULT 'daily',
  weekdays TEXT NOT NULL DEFAULT '[]',
  start_date TEXT,
  is_bonus INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS completions (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  chore_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  period TEXT NOT NULL,
  done_date TEXT,
  status TEXT NOT NULL,
  note TEXT,
  photo TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (chore_id, period)
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  spend INTEGER NOT NULL DEFAULT 0,
  save INTEGER NOT NULL DEFAULT 0,
  give INTEGER NOT NULL DEFAULT 0,
  ref TEXT,
  label TEXT,
  icon TEXT,
  date TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS badges (
  member_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  badge TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  PRIMARY KEY (member_id, badge)
);
CREATE INDEX IF NOT EXISTS idx_members_family ON members(family_id);
CREATE INDEX IF NOT EXISTS idx_chores_family ON chores(family_id);
CREATE INDEX IF NOT EXISTS idx_completions_family ON completions(family_id);
CREATE INDEX IF NOT EXISTS idx_tx_family ON transactions(family_id);
`;

export async function migrate() {
  await db.executeMultiple(SCHEMA);
}

export async function all(sql, args = []) {
  return (await db.execute({ sql, args })).rows;
}

export async function one(sql, args = []) {
  return (await all(sql, args))[0];
}

export async function run(sql, args = []) {
  return db.execute({ sql, args });
}
