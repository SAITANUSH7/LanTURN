import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import { HttpError, conflict, parse, wrap, bad } from '../util.js';
import { authenticate, hashPassword, checkPassword, signAccess, issueRefresh, rotateRefresh, revokeRefresh, clearRefresh } from '../auth.js';

export const authRouter = Router();

const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'must be at least 8 characters').max(128),
  role: z.enum(['STUDENT', 'EMPLOYER']),
  fullName: z.string().trim().max(120).optional(),
  companyName: z.string().trim().max(160).optional(),
}).strict();

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) }).strict();

export function publicUser(u) {
  const out = { id: u.id, email: u.email, role: u.role, verification: u.verification, consentAt: u.consent_at || null };
  if (u.role === 'STUDENT') {
    const p = db.prepare('SELECT full_name FROM student_profiles WHERE user_id = ?').get(u.id);
    out.name = p?.full_name || '';
  } else if (u.role === 'EMPLOYER') {
    const p = db.prepare('SELECT company_name FROM employer_profiles WHERE user_id = ?').get(u.id);
    out.name = p?.company_name || '';
  } else out.name = 'Admin';
  return out;
}

authRouter.post('/register', wrap(async (req, res) => {
  const b = parse(RegisterSchema, req.body);
  if (b.role === 'EMPLOYER' && !b.companyName) throw bad('companyName: required for employers');
  if (b.role === 'STUDENT') {
    if (!b.fullName) throw bad('fullName: required for students');
    const domain = b.email.split('@')[1];
    if (config.studentDomains.length && !config.studentDomains.includes(domain)) {
      throw bad(`Students must register with a college email (${config.studentDomains.join(', ')})`);
    }
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(b.email)) throw conflict('An account with this email already exists');
  const user = tx(() => {
    const verification = b.role === 'STUDENT' ? 'VERIFIED' : 'PENDING';
    const id = Number(db.prepare('INSERT INTO users (email, password_hash, role, verification) VALUES (?,?,?,?)').run(b.email, hashPassword(b.password), b.role, verification).lastInsertRowid);
    if (b.role === 'STUDENT') db.prepare('INSERT INTO student_profiles (user_id, full_name) VALUES (?,?)').run(id, b.fullName);
    else db.prepare('INSERT INTO employer_profiles (user_id, company_name) VALUES (?,?)').run(id, b.companyName);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  });
  issueRefresh(res, user.id);
  res.status(201).json({ accessToken: signAccess(user), user: publicUser(user) });
}));

authRouter.post('/login', wrap(async (req, res) => {
  const b = parse(LoginSchema, req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(b.email);
  if (!user || !checkPassword(b.password, user.password_hash)) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  issueRefresh(res, user.id);
  res.json({ accessToken: signAccess(user), user: publicUser(user) });
}));

authRouter.post('/refresh', wrap(async (req, res) => {
  const user = rotateRefresh(req, res);
  res.json({ accessToken: signAccess(user), user: publicUser(user) });
}));

// Used on page load: like /refresh, but a missing or stale session is a normal 200 with no user.
authRouter.post('/session', wrap(async (req, res) => {
  try {
    const user = rotateRefresh(req, res);
    res.json({ accessToken: signAccess(user), user: publicUser(user) });
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) { clearRefresh(res); return res.json({ accessToken: null, user: null }); }
    throw e;
  }
}));

authRouter.post('/logout', wrap(async (req, res) => {
  revokeRefresh(req);
  clearRefresh(res);
  res.json({ ok: true });
}));

export const meRouter = Router();
meRouter.get('/', authenticate, wrap(async (req, res) => {
  res.json({ user: publicUser(req.user) });
}));
