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
  // The tested product UI is public/ (vanilla). Set USE_REACT=1 to serve the experimental frontend/dist instead.
  useReact: env.USE_REACT === '1',
  accessSecret: env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
  refreshSecret: env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  // Wraps the AI vendor keys saved from the admin screen. Set it separately so JWT rotation does not orphan them.
  aiVaultSecret: env.AI_VAULT_SECRET || '',
  accessTtlMin: num(env.ACCESS_TOKEN_TTL_MIN, 15),
  refreshTtlDays: num(env.REFRESH_TOKEN_TTL_DAYS, 30),
  studentDomains: (env.ALLOWED_STUDENT_EMAIL_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  adminEmail: (env.ADMIN_EMAIL || 'admin@lanturn.local').toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || 'Admin@12345',
  // Express 'trust proxy'. Set it to the real number of proxies in front of the app (Railway/Render: 1) or to
  // 'false' when the container is exposed directly, otherwise a client can forge X-Forwarded-For and dodge the
  // IP rate limits. Unset: 1 in production (managed hosts put a proxy in front), off everywhere else.
  trustProxy: (() => {
    const raw = env.TRUST_PROXY;
    if (raw === undefined || raw === '') return isProd ? 1 : false;
    if (raw === 'false' || raw === '0') return false;
    if (raw === 'true') return true;
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  })(),
  // bcrypt work factor. 11 is the tested default; raise it on fast hardware, lower it only for load tests.
  bcryptRounds: num(env.BCRYPT_ROUNDS, 11),
  useReact: env.USE_REACT === 'true',
  // How long a just-rotated refresh token may be presented again and still count as a doubled request rather than a
  // stolen-token replay (two tabs, a retried fetch). 0 disables the grace window.
  refreshReuseGraceMs: num(env.REFRESH_REUSE_GRACE_MS, 60_000),
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

// The public default admin password is fine for a local demo and unacceptable anywhere real: the account can approve
// employers, read every candidate and rewrite AI settings. Refuse to boot in production unless the operator either
// sets ADMIN_PASSWORD or explicitly accepts the risk.
if (config.isProd && !process.env.ALLOW_DEFAULT_ADMIN_PASSWORD) {
  const weak = !process.env.ADMIN_PASSWORD || config.adminPassword === 'Admin@12345' || config.adminPassword.length < 10;
  if (weak) {
    console.error([
      '',
      'LanTURN cannot start: ADMIN_PASSWORD is missing or still the public default.',
      'Set a strong ADMIN_PASSWORD (10+ characters) in your host\'s environment variables, then redeploy.',
      'For a throw-away demo only, set ALLOW_DEFAULT_ADMIN_PASSWORD=1 to skip this check.',
      '',
    ].join('\n'));
    process.exit(1);
  }
}

// Demo seeding creates accounts with published passwords (student@demo.local etc.). That is a deliberate local-dev
// convenience and a back door anywhere else, so production has to opt in explicitly.
if (config.isProd && config.seedDemo && process.env.ALLOW_DEMO_SEED !== '1') {
  console.error([
    '',
    'LanTURN cannot start: SEED_DEMO=true in production would create demo accounts with published passwords.',
    'Set SEED_DEMO=false (the default) for a real deployment, or ALLOW_DEMO_SEED=1 if this really is a public demo.',
    '',
  ].join('\n'));
  process.exit(1);
}
