import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* .env is optional; real environment variables win */
}

const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);
const isProd = env.NODE_ENV === 'production';

// Production needs real signing secrets. Preferred: set JWT_ACCESS_SECRET / JWT_REFRESH_SECRET as environment variables.
// If they are missing (a common first-deploy slip), generate strong random ones once and keep them next to the database
// instead of crashing. Sessions stay valid across restarts as long as that folder persists.
if (isProd) {
  const bad = (v) => !v || v.startsWith('dev-');
  if (bad(env.JWT_ACCESS_SECRET) || bad(env.JWT_REFRESH_SECRET)) {
    const dir = env.DB_FILE ? path.dirname(path.resolve(env.DB_FILE)) : path.join(ROOT, 'data');
    const file = path.join(dir, '.lanturn-secrets.json');
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first boot */ }
    if (bad(saved.access) || bad(saved.refresh)) {
      saved = { access: crypto.randomBytes(48).toString('hex'), refresh: crypto.randomBytes(48).toString('hex') };
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 }); } catch (e) { console.warn(`Could not save generated secrets (${e.message}); sessions will reset on restart.`); }
    }
    if (bad(env.JWT_ACCESS_SECRET)) env.JWT_ACCESS_SECRET = saved.access;
    if (bad(env.JWT_REFRESH_SECRET)) env.JWT_REFRESH_SECRET = saved.refresh;
    console.warn('JWT secrets were not set; using generated ones. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET for stable, multi-instance deployments.');
  }
}

export const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: num(env.PORT, 3000),
  accessSecret: env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
  refreshSecret: env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  accessTtlMin: num(env.ACCESS_TOKEN_TTL_MIN, 15),
  refreshTtlDays: num(env.REFRESH_TOKEN_TTL_DAYS, 30),
  studentDomains: (env.ALLOWED_STUDENT_EMAIL_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  adminEmail: (env.ADMIN_EMAIL || 'admin@lanturn.local').toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || 'Admin@12345',
  seedDemo: env.SEED_DEMO === 'true',
  dbFile: path.resolve(ROOT, env.DB_FILE || './data/lanturn.db'),
  uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || './data/uploads'),
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  llmModel: env.LLM_MODEL || '',
  // Multi-provider AI: AI_PROVIDER=auto (every provider that has a key, in AI_PRIORITY order) or one name.
  aiProvider: (env.AI_PROVIDER || 'auto').toLowerCase(),
  aiPriority: (env.AI_PRIORITY || 'deepseek,kimi,nvidia,opencode,gemini,groq,openrouter,openai,anthropic,custom')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  aiTimeoutMs: num(env.AI_TIMEOUT_MS, 30000),
  collegeName: env.COLLEGE_NAME || 'your college',
  aiDailyQuota: num(env.AI_DAILY_QUOTA, 20),
  resumeMaxChars: num(env.RESUME_MAX_CHARS, 20000),
  maxUploadBytes: 4 * 1024 * 1024,
};

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
