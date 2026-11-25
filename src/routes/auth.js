import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import { HttpError, conflict, parse, wrap, bad } from '../util.js';
import { assertNotLocked, recordFailure, clearFailures, passwordProblem } from '../security.js';
import { authenticate, hashPassword, checkPassword, signAccess, issueRefresh, rotateRefresh, revokeRefresh, clearRefresh, createPasswordReset, consumePasswordReset, setPassword, revokeAllSessions } from '../auth.js';
import { notify } from '../notify.js';
import { emailEnabled } from '../email.js';
import { audit } from '../audit.js';

export const authRouter = Router();

// One real bcrypt hash to compare against when the email is unknown, so both paths cost the same time.
let dummyHash = null;
const dummy = async () => (dummyHash ||= await hashPassword('not-a-real-password-0'));

const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'must be at least 8 characters').max(128),
  role: z.enum(['STUDENT', 'EMPLOYER']),
  fullName: z.string().trim().max(120).optional(),
  companyName: z.string().trim().max(160).optional(),
}).strict();

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) }).strict();
const PasswordSchema = z.string().min(8, 'must be at least 8 characters').max(128);

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
  const weak = passwordProblem(b.password);
  if (weak) throw bad(`password: ${weak}`);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(b.email)) throw conflict('An account with this email already exists');
  const hash = await hashPassword(b.password);
  const user = tx(() => {
    const verification = b.role === 'STUDENT' ? 'VERIFIED' : 'PENDING';
    const id = Number(db.prepare('INSERT INTO users (email, password_hash, role, verification) VALUES (?,?,?,?)').run(b.email, hash, b.role, verification).lastInsertRowid);
    if (b.role === 'STUDENT') db.prepare('INSERT INTO student_profiles (user_id, full_name) VALUES (?,?)').run(id, b.fullName);
    else db.prepare('INSERT INTO employer_profiles (user_id, company_name) VALUES (?,?)').run(id, b.companyName);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  });
  issueRefresh(res, user.id);
  res.status(201).json({ accessToken: signAccess(user), user: publicUser(user) });
}));

authRouter.post('/login', wrap(async (req, res) => {
  const b = parse(LoginSchema, req.body);
  assertNotLocked(b.email, req.ip);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(b.email);
  // Always run one bcrypt compare so unknown emails cost the same time as wrong passwords.
  const ok = await checkPassword(b.password, user ? user.password_hash : await dummy());
  if (!user || !ok) {
    recordFailure(b.email, req.ip);
    // Warn the owner exactly once, when the account reaches the lockout threshold. The caller learns nothing.
    if (user) {
      const n = db.prepare(`SELECT COUNT(*) n FROM login_attempts WHERE email = ? AND at > datetime('now','-15 minutes')`).get(b.email).n;
      if (n === 5) notify(user.id, 'security_alert', 'Five failed sign-in attempts', 'Someone tried to sign in to your LanTURN account five times and it is now locked for 15 minutes. If that was not you, reset your password.', '#/login');
    }
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  // A disabled account must not get a session, and the answer must not reveal that the account exists.
  if (user.verification === 'REJECTED') {
    recordFailure(b.email, req.ip);
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  clearFailures(b.email);
  issueRefresh(res, user.id);
  res.json({ accessToken: signAccess(user), user: publicUser(user) });
}));

authRouter.post('/refresh', wrap(async (req, res) => {
  const { user } = rotateRefresh(req, res);
  if (user.verification === 'REJECTED') throw new HttpError(401, 'UNAUTHENTICATED', 'Account disabled');
  res.json({ accessToken: signAccess(user), user: publicUser(user) });
}));

// Used on page load: like /refresh, but a missing or stale session is a normal 200 with no user.
authRouter.post('/session', wrap(async (req, res) => {
  try {
    const { user } = rotateRefresh(req, res);
    if (user.verification === 'REJECTED') { clearRefresh(res); return res.json({ accessToken: null, user: null }); }
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

// ---- Password reset ----
const ForgotSchema = z.object({ email: z.string().trim().toLowerCase().email() }).strict();
authRouter.post('/forgot-password', wrap(async (req, res) => {
  const b = parse(ForgotSchema, req.body);
  const user = db.prepare('SELECT id, verification FROM users WHERE email = ?').get(b.email);
  const generic = { ok: true, message: 'If that email has an account, a reset link is on its way.' };
  if (!user || user.verification === 'REJECTED') return res.json(generic);

  const { token, expiresAt } = createPasswordReset(user.id);
  const link = `#/reset-password?token=${encodeURIComponent(token)}`;
  if (emailEnabled()) {
    notify(user.id, 'password_reset', 'Reset your LanTURN password', `This link works for one hour and can be used once: ${process.env.PUBLIC_URL || ''}/${link}`, link);
    return res.json(generic);
  }
  // No email provider (a self-hosted instance with no Resend key): the operator still needs a way through, so the link
  // goes to the server log. It never goes into the response — a response body that differs for real and unknown
  // addresses is an account-enumeration oracle, and dev machines are exactly where people reuse real addresses.
  console.warn(`[auth] no email provider configured (EMAIL_API_KEY/EMAIL_FROM). Reset link for ${b.email}: ${link} (expires ${expiresAt})`);
  res.json(generic);
}));

const ResetSchema = z.object({ token: z.string().min(10).max(200), password: PasswordSchema }).strict();
authRouter.post('/reset-password', wrap(async (req, res) => {
  const b = parse(ResetSchema, req.body);
  const weak = passwordProblem(b.password);
  if (weak) throw bad(`password: ${weak}`);
  const userId = consumePasswordReset(b.token);
  if (!userId) throw new HttpError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired. Request a new one.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || user.verification === 'REJECTED') throw new HttpError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired. Request a new one.');
  await setPassword(userId, b.password);
  clearFailures(user.email);
  audit(userId, 'password.reset', user.email, { self: true });
  notify(userId, 'security_alert', 'Your password was changed', 'All other devices have been signed out. If this was not you, contact your placement cell immediately.', '#/login');
  res.json({ ok: true });
}));

const ChangeSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: PasswordSchema }).strict();
authRouter.post('/change-password', authenticate, wrap(async (req, res) => {
  const b = parse(ChangeSchema, req.body);
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!(await checkPassword(b.currentPassword, row.password_hash))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Your current password is incorrect');
  const weak = passwordProblem(b.newPassword);
  if (weak) throw bad(`newPassword: ${weak}`);
  await setPassword(req.user.id, b.newPassword);
  // Keep this device signed in: mint a fresh session for the caller.
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  issueRefresh(res, req.user.id);
  audit(req.user.id, 'password.change', req.user.email, { self: true });
  res.json({ ok: true, accessToken: signAccess(fresh), user: publicUser(fresh) });
}));

export const meRouter = Router();
meRouter.get('/', authenticate, wrap(async (req, res) => {
  res.json({ user: publicUser(req.user) });
}));

/** Everything LanTURN stores about the signed-in user, in one downloadable JSON file. */
meRouter.get('/export', authenticate, wrap(async (req, res) => {
  const id = req.user.id;
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const data = {
    exportedAt: new Date().toISOString(),
    account: one('SELECT id, email, role, verification, consent_at, created_at FROM users WHERE id = ?', id),
    studentProfile: one('SELECT * FROM student_profiles WHERE user_id = ?', id) || null,
    employerProfile: one('SELECT * FROM employer_profiles WHERE user_id = ?', id) || null,
    skills: all('SELECT s.name, s.category, ss.source FROM student_skills ss JOIN skills s ON s.id = ss.skill_id WHERE ss.user_id = ?', id),
    resumes: all('SELECT id, filename, size_bytes, page_count, extracted_text, created_at FROM resumes WHERE student_id = ?', id),
    resumeAnalyses: all('SELECT a.* FROM resume_analyses a JOIN resumes r ON r.id = a.resume_id WHERE r.student_id = ?', id),
    jobs: all('SELECT * FROM jobs WHERE employer_id = ?', id),
    applications: all('SELECT * FROM applications WHERE student_id = ?', id),
    applicationEvents: all('SELECT e.* FROM application_events e JOIN applications a ON a.id = e.application_id WHERE a.student_id = ?', id),
    interviews: all('SELECT i.* FROM interviews i JOIN applications a ON a.id = i.application_id WHERE a.student_id = ? OR a.job_id IN (SELECT id FROM jobs WHERE employer_id = ?)', id, id),
    messages: all('SELECT m.* FROM application_messages m JOIN applications a ON a.id = m.application_id WHERE a.student_id = ? OR a.job_id IN (SELECT id FROM jobs WHERE employer_id = ?)', id, id),
    notifications: all('SELECT * FROM notifications WHERE user_id = ?', id),
    savedJobs: all('SELECT * FROM saved_jobs WHERE user_id = ?', id),
    roadmaps: all('SELECT * FROM roadmaps WHERE student_id = ?', id),
    careerRoadmaps: all('SELECT * FROM career_roadmaps WHERE student_id = ?', id),
    careerDna: one('SELECT * FROM career_dna WHERE user_id = ?', id) || null,
    companyDna: one('SELECT * FROM company_dna WHERE user_id = ?', id) || null,
    skillMedals: all('SELECT * FROM skill_medals WHERE user_id = ?', id),
    mockInterviews: all('SELECT * FROM mock_interviews WHERE student_id = ?', id),
    driveRegistrations: all('SELECT * FROM drive_registrations WHERE student_id = ?', id),
    connections: all('SELECT * FROM connections WHERE requester_id = ? OR recipient_id = ?', id, id),
    posts: all('SELECT * FROM posts WHERE author_id = ?', id),
    directMessages: all('SELECT * FROM direct_messages WHERE sender_id = ? OR recipient_id = ?', id, id),
    endorsements: all('SELECT * FROM skill_endorsements WHERE student_id = ? OR endorser_id = ?', id, id),
    aiUsage: one('SELECT COUNT(*) AS actions FROM ai_usage WHERE user_id = ?', id),
  };
  res.setHeader('Content-Disposition', `attachment; filename="lanturn-export-${id}.json"`);
  res.type('application/json');
  res.send(JSON.stringify(data, null, 2));
}));

/** Delete the account and everything attached to it (GDPR/DPDP erasure). Requires the current password. */
meRouter.delete('/', authenticate, wrap(async (req, res) => {
  const b = parse(z.object({ password: z.string().min(1).max(128), confirm: z.literal('DELETE') }).strict(), req.body ?? {});
  const row = db.prepare('SELECT password_hash, email, role FROM users WHERE id = ?').get(req.user.id);
  if (!(await checkPassword(b.password, row.password_hash))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Your password is incorrect');
  // Remove stored files first: rows cascade, files on disk do not.
  const files = [
    ...db.prepare('SELECT file_key AS k FROM resumes WHERE student_id = ? AND file_key IS NOT NULL').all(req.user.id),
    ...db.prepare('SELECT key AS k FROM uploads WHERE user_id = ?').all(req.user.id),
  ].map((r) => r.k);
  for (const key of files) { try { fs.rmSync(path.join(config.uploadDir, key), { force: true }); } catch { /* already gone */ } }
  audit(req.user.id, 'account.delete', row.email, { role: row.role });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  clearRefresh(res);
  res.json({ ok: true });
}));
