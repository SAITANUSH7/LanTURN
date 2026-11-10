import { Router } from 'express';
import { notify } from '../notify.js';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { conflict, notFound, forbidden, parse, wrap, page } from '../util.js';
import { authenticate, requireRole } from '../auth.js';
import { idParam, studentContext, loadJobSkills, serializeJob, JOB_SELECT, matchFor, recordEvent, eventsFor } from './common.js';

export const jobsRouter = Router();
const open = "j.status = 'OPEN' AND (j.deadline IS NULL OR j.deadline >= date('now'))";

function withMatches(rows, req) {
  const skills = loadJobSkills(rows.map((r) => r.id));
  const ctx = req.user.role === 'STUDENT' ? studentContext(req.user.id) : null;
  const applied = ctx
    ? new Set(db.prepare('SELECT job_id FROM applications WHERE student_id = ?').all(req.user.id).map((r) => r.job_id))
    : new Set();
  return rows.map((r) => {
    const job = serializeJob(r, skills.get(r.id));
    if (ctx) {
      const m = matchFor(r, skills.get(r.id), ctx);
      job.match = { score: m.score, skillMatch: m.skillMatch, matchedCount: m.matched.length, missingCount: m.missing.length };
      job.applied = applied.has(r.id);
    }
    return job;
  });
}

jobsRouter.get('/jobs', authenticate, wrap(async (req, res) => {
  const { page: p, pageSize, offset } = page(req.query);
  const where = [open];
  const args = [];
  const q = String(req.query.q || '').trim();
  if (q) { where.push('(j.title LIKE ? OR j.description LIKE ? OR e.company_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (['INTERNSHIP', 'FULL_TIME', 'PART_TIME', 'CONTRACT'].includes(req.query.type)) { where.push('j.type = ?'); args.push(req.query.type); }
  if (req.query.location) { where.push('j.location LIKE ?'); args.push(`%${String(req.query.location).trim()}%`); }
  if (req.query.remote === 'true') where.push('j.remote = 1');
  const skillId = idParam(req.query.skillId);
  if (skillId > 0) { where.push('EXISTS (SELECT 1 FROM job_skills js WHERE js.job_id = j.id AND js.skill_id = ?)'); args.push(skillId); }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM jobs j LEFT JOIN employer_profiles e ON e.user_id = j.employer_id WHERE ${clause}`).get(...args).n;
  const rows = db.prepare(`${JOB_SELECT} WHERE ${clause} ORDER BY j.created_at DESC, j.id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, offset);
  res.json({ items: withMatches(rows, req), page: p, pageSize, total });
}));

jobsRouter.get('/jobs/recommended', authenticate, requireRole('STUDENT'), wrap(async (req, res) => {
  const rows = db.prepare(`${JOB_SELECT} WHERE ${open}`).all();
  const items = withMatches(rows, req).filter((j) => !j.applied).sort((a, b) => b.match.score - a.match.score).slice(0, 20);
  res.json({ items });
}));

jobsRouter.get('/jobs/:id', authenticate, wrap(async (req, res) => {
  const row = db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(idParam(req.params.id));
  const isOwner = row && req.user.role === 'EMPLOYER' && row.employer_id === req.user.id;
  if (!row || (!isOwner && req.user.role !== 'ADMIN' && row.status !== 'OPEN')) throw notFound('Job not found');
  const skills = loadJobSkills([row.id]).get(row.id);
  const job = serializeJob(row, skills);
  if (req.user.role === 'STUDENT') {
    const ctx = studentContext(req.user.id);
    job.matchBreakdown = matchFor(row, skills, ctx);
    const app = db.prepare('SELECT id, status FROM applications WHERE job_id = ? AND student_id = ?').get(row.id, req.user.id);
    job.application = app || null;
  }
  res.json(job);
}));

const ApplySchema = z.object({ resumeId: z.number().int().positive(), coverNote: z.string().trim().max(1500).default('') }).strict();

jobsRouter.post('/jobs/:id/apply', authenticate, requireRole('STUDENT'), wrap(async (req, res) => {
  const b = parse(ApplySchema, req.body);
  const row = db.prepare(`${JOB_SELECT} WHERE j.id = ? AND ${open}`).get(idParam(req.params.id));
  if (!row) throw notFound('This job is not open for applications');
  const resume = db.prepare('SELECT id FROM resumes WHERE id = ? AND student_id = ?').get(b.resumeId, req.user.id);
  if (!resume) throw notFound('Resume not found');
  if (db.prepare('SELECT 1 FROM applications WHERE job_id = ? AND student_id = ?').get(row.id, req.user.id)) {
    throw conflict('You have already applied to this job', 'ALREADY_APPLIED');
  }
  const ctx = studentContext(req.user.id);
  const m = matchFor(row, loadJobSkills([row.id]).get(row.id), ctx);
  const id = tx(() => {
    const aid = Number(db.prepare('INSERT INTO applications (job_id, student_id, resume_id, match_score, cover_note) VALUES (?,?,?,?,?)').run(row.id, req.user.id, resume.id, m.score, b.coverNote).lastInsertRowid);
    recordEvent(aid, null, 'APPLIED', req.user.id);
    return aid;
  });
  const who = db.prepare('SELECT full_name FROM student_profiles WHERE user_id = ?').get(req.user.id);
  notify(row.employer_id, 'application_received', `New application: ${row.title}`, `${who?.full_name || 'A student'} applied (match ${m.score}%).`, `#/employer/jobs/${row.id}/candidates`);
  res.status(201).json(applicationOut(id));
}));

// ---------- Student applications ----------
function applicationOut(id) {
  const a = db.prepare(`SELECT a.*, j.title, j.type, j.location, j.remote, e.company_name FROM applications a
    JOIN jobs j ON j.id = a.job_id LEFT JOIN employer_profiles e ON e.user_id = j.employer_id WHERE a.id = ?`).get(id);
  return {
    id: a.id, jobId: a.job_id, status: a.status, matchScore: a.match_score, coverNote: a.cover_note,
    createdAt: a.created_at, updatedAt: a.updated_at, resumeId: a.resume_id,
    job: { title: a.title, type: a.type, location: a.location, remote: !!a.remote, company: a.company_name || '' },
    events: eventsFor(a.id),
  };
}

jobsRouter.get('/applications', authenticate, requireRole('STUDENT'), wrap(async (req, res) => {
  const ids = db.prepare('SELECT id FROM applications WHERE student_id = ? ORDER BY updated_at DESC, id DESC').all(req.user.id).map((r) => r.id);
  res.json({ items: ids.map(applicationOut) });
}));

jobsRouter.get('/applications/:id', authenticate, requireRole('STUDENT'), wrap(async (req, res) => {
  const a = db.prepare('SELECT id FROM applications WHERE id = ? AND student_id = ?').get(idParam(req.params.id), req.user.id);
  if (!a) throw notFound('Application not found');
  res.json(applicationOut(a.id));
}));

jobsRouter.post('/applications/:id/withdraw', authenticate, requireRole('STUDENT'), wrap(async (req, res) => {
  const a = db.prepare('SELECT * FROM applications WHERE id = ? AND student_id = ?').get(idParam(req.params.id), req.user.id);
  if (!a) throw notFound('Application not found');
  if (['OFFERED', 'REJECTED', 'WITHDRAWN'].includes(a.status)) throw conflict(`An application that is ${a.status.toLowerCase()} cannot be withdrawn`, 'INVALID_TRANSITION');
  tx(() => {
    db.prepare("UPDATE applications SET status = 'WITHDRAWN', updated_at = datetime('now') WHERE id = ?").run(a.id);
    recordEvent(a.id, a.status, 'WITHDRAWN', req.user.id);
  });
  res.json(applicationOut(a.id));
}));

export { forbidden };
