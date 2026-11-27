import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const file = config.isTest ? ':memory:' : config.dbFile;
export const db = new DatabaseSync(file);
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;      -- safe with WAL, far fewer fsyncs
PRAGMA busy_timeout = 5000;       -- wait for a writer instead of failing with SQLITE_BUSY
PRAGMA cache_size = -32000;       -- 32 MB page cache
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 134217728;     -- 128 MB memory-mapped reads
PRAGMA journal_size_limit = 67108864;`);

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
CREATE TABLE IF NOT EXISTS ai_settings (
  provider TEXT PRIMARY KEY,
  api_key_enc TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, id DESC);
CREATE TABLE IF NOT EXISTS career_dna (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  archetype TEXT NOT NULL,
  summary TEXT NOT NULL,
  dimensions TEXT NOT NULL,
  strengths TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS company_dna (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  personality TEXT NOT NULL,
  summary TEXT NOT NULL,
  dimensions TEXT NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS skill_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  tier INTEGER NOT NULL,
  questions TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS skill_medals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES skill_tests(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  medal TEXT NOT NULL,
  correct INTEGER NOT NULL,
  feedback TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, id);
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (requester_id, recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_connections_users ON connections(requester_id, recipient_id, status);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  media_url TEXT NOT NULL DEFAULT '',
  post_type TEXT NOT NULL DEFAULT 'UPDATE' CHECK (post_type IN ('UPDATE', 'ACHIEVEMENT', 'PROJECT', 'QUESTION')),
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id, created_at DESC);
CREATE TABLE IF NOT EXISTS post_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, id);
CREATE TABLE IF NOT EXISTS direct_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_direct_messages_convo ON direct_messages(sender_id, recipient_id, id);
CREATE TABLE IF NOT EXISTS skill_endorsements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endorser_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (endorser_id, student_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_endorsements_student ON skill_endorsements(student_id, skill_id);

CREATE TABLE IF NOT EXISTS career_roadmaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_id TEXT NOT NULL,
  domain_title TEXT NOT NULL,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, domain_id)
);
CREATE INDEX IF NOT EXISTS idx_career_roadmaps_student ON career_roadmaps(student_id);

CREATE TABLE IF NOT EXISTS roadmap_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roadmap_id INTEGER NOT NULL REFERENCES career_roadmaps(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_index INTEGER NOT NULL,
  topic_index INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (roadmap_id, stage_index, topic_index)
);
CREATE INDEX IF NOT EXISTS idx_roadmap_progress_roadmap ON roadmap_progress(roadmap_id);

CREATE TABLE IF NOT EXISTS mock_interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  questions TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '[]',
  feedback TEXT NOT NULL DEFAULT '[]',
  overall_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  source TEXT NOT NULL DEFAULT 'rules',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mock_interviews_student ON mock_interviews(student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user ON saved_jobs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS placement_drives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  drive_date TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT 'Campus Auditorium / Virtual',
  eligibility TEXT NOT NULL DEFAULT 'All Branches',
  package_details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_drives_date ON placement_drives(drive_date);

CREATE TABLE IF NOT EXISTS drive_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_id INTEGER NOT NULL REFERENCES placement_drives(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'ATTENDED', 'SHORTLISTED', 'ABSENT')),
  UNIQUE(drive_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_drive_registrations_student ON drive_registrations(student_id);
`);

try {
  db.exec('ALTER TABLE jobs ADD COLUMN verified_by_admin INTEGER NOT NULL DEFAULT 0');
} catch {
  // column already exists
}

for (const col of ['headline TEXT NOT NULL DEFAULT \'\'', 'target_domain TEXT', 'auto_setup TEXT', 'auto_filled_at TEXT']) {
  try { db.exec(`ALTER TABLE student_profiles ADD COLUMN ${col}`); } catch { /* column already exists */ }
}
for (const col of ["employer_note TEXT NOT NULL DEFAULT ''", 'employer_rating INTEGER']) {
  try { db.exec(`ALTER TABLE applications ADD COLUMN ${col}`); } catch { /* column already exists */ }
}
db.exec(`
CREATE TABLE IF NOT EXISTS interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  mode TEXT NOT NULL CHECK (mode IN ('VIDEO','PHONE','ONSITE')),
  location TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','CANCELLED')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interviews_app ON interviews(application_id);
CREATE TABLE IF NOT EXISTS application_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('STUDENT','EMPLOYER')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appmsg_app ON application_messages(application_id, id);
`);
try { db.exec('ALTER TABLE users ADD COLUMN team_owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE'); } catch { /* column already exists */ }
db.exec(`
CREATE INDEX IF NOT EXISTS idx_users_team_owner ON users(team_owner_id);
CREATE TABLE IF NOT EXISTS team_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_team_invites_owner ON team_invites(owner_id);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_ok_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
`);
db.exec("CREATE TABLE IF NOT EXISTS ml_feedback (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, domain TEXT NOT NULL, consent_at TEXT NOT NULL)");
db.exec('CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

// ---- Account lifecycle: password resets, upload ownership, and an audit trail for privileged actions. ----
db.exec(`
-- Every stored upload gets an owner and a kind, so files are never protected by "unguessable name" alone.
-- Privileged actions (verification, role changes, unlocks, moderation) leave a trace.
`);

// ---- Migrations ----------------------------------------------------------------------------------------------
// The CREATE TABLE block above is an idempotent bootstrap: it brings any database, old or new, to the current shape
// without failing. Everything that cannot be expressed that way (ALTER TABLE ADD COLUMN) is a numbered migration, so
// a deployment knows exactly what has been applied, in which order, and a future change never re-runs an old one.
db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
function migrate(version, name, up) {
  if (applied.has(version)) return false;
  db.exec(`SAVEPOINT m${version}`); // a failed step leaves the database exactly as it was
  try {
    up();
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, name);
    db.exec(`RELEASE m${version}`);
    return true;
  } catch (e) {
    db.exec(`ROLLBACK TO m${version}; RELEASE m${version}`);
    throw new Error(`Migration ${version} (${name}) failed: ${e.message}`);
  }
}

// 1: account lockout / forced sign-out. token_version invalidates every issued access token (disable, password change,
// role change) without waiting for the 15-minute expiry. Rows created before this column existed read as 0.
migrate(1, 'users-token-version-and-disable', () => {
  for (const col of ['token_version INTEGER NOT NULL DEFAULT 0', 'disabled_at TEXT', 'disabled_reason TEXT']) {
    try { db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch (err) { if (!/duplicate column/i.test(err.message)) throw err; }
  }
});

// 2: uploads get an owner + kind, so a file is never protected by "hard to guess" alone.
migrate(2, 'uploads-ownership', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS uploads (
    key TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT '',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, created_at DESC);`);
});

// 3: password reset tokens.
migrate(3, 'password-resets', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, id DESC);`);
});

// 4: privileged-action audit trail.
migrate(4, 'audit-log', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);`);
});

// 5: the inbox. A per-application thread already existed, but neither side could tell what it had not read: the read
// marker is one row per (user, application) holding the highest message id they have seen, so unread counts are a
// single indexed comparison instead of a per-message flag.
migrate(5, 'message-reads', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS message_reads (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, application_id)
  );
  CREATE INDEX IF NOT EXISTS idx_appmsg_sender ON application_messages(sender_id, created_at);`);
});

// 6: saved searches. A filter set plus the minimum match score worth an alert; the alert task reads these on every
// new job, so the index matters more than the row count suggests.
migrate(6, 'saved-searches', () => {
  db.exec(`CREATE TABLE IF NOT EXISTS saved_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    q TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    remote INTEGER NOT NULL DEFAULT 0,
    skill_id INTEGER,
    min_match INTEGER NOT NULL DEFAULT 70,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_searches_uniq
    ON saved_searches(user_id, q, type, location, remote, COALESCE(skill_id, 0));
  CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id, id DESC);`);
});

db.exec(`PRAGMA user_version = ${Math.max(0, ...db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version))}`);

// Change counters: triggers bump these on ANY write (routes, seed, scripts), so in-process caches can validate
// themselves with one primary-key lookup instead of relying on every call site to remember to invalidate.
db.exec(`
CREATE TABLE IF NOT EXISTS data_versions (name TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO data_versions (name, v) VALUES ('jobs', 0);
CREATE TRIGGER IF NOT EXISTS trg_jobs_ins AFTER INSERT ON jobs BEGIN UPDATE data_versions SET v = v + 1 WHERE name = 'jobs'; END;
CREATE TRIGGER IF NOT EXISTS trg_jobs_upd AFTER UPDATE ON jobs BEGIN UPDATE data_versions SET v = v + 1 WHERE name = 'jobs'; END;
CREATE TRIGGER IF NOT EXISTS trg_jobs_del AFTER DELETE ON jobs BEGIN UPDATE data_versions SET v = v + 1 WHERE name = 'jobs'; END;
CREATE TRIGGER IF NOT EXISTS trg_jskills_ins AFTER INSERT ON job_skills BEGIN UPDATE data_versions SET v = v + 1 WHERE name = 'jobs'; END;
CREATE TRIGGER IF NOT EXISTS trg_jskills_upd AFTER UPDATE ON job_skills BEGIN UPDATE data_versions SET v = v + 1 WHERE name = 'jobs'; END;
CREATE TRIGGER IF NOT EXISTS trg_jskills_del AFTER DELETE ON job_skills BEGIN UPDATE data_versions SET v = v + 1 WHERE name = 'jobs'; END;
CREATE TRIGGER IF NOT EXISTS trg_empprof_upd AFTER UPDATE ON employer_profiles BEGIN UPDATE data_versions SET v = v + 1 WHERE name = 'jobs'; END;
CREATE TRIGGER IF NOT EXISTS trg_skills_upd AFTER UPDATE ON skills BEGIN UPDATE data_versions SET v = v + 1 WHERE name = 'jobs'; END;

CREATE INDEX IF NOT EXISTS idx_student_skills_skill ON student_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_job_skills_skill ON job_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type_link ON notifications(type, link);
CREATE INDEX IF NOT EXISTS idx_apps_job_status ON applications(job_id, status);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
`);
export const dataVersion = (name) => db.prepare('SELECT v FROM data_versions WHERE name = ?').get(name)?.v ?? 0;

/** Transaction helpers: a nested tx() becomes a savepoint of the outer one, so a route can call another helper that
 * already opens a transaction without "cannot start a transaction within a transaction". */
let txDepth = 0;

/**
 * Run fn inside a transaction; rolls back on throw. Nested calls use SAVEPOINTs, and a promise-returning fn is awaited
 * before commit, so `await tx(async () => ...)` cannot commit half its work. On the one shared connection, do not
 * interleave two async transactions.
 */
export function tx(fn) {
  const depth = txDepth++;
  const name = `tx_${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
  const finish = (err) => {
    txDepth--;
    if (err) db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
    else db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
  };
  let out;
  try {
    out = fn();
  } catch (e) {
    finish(e);
    throw e;
  }
  if (out && typeof out.then === 'function') {
    return out.then((v) => { finish(); return v; }, (e) => { finish(e); throw e; });
  }
  finish();
  return out;
}

export const parseJson = (s, fallback = null) => {
  if (s === null || s === undefined) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
