import { db } from './db.js';
import { config } from './config.js';
import { HttpError } from './util.js';

const WINDOW_MIN = 15;
const MAX_FAILS = 5;

db.exec(`CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, at);`);

/** Per-account lockout: MAX_FAILS wrong passwords inside WINDOW_MIN blocks that email, whatever the IP. */
export function assertNotLocked(email) {
  const n = db.prepare(`SELECT COUNT(*) n FROM login_attempts WHERE email = ? AND at > datetime('now', ?)`).get(email, `-${WINDOW_MIN} minutes`).n;
  if (n >= MAX_FAILS) throw new HttpError(429, 'ACCOUNT_LOCKED', `Too many failed sign-ins. Try again in ${WINDOW_MIN} minutes.`);
}
export const recordFailure = (email, ip) => db.prepare('INSERT INTO login_attempts (email, ip) VALUES (?,?)').run(email, String(ip || '').slice(0, 64));
export const clearFailures = (email) => db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);

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
  if (config.isProd && !process.env.ADMIN_PASSWORD) w.push('ADMIN_PASSWORD is not set: the public default admin password is active. Set ADMIN_PASSWORD in Railway Variables now.');
  if (config.isProd && config.seedDemo) w.push('SEED_DEMO=true: demo accounts with a published password exist. Turn it off for real users.');
  return w;
}
