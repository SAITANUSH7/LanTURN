import { db } from './db.js';
import { config } from './config.js';
import { emailEnabled } from './email.js';
import { HttpError } from './util.js';

const WINDOW_MIN = 15;
const MAX_FAILS = 5; // per account (this is what blocks the account, whatever the IP)
const MAX_IP_FAILS = 40; // per source IP across all accounts: catches spraying without locking anyone out

db.exec(`CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, at);`);

/**
 * Per-account lockout: MAX_FAILS wrong passwords inside WINDOW_MIN blocks that email, whatever the IP.
 * A single IP failing across many accounts is also throttled, so password spraying gets nowhere either.
 */
export function assertNotLocked(email, ip = '') {
  const mine = db.prepare(`SELECT COUNT(*) n, MIN(at) first FROM login_attempts WHERE email = ? AND at > datetime('now', ?)`)
    .get(email, `-${WINDOW_MIN} minutes`);
  if (mine.n >= MAX_FAILS) {
    const retryAfterSec = Math.max(60, WINDOW_MIN * 60 - Math.round((Date.now() - new Date(`${mine.first.replace(' ', 'T')}Z`).getTime()) / 1000));
    throw new HttpError(429, 'ACCOUNT_LOCKED', `Too many failed sign-ins. Try again in ${Math.ceil(retryAfterSec / 60)} minutes.`, { retryAfterSec });
  }
  if (ip) {
    const n = db.prepare(`SELECT COUNT(*) n FROM login_attempts WHERE ip = ? AND at > datetime('now', ?)`).get(String(ip).slice(0, 64), `-${WINDOW_MIN} minutes`).n;
    if (n >= MAX_IP_FAILS) throw new HttpError(429, 'RATE_LIMITED', 'Too many failed sign-ins from this network. Try again later.');
  }
}

export const recordFailure = (email, ip) => db.prepare('INSERT INTO login_attempts (email, ip) VALUES (?,?)').run(email, String(ip || '').slice(0, 64));
export const clearFailures = (email) => db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);
export const failedAttempts = (email) => db.prepare(`SELECT COUNT(*) n FROM login_attempts WHERE email = ? AND at > datetime('now', ?)`).get(email, `-${WINDOW_MIN} minutes`).n;
export const lockoutMinutes = () => WINDOW_MIN;

/** Admin action: let a locked-out person back in without waiting for the window to pass. */
export const unlockAccount = (email) => clearFailures(email);

/** State-changing cookie endpoints must come from our own origin (defence in depth on top of SameSite=Lax). */
export function sameOriginGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser clients (curl, tests) send none
  let host;
  try { host = new URL(origin).host; } catch { return next(new HttpError(403, 'BAD_ORIGIN', 'Request origin not allowed')); }
  const ok = host === req.headers.host || host === req.headers['x-forwarded-host'];
  return ok ? next() : next(new HttpError(403, 'BAD_ORIGIN', 'Request origin not allowed'));
}

/** API responses are per-user: never cache them, and lock down browser features we do not use. */
export function apiHeaders(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}

const WEAK = new Set(['password', 'password1', '12345678', '123456789', 'qwertyuiop', 'iloveyou1', 'admin1234', 'letmein123']);
export function passwordProblem(pw) {
  if (WEAK.has(pw.toLowerCase())) return 'is too common';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'must contain at least one letter and one number';
  return null;
}

export function startupWarnings() {
  const w = [];
  if (config.isProd && !process.env.ADMIN_PASSWORD) w.push('ADMIN_PASSWORD is not set: the public default admin password is active.');
  if (config.isProd && config.seedDemo) w.push('SEED_DEMO=true: demo accounts with a published password exist. Turn it off for real users.');
  if (config.isProd && config.trustProxy === true) w.push('TRUST_PROXY=true trusts every proxy hop; set it to the real hop count so rate limits cannot be spoofed with X-Forwarded-For.');
  if (!config.aiVaultSecret && config.isProd) w.push('AI_VAULT_SECRET is not set: saved AI keys are wrapped with JWT_REFRESH_SECRET, so rotating that secret will orphan them.');
  if (!config.isProd && !emailEnabled()) w.push('No email provider configured: password-reset links are printed to this log instead of being emailed.');
  return w;
}
