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

if (isProd) {
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!env[k] || env[k].startsWith('dev-')) {
      throw new Error(`${k} must be set to a long random value in production`);
    }
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
  aiDailyQuota: num(env.AI_DAILY_QUOTA, 20),
  resumeMaxChars: num(env.RESUME_MAX_CHARS, 20000),
  maxUploadBytes: 4 * 1024 * 1024,
};

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
