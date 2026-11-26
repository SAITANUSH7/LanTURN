// Hiring teams: an employer owner invites colleagues who then work inside the same workspace.
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { bad, conflict, notFound, parse, wrap } from '../util.js';
import { authenticate, requireRole, requireOwner, hashPassword, signAccess, issueRefresh } from '../auth.js';
import { passwordProblem } from '../security.js';
import { idParam } from './common.js';
import { emailInvite, publicUrl } from '../email.js';
import { publicUser } from './auth.js';

export const teamRouter = Router();
const MAX_SEATS = 10;
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const employer = [authenticate, requireRole('EMPLOYER')];

function listTeam(ownerId) {
  const members = db.prepare(`SELECT u.id, u.email, u.created_at AS joinedAt, COALESCE(t.name, '') AS name FROM users u LEFT JOIN team_invites t ON t.user_id = u.id WHERE u.team_owner_id = ? ORDER BY u.id`).all(ownerId);
  const invites = db.prepare("SELECT id, email, name, created_at AS createdAt, expires_at AS expiresAt FROM team_invites WHERE owner_id = ? AND accepted_at IS NULL AND expires_at > datetime('now') ORDER BY id DESC").all(ownerId);
  return { members, invites, seatsLeft: Math.max(0, MAX_SEATS - members.length - invites.length), limit: MAX_SEATS };
}

teamRouter.get('/employer/team', ...employer, wrap(async (req, res) => {
  const owner = db.prepare('SELECT u.email, p.company_name AS company FROM users u LEFT JOIN employer_profiles p ON p.user_id = u.id WHERE u.id = ?').get(req.user.id);
  res.json({ isOwner: !req.user.memberId, company: owner?.company || '', ownerEmail: owner?.email || '', ...(req.user.memberId ? { members: [], invites: [], seatsLeft: 0, limit: MAX_SEATS } : listTeam(req.user.id)) });
}));

teamRouter.post('/employer/team/invites', ...employer, requireOwner, wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().toLowerCase().email().max(200), name: z.string().trim().max(80).default('') }).strict(), req.body);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(b.email)) throw conflict('That email already has a LanTURN account. Ask them to use a different email.');
  db.prepare("DELETE FROM team_invites WHERE owner_id = ? AND accepted_at IS NULL AND (expires_at <= datetime('now') OR email = ?)").run(req.user.id, b.email);
  if (listTeam(req.user.id).seatsLeft <= 0) throw conflict(`Your team is full (${MAX_SEATS} seats including pending invites).`);
  const token = crypto.randomBytes(24).toString('hex');
  const id = Number(db.prepare("INSERT INTO team_invites (owner_id, email, name, token_hash, expires_at) VALUES (?,?,?,?, datetime('now','+7 days'))").run(req.user.id, b.email, b.name, hashToken(token)).lastInsertRowid);
  const link = `${publicUrl()}/#/join?token=${token}`;
  const company = db.prepare('SELECT company_name FROM employer_profiles WHERE user_id = ?').get(req.user.id)?.company_name || 'An employer';
  const emailed = emailInvite(b.email, company, link);
  res.status(201).json({ id, email: b.email, link, emailed, ...listTeam(req.user.id) });
}));

teamRouter.delete('/employer/team/invites/:id', ...employer, requireOwner, wrap(async (req, res) => {
  const r = db.prepare('DELETE FROM team_invites WHERE id = ? AND owner_id = ? AND accepted_at IS NULL').run(idParam(req.params.id), req.user.id);
  if (!r.changes) throw notFound('Invite not found');
  res.json(listTeam(req.user.id));
}));

teamRouter.delete('/employer/team/members/:id', ...employer, requireOwner, wrap(async (req, res) => {
  const r = db.prepare('DELETE FROM users WHERE id = ? AND team_owner_id = ?').run(idParam(req.params.id), req.user.id);
  if (!r.changes) throw notFound('Member not found');
  res.json(listTeam(req.user.id));
}));

// ---- Public: look up and accept an invitation ----
const findInvite = (token) => db.prepare(`SELECT t.*, p.company_name AS company FROM team_invites t LEFT JOIN employer_profiles p ON p.user_id = t.owner_id
  WHERE t.token_hash = ? AND t.accepted_at IS NULL AND t.expires_at > datetime('now')`).get(hashToken(String(token || '')));

teamRouter.get('/auth/invite/:token', wrap(async (req, res) => {
  const inv = findInvite(req.params.token);
  if (!inv) throw notFound('This invitation is invalid or has expired. Ask the account owner for a new one.');
  res.json({ email: inv.email, name: inv.name, company: inv.company || 'an employer' });
}));

teamRouter.post('/auth/join', wrap(async (req, res) => {
  const b = parse(z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(200), name: z.string().trim().min(1, 'name: required').max(80) }).strict(), req.body);
  const inv = findInvite(b.token);
  if (!inv) throw notFound('This invitation is invalid or has expired. Ask the account owner for a new one.');
  const weak = passwordProblem(b.password);
  if (weak) throw bad(`password: ${weak}`);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(inv.email)) throw conflict('An account with this email already exists');
  const hash = await hashPassword(b.password);
  const user = tx(() => {
    const id = Number(db.prepare("INSERT INTO users (email, password_hash, role, verification, team_owner_id) VALUES (?,?, 'EMPLOYER', 'VERIFIED', ?)").run(inv.email, hash, inv.owner_id).lastInsertRowid);
    db.prepare("UPDATE team_invites SET accepted_at = datetime('now'), user_id = ?, name = ? WHERE id = ?").run(id, b.name, inv.id);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  });
  issueRefresh(res, user.id);
  res.status(201).json({ accessToken: signAccess(user), user: publicUser(user) });
}));
