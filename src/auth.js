import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { config } from './config.js';
import { HttpError, forbidden } from './util.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const hashPassword = (pw) => bcrypt.hashSync(pw, 11);
export const checkPassword = (pw, hash) => bcrypt.compareSync(pw, hash);

export function signAccess(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.accessSecret, { expiresIn: `${config.accessTtlMin}m` });
}

const COOKIE = 'lt_refresh';

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

/** Rotate: revoke the presented token, issue a new one. Reuse of a revoked token revokes the family. */
export function rotateRefresh(req, res) {
  const token = readCookie(req, COOKIE);
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'No session');
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(sha(token));
  if (!row) throw new HttpError(401, 'UNAUTHENTICATED', 'Invalid session');
  if (row.revoked_at) {
    db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE family = ? AND revoked_at IS NULL").run(row.family);
    throw new HttpError(401, 'UNAUTHENTICATED', 'Session reuse detected, please sign in again');
  }
  if (new Date(row.expires_at) < new Date()) throw new HttpError(401, 'UNAUTHENTICATED', 'Session expired');
  db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?").run(row.id);
  issueRefresh(res, row.user_id, row.family);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
}

export function revokeRefresh(req) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL").run(sha(token));
}

export function authenticate(req, _res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in required'));
  try {
    const p = jwt.verify(h.slice(7), config.accessSecret);
    const user = db.prepare('SELECT id, email, role, verification, consent_at FROM users WHERE id = ?').get(p.sub);
    if (!user) throw new Error('gone');
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
