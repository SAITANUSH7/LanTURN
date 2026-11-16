// Endpoints the React frontend (frontend/src/services) expects, implemented on top of our own schema.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { Router } from 'express';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { z } from 'zod';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError, bad, notFound, parse, wrap } from '../util.js';
import { authenticate, requireRole, signAccess } from '../auth.js';
import { publicUser } from './auth.js';
import { skillByName } from '../ai/skills.js';

export const compatRouter = Router();
const admin = [authenticate, requireRole('ADMIN')];

db.exec(`CREATE TABLE IF NOT EXISTS platform_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

// GET /auth/session: who am I (the POST variant refreshes the cookie session)
compatRouter.get('/auth/session', authenticate, wrap(async (req, res) => {
  res.json({ accessToken: signAccess(req.user), user: publicUser(req.user) });
}));

// Admin sign-in is the normal /auth/login; this exists only so old clients get a clear answer.
compatRouter.post('/auth/admin-login', wrap(async () => { throw new HttpError(410, 'GONE', 'Use /auth/login with the admin email and password'); }));

// POST /auth/onboarding {role, profile}: fill the profile created at registration.
compatRouter.post('/auth/onboarding', authenticate, wrap(async (req, res) => {
  const b = req.body ?? {};
  const p = b.profile ?? {};
  if (req.user.role === 'STUDENT') {
    const cur = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(req.user.id) || {};
    const grad = Number(p.academic?.graduationYear);
    db.prepare(`INSERT INTO student_profiles (user_id, full_name, college, degree, branch, graduation_year, location) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name, college=excluded.college, degree=excluded.degree, branch=excluded.branch, graduation_year=excluded.graduation_year, location=excluded.location`)
      .run(req.user.id, String(p.personal?.name || cur.full_name || req.user.email.split('@')[0]).slice(0, 120), String(p.academic?.college || cur.college || '').slice(0, 160), String(p.academic?.degree || cur.degree || '').slice(0, 80), String(p.academic?.branch || cur.branch || '').slice(0, 80), grad >= 2000 && grad <= 2100 ? grad : cur.graduation_year ?? null, String(p.personal?.city || cur.location || '').slice(0, 120));
    const ins = db.prepare("INSERT OR IGNORE INTO student_skills (user_id, skill_id, source) VALUES (?,?,'MANUAL')");
    for (const name of Array.isArray(p.professional?.skills) ? p.professional.skills.slice(0, 40) : []) {
      const s = skillByName(String(name));
      if (s) ins.run(req.user.id, s.id);
    }
  } else if (req.user.role === 'EMPLOYER') {
    const cur = db.prepare('SELECT * FROM employer_profiles WHERE user_id = ?').get(req.user.id) || {};
    db.prepare(`INSERT INTO employer_profiles (user_id, company_name, website, industry, size, description, location) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET company_name=excluded.company_name, website=excluded.website, industry=excluded.industry, size=excluded.size, description=excluded.description, location=excluded.location`)
      .run(req.user.id, String(p.companyName || cur.company_name || 'Company').slice(0, 160), String(p.website || cur.website || '').slice(0, 200), String(p.industry || cur.industry || '').slice(0, 80), String(p.companySize || cur.size || '').slice(0, 40), String(p.description || cur.description || '').slice(0, 1000), String(p.location?.city || cur.location || '').slice(0, 120));
  }
  res.json({ ok: true, user: publicUser(req.user) });
}));

// PATCH /notifications/:id/read (the POST form lives in ai.js)
compatRouter.patch('/notifications/:id/read', authenticate, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw bad('Invalid id');
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?").run(id, req.user.id);
  res.json({ ok: true });
}));

// POST /jobs/external-search: no external job-board key is configured, so search campus postings with the same response shape.
compatRouter.post('/jobs/external-search', authenticate, wrap(async (req, res) => {
  const b = parse(z.object({ keywords: z.string().trim().min(1).max(100), location: z.string().trim().max(80).optional().default(''), page: z.number().int().min(1).max(50).optional().default(1) }), req.body ?? {});
  const like = `%${b.keywords.toLowerCase()}%`;
  const loc = `%${b.location.toLowerCase()}%`;
  const rows = db.prepare(`SELECT j.*, e.company_name FROM jobs j LEFT JOIN employer_profiles e ON e.user_id = j.employer_id
    WHERE j.status = 'OPEN' AND (lower(j.title) LIKE ? OR lower(j.description) LIKE ?) AND lower(j.location) LIKE ? ORDER BY j.id DESC LIMIT 20 OFFSET ?`).all(like, like, loc, (b.page - 1) * 20);
  res.json({ totalCount: rows.length, jobs: rows.map((j) => ({ id: `lt-${j.id}`, title: j.title, company: j.company_name || '', location: j.location || (j.remote ? 'Remote' : ''), snippet: j.description.slice(0, 220), salary: j.compensation, type: j.type, updated: j.created_at, link: `/#/jobs/${j.id}` })) });
}));

// Platform config (key/value)
const readCfg = () => Object.fromEntries(db.prepare('SELECT key, value FROM platform_config').all().map((r) => [r.key, JSON.parse(r.value)]));
compatRouter.get('/platform/config', authenticate, wrap(async (_req, res) => res.json({ collegeName: config.collegeName, ...readCfg() })));
compatRouter.patch('/platform/config', ...admin, wrap(async (req, res) => {
  const ins = db.prepare('INSERT INTO platform_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(req.body ?? {}).slice(0, 30)) if (/^[a-zA-Z0-9_]{1,40}$/.test(k)) ins.run(k, JSON.stringify(v));
  res.json({ collegeName: config.collegeName, ...readCfg() });
}));

// Analytics time series: registrations, jobs and applications per day for the last N days.
compatRouter.get('/admin/analytics/series', ...admin, wrap(async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  const per = (table) => Object.fromEntries(db.prepare(`SELECT date(created_at) d, COUNT(*) n FROM ${table} WHERE created_at >= date('now', ?) GROUP BY d`).all(`-${days} days`).map((r) => [r.d, r.n]));
  const [u, j, a] = [per('users'), per('jobs'), per('applications')];
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    out.push({ date: d, users: u[d] || 0, jobs: j[d] || 0, applications: a[d] || 0 });
  }
  res.json({ days, series: out });
}));

// ---- Uploads: sign -> PUT raw bytes -> commit ----
const KINDS = { resume: ['application/pdf'], profilePhoto: ['image/png', 'image/jpeg', 'image/webp'], companyLogo: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'], certificate: ['application/pdf', 'image/png', 'image/jpeg'] };
const EXT = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const pending = new Map(); // objectPath -> {userId, kind, mime, at}
const sweep = () => { for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60e3) pending.delete(k); };

compatRouter.post('/uploads/sign', authenticate, wrap(async (req, res) => {
  const b = parse(z.object({ kind: z.enum(['resume', 'profilePhoto', 'companyLogo', 'certificate']), mimeType: z.string().max(80), sizeBytes: z.number().int().min(1) }), req.body ?? {});
  if (!KINDS[b.kind].includes(b.mimeType)) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', `Allowed: ${KINDS[b.kind].join(', ')}`);
  if (b.sizeBytes > config.maxUploadBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'File is too large');
  sweep();
  const objectPath = `${crypto.randomUUID()}.${EXT[b.mimeType]}`;
  pending.set(objectPath, { userId: req.user.id, kind: b.kind, mime: b.mimeType, at: Date.now() });
  res.json({ uploadUrl: `/api/uploads/put/${objectPath}`, token: (req.headers.authorization || '').replace(/^Bearer /, ''), objectPath });
}));

compatRouter.put('/uploads/put/:key', authenticate, express.raw({ type: () => true, limit: config.maxUploadBytes }), wrap(async (req, res) => {
  const meta = pending.get(req.params.key);
  if (!meta || meta.userId !== req.user.id) throw notFound('Upload not signed');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('Empty body');
  if (meta.mime === 'application/pdf' && req.body.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Not a PDF');
  fs.writeFileSync(path.join(config.uploadDir, req.params.key), req.body, { mode: 0o600 });
  meta.stored = true;
  res.json({ ok: true });
}));

compatRouter.post('/uploads/commit', authenticate, wrap(async (req, res) => {
  const b = parse(z.object({ kind: z.string(), objectPath: z.string().regex(/^[0-9a-f-]{36}\.\w{3,4}$/), fileName: z.string().max(200).optional() }), req.body ?? {});
  const meta = pending.get(b.objectPath);
  if (!meta || meta.userId !== req.user.id || !meta.stored || meta.kind !== b.kind) throw notFound('Upload not found');
  pending.delete(b.objectPath);
  const file = path.join(config.uploadDir, b.objectPath);
  const url = `/api/uploads/file/${b.objectPath}`;
  if (meta.kind === 'resume') {
    if (req.user.role !== 'STUDENT') throw new HttpError(403, 'FORBIDDEN', 'Students only');
    const buf = fs.readFileSync(file);
    let parsed;
    try { parsed = await pdfParse(new Uint8Array(buf)); } catch { throw new HttpError(422, 'UNREADABLE_PDF', 'This PDF could not be read.'); }
    const text = (parsed.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 200) throw new HttpError(422, 'UNREADABLE_PDF', 'We could not find enough text. Upload a text-based PDF, not a scan.');
    if (!req.user.consent_at) db.prepare("UPDATE users SET consent_at = datetime('now') WHERE id = ?").run(req.user.id);
    const id = Number(db.prepare('INSERT INTO resumes (student_id, filename, file_key, size_bytes, page_count, extracted_text) VALUES (?,?,?,?,?,?)').run(req.user.id, path.basename(b.fileName || 'resume.pdf').slice(0, 120), b.objectPath, buf.length, parsed.numpages || 1, text).lastInsertRowid);
    return res.status(201).json({ url, attachedTo: 'resume', resumeId: id });
  }
  res.json({ url, attachedTo: meta.kind });
}));

// Images are served by their unguessable name (needed for <img src>); PDFs only to their owner via /resumes.
compatRouter.get('/uploads/file/:key', wrap(async (req, res) => {
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp|svg)$/.test(req.params.key)) throw notFound();
  const f = path.join(config.uploadDir, req.params.key);
  if (!fs.existsSync(f)) throw notFound();
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.sendFile(f);
}));
