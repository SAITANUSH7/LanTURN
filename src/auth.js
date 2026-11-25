import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { config } from './config.js';
import { HttpError, forbidden } from './util.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// bcrypt is deliberately slow. bcryptjs is pure JavaScript, so the *sync* variants block the one thread Node has for
// every other request: 150-200 ms each at cost 11. Always use the async API, which yields to the event loop.
export const hashPassword = (pw) => bcrypt.hash(pw, config.bcryptRounds);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);

/** Access tokens carry the user's token_version, so disabling an account or changing a password ends its sessions
 *  immediately instead of leaving a valid bearer token alive for the rest of its 15 minutes. */
export function signAccess(user) {
  return jwt.sign({ sub: user.id, role: user.role, tv: user.token_version || 0 }, config.accessSecret, { algorithm: 'HS256', expiresIn: `${config.accessTtlMin}m` });
}

/** Invalidate every access token already issued for this user (password change, disable, role change). */
export function bumpTokenVersion(userId) {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
}

export const revokeAllSessions = (userId) =>
  db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").run(userId);

const COOKIE = 'lt_refresh';
// A refreshed token that comes back within this window is a benign double-submit (two tabs, a retried request, a
// flaky connection), not an attack. Outside the window it is treated as a stolen-token replay.
const reuseGraceMs = () => config.refreshReuseGraceMs;

/** Issue a rotating refresh token, stored hashed, delivered as an httpOnly cookie. */
export function issueRefresh(res, userId, family = crypto.randomUUID()) {
  const token = crypto.randomBytes(48).toString('base64url');
  const exp = new Date(Date.now() + config.refreshTtlDays * 86400000);
  db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at) VALUES (?,?,?,?)').run(userId, sha(token), family, exp.toISOString());
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: config.refreshTtlDays * 86400000, path: '/api/auth' });
}

export function clearRefresh(res) {
  res.clearCookie(COOKIE, { path: '/api/auth' });
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/**
 * Rotate: revoke the presented token, issue a new one.
 * Reuse of a revoked token inside REUSE_GRACE_MS is treated as a doubled request and only mints a new access token;
 * reuse after that revokes the whole family, which is what a real replay looks like.
 */
export function rotateRefresh(req, res) {
  const token = readCookie(req, COOKIE);
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'No session');
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(sha(token));
  if (!row) throw new HttpError(401, 'UNAUTHENTICATED', 'Invalid session');
  if (row.revoked_at) {
    const revokedMsAgo = Date.now() - new Date(`${row.revoked_at.replace(' ', 'T')}Z`).getTime();
    const live = db.prepare("SELECT 1 FROM refresh_tokens WHERE family = ? AND revoked_at IS NULL AND expires_at > ?").get(row.family, new Date().toISOString());
    if (Number.isFinite(revokedMsAgo) && revokedMsAgo >= 0 && revokedMsAgo < reuseGraceMs() && live) {
      // Benign double-submit: the browser already holds the newer cookie. Do not revoke, do not rotate again.
      return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id), rotated: false };
    }
    db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE family = ? AND revoked_at IS NULL").run(row.family);
    throw new HttpError(401, 'UNAUTHENTICATED', 'Session reuse detected, please sign in again');
  }
  if (new Date(row.expires_at) < new Date()) throw new HttpError(401, 'UNAUTHENTICATED', 'Session expired');
  db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?").run(row.id);
  issueRefresh(res, row.user_id, row.family);
  return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id), rotated: true };
}

export function revokeRefresh(req) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL").run(sha(token));
}

/** Signed-out or disabled accounts get the same answer as a missing session: no way to enumerate accounts. */
const blocked = (u) => !u || u.verification === 'REJECTED';

export function authenticate(req, _res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in required'));
  try {
    const p = jwt.verify(h.slice(7), config.accessSecret, { algorithms: ['HS256'] });
    const user = db.prepare('SELECT id, email, role, verification, consent_at, token_version FROM users WHERE id = ?').get(p.sub);
    if (blocked(user)) throw new Error('gone');
    // A token minted before the last disable/password change/role change is no longer valid.
    if ((p.tv || 0) !== (user.token_version || 0)) throw new Error('stale');
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHENTICATED', 'Session expired'));
  }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(forbidden('Not allowed for your role'));

export const requireVerifiedEmployer = (req, _res, next) =>
  req.user.verification === 'VERIFIED' ? next() : next(forbidden('Your employer account is awaiting admin approval', 'EMPLOYER_NOT_VERIFIED'));

// ---- Password reset (email token) ----
export const resetToken = () => crypto.randomBytes(32).toString('base64url');

export function createPasswordReset(userId, ttlMinutes = 60) {
  db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(userId);
  const token = resetToken();
  const exp = new Date(Date.now() + ttlMinutes * 60000).toISOString();
  db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,?)').run(userId, sha(token), exp);
  return { token, expiresAt: exp };
}

/** Returns the user id for a valid, unused, unexpired token, or null. Marks the token as used. */
export function consumePasswordReset(token) {
  if (!token || typeof token !== 'string') return null;
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha(token));
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) return null;
  db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?").run(row.id);
  return row.user_id;
}

/** Change a password and end every existing session for that account. */
export async function setPassword(userId, password) {
  const hash = await hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  bumpTokenVersion(userId);
  revokeAllSessions(userId);
}
