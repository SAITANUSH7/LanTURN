import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const file = config.isTest ? ':memory:' : config.dbFile;
export const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('STUDENT','EMPLOYER','ADMIN')),
  verification TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification IN ('PENDING','VERIFIED','REJECTED')),
  consent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  family TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  college TEXT NOT NULL DEFAULT '',
  degree TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  graduation_year INTEGER,
  location TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  preferred_types TEXT NOT NULL DEFAULT '[]',
  preferred_locations TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS employer_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_aliases (
  alias TEXT PRIMARY KEY,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS student_skills (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','RESUME')),
  PRIMARY KEY (user_id, skill_id)
);
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS role_skills (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL CHECK (weight BETWEEN 1 AND 3),
  PRIMARY KEY (role_id, skill_id)
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('INTERNSHIP','FULL_TIME','PART_TIME','CONTRACT')),
  location TEXT NOT NULL DEFAULT '',
  remote INTEGER NOT NULL DEFAULT 0,
  compensation TEXT NOT NULL DEFAULT '',
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_employer ON jobs(employer_id);
CREATE TABLE IF NOT EXISTS job_skills (
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL CHECK (weight BETWEEN 1 AND 3),
  PRIMARY KEY (job_id, skill_id)
);
CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_key TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 1,
  extracted_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_resumes_student ON resumes(student_id);
CREATE TABLE IF NOT EXISTS resume_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('COMPLETED','FAILED')),
  overall_score INTEGER,
  deterministic_score INTEGER,
  ai_score INTEGER,
  breakdown TEXT,
  extracted_skills TEXT,
  strengths TEXT,
  improvements TEXT,
  summary TEXT,
  source TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analyses_resume ON resume_analyses(resume_id, id DESC);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'APPLIED'
    CHECK (status IN ('APPLIED','SHORTLISTED','INTERVIEW','OFFERED','REJECTED','WITHDRAWN')),
  match_score INTEGER NOT NULL DEFAULT 0,
  cover_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (job_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_apps_student ON applications(student_id);
CREATE TABLE IF NOT EXISTS application_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS roadmaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  target_title TEXT NOT NULL,
  gap TEXT NOT NULL,
  plan TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/** Run fn inside a transaction; rolls back on throw. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const parseJson = (s, fallback = null) => {
  if (s === null || s === undefined) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
