import { Router } from 'express';
import { notify } from '../notify.js';
import { z } from 'zod';
import { db, tx, parseJson } from '../db.js';
import { conflict, notFound, parse, wrap, bad } from '../util.js';
import { authenticate, requireRole, requireVerifiedEmployer } from '../auth.js';
import { idParam, loadJobSkills, serializeJob, JOB_SELECT, recordEvent, eventsFor, latestAnalysis, studentSkills } from './common.js';
import { skillGap } from '../ai/scoring.js';

export const employerRouter = Router();
const employer = [authenticate, requireRole('EMPLOYER')];

// ---------- Company ----------
const CompanySchema = z.object({
  companyName: z.string().trim().min(1).max(160),
  website: z.string().trim().max(200).default(''),
  industry: z.string().trim().max(100).default(''),
  size: z.string().trim().max(40).default(''),
  description: z.string().trim().max(2000).default(''),
  location: z.string().trim().max(120).default(''),
}).strict();

const companyOut = (p, user) => ({ companyName: p.company_name, website: p.website, industry: p.industry, size: p.size, description: p.description, location: p.location, verification: user.verification });

employerRouter.get('/employers/me/company', ...employer, wrap(async (req, res) => {
  res.json(companyOut(db.prepare('SELECT * FROM employer_profiles WHERE user_id = ?').get(req.user.id), req.user));
}));

employerRouter.put('/employers/me/company', ...employer, wrap(async (req, res) => {
  const b = parse(CompanySchema, req.body);
  if (b.website && !/^https?:\/\//i.test(b.website)) throw bad('website: must start with http:// or https://');
  db.prepare('UPDATE employer_profiles SET company_name=?, website=?, industry=?, size=?, description=?, location=? WHERE user_id=?')
    .run(b.companyName, b.website, b.industry, b.size, b.description, b.location, req.user.id);
  res.json(companyOut(db.prepare('SELECT * FROM employer_profiles WHERE user_id = ?').get(req.user.id), req.user));
}));

// ---------- Jobs ----------
const JobSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  type: z.enum(['INTERNSHIP', 'FULL_TIME', 'PART_TIME', 'CONTRACT']),
  location: z.string().trim().max(120).default(''),
  remote: z.boolean().default(false),
  compensation: z.string().trim().max(120).default(''),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').nullable().optional(),
  skills: z.array(z.object({ skillId: z.number().int().positive(), weight: z.number().int().min(1).max(3) })).min(1, 'add at least one required skill').max(20),
}).strict();

function saveSkills(jobId, skills) {
  const ids = [...new Set(skills.map((s) => s.skillId))];
  const known = new Set(db.prepare(`SELECT id FROM skills WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map((r) => r.id));
  if (known.size !== ids.length) throw bad('skills: contains an unknown skill');
  db.prepare('DELETE FROM job_skills WHERE job_id = ?').run(jobId);
  const ins = db.prepare('INSERT OR REPLACE INTO job_skills (job_id, skill_id, weight) VALUES (?,?,?)');
  for (const s of skills) ins.run(jobId, s.skillId, s.weight);
}

const ownJob = (userId, id) => {
  const j = db.prepare(`${JOB_SELECT} WHERE j.id = ? AND j.employer_id = ?`).get(idParam(id), userId);
  if (!j) throw notFound('Job not found');
  return j;
};

employerRouter.post('/employer/jobs', ...employer, requireVerifiedEmployer, wrap(async (req, res) => {
  const b = parse(JobSchema, req.body);
  const id = tx(() => {
    const jid = Number(db.prepare('INSERT INTO jobs (employer_id, title, description, type, location, remote, compensation, deadline) VALUES (?,?,?,?,?,?,?,?)')
      .run(req.user.id, b.title, b.description, b.type, b.location, b.remote ? 1 : 0, b.compensation, b.deadline ?? null).lastInsertRowid);
    saveSkills(jid, b.skills);
    return jid;
  });
  const row = ownJob(req.user.id, id);
  res.status(201).json(serializeJob(row, loadJobSkills([id]).get(id)));
}));

employerRouter.get('/employer/jobs', ...employer, wrap(async (req, res) => {
  const rows = db.prepare(`${JOB_SELECT} WHERE j.employer_id = ? ORDER BY j.created_at DESC, j.id DESC`).all(req.user.id);
  const skills = loadJobSkills(rows.map((r) => r.id));
  const counts = new Map(db.prepare(`SELECT a.job_id, COUNT(*) AS n FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = ? GROUP BY a.job_id`).all(req.user.id).map((r) => [r.job_id, r.n]));
  res.json({ items: rows.map((r) => ({ ...serializeJob(r, skills.get(r.id)), applicantCount: counts.get(r.id) || 0 })) });
}));

employerRouter.put('/employer/jobs/:id', ...employer, requireVerifiedEmployer, wrap(async (req, res) => {
  const existing = ownJob(req.user.id, req.params.id);
  const b = parse(JobSchema, req.body);
  tx(() => {
    db.prepare('UPDATE jobs SET title=?, description=?, type=?, location=?, remote=?, compensation=?, deadline=? WHERE id = ?')
      .run(b.title, b.description, b.type, b.location, b.remote ? 1 : 0, b.compensation, b.deadline ?? null, existing.id);
    saveSkills(existing.id, b.skills);
  });
  res.json(serializeJob(ownJob(req.user.id, existing.id), loadJobSkills([existing.id]).get(existing.id)));
}));

employerRouter.post('/employer/jobs/:id/close', ...employer, wrap(async (req, res) => {
  const j = ownJob(req.user.id, req.params.id);
  db.prepare("UPDATE jobs SET status = 'CLOSED' WHERE id = ?").run(j.id);
  for (const a of db.prepare("SELECT student_id FROM applications WHERE job_id = ? AND status IN ('APPLIED','SHORTLISTED','INTERVIEW')").all(j.id)) {
    notify(a.student_id, 'job_removed', `Job closed: ${j.title}`, 'The employer closed this position.', '#/student/applications');
  }
  res.json(serializeJob(ownJob(req.user.id, j.id), loadJobSkills([j.id]).get(j.id)));
}));

// ---------- Candidates ----------
const STATUSES = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'];
export const TRANSITIONS = {
  APPLIED: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['OFFERED', 'REJECTED'],
  OFFERED: [], REJECTED: [], WITHDRAWN: [],
};

employerRouter.get('/employer/jobs/:id/candidates', ...employer, wrap(async (req, res) => {
  const job = ownJob(req.user.id, req.params.id);
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  const sort = req.query.sort === 'resume' ? 'resume' : 'match';
  const rows = db.prepare(`SELECT a.id, a.status, a.match_score, a.created_at, a.resume_id, p.full_name, p.college, p.degree, p.branch, p.graduation_year, p.location, a.student_id
    FROM applications a JOIN student_profiles p ON p.user_id = a.student_id WHERE a.job_id = ? ${status ? 'AND a.status = ?' : ''}`).all(...(status ? [job.id, status] : [job.id]));
  const items = rows.map((r) => {
    const an = r.resume_id ? latestAnalysis(r.resume_id) : null;
    return {
      applicationId: r.id, status: r.status, matchScore: r.match_score, appliedAt: r.created_at,
      resumeScore: an?.overallScore ?? null,
      student: { name: r.full_name, college: r.college, degree: r.degree, branch: r.branch, graduationYear: r.graduation_year, location: r.location },
      topSkills: studentSkills(r.student_id).slice(0, 6).map((s) => s.name),
    };
  });
  items.sort((a, b) => (sort === 'resume' ? (b.resumeScore ?? -1) - (a.resumeScore ?? -1) : b.matchScore - a.matchScore));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM applications WHERE job_id = ? GROUP BY status').all(job.id)) counts[r.status] = r.n;
  res.json({ job: { id: job.id, title: job.title, status: job.status }, counts, items });
}));

function ownApplication(userId, id) {
  const a = db.prepare(`SELECT a.*, j.employer_id, j.title AS job_title, j.id AS jid FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ? AND j.employer_id = ?`).get(idParam(id), userId);
  if (!a) throw notFound('Application not found');
  return a;
}

employerRouter.get('/employer/applications/:id', ...employer, wrap(async (req, res) => {
  const a = ownApplication(req.user.id, req.params.id);
  const p = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(a.student_id);
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(a.student_id);
  const skills = studentSkills(a.student_id);
  const required = loadJobSkills([a.jid]).get(a.jid);
  const gap = skillGap(required, new Set(skills.map((s) => s.id)));
  const resume = a.resume_id ? db.prepare('SELECT id, filename, file_key, extracted_text FROM resumes WHERE id = ?').get(a.resume_id) : null;
  res.json({
    id: a.id, status: a.status, matchScore: a.match_score, coverNote: a.cover_note, appliedAt: a.created_at,
    allowedTransitions: TRANSITIONS[a.status],
    job: { id: a.jid, title: a.job_title },
    student: {
      name: p.full_name, email: u.email, college: p.college, degree: p.degree, branch: p.branch,
      graduationYear: p.graduation_year, location: p.location, bio: p.bio,
      skills: skills.map((s) => s.name),
    },
    gap: { matchPercent: gap.matchPercent, matched: gap.matched, missing: gap.missing },
    resume: resume ? { id: resume.id, filename: resume.filename, hasFile: !!resume.file_key, text: resume.extracted_text, analysis: latestAnalysis(resume.id) } : null,
    events: eventsFor(a.id),
  });
}));

employerRouter.patch('/employer/applications/:id/status', ...employer, wrap(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(STATUSES) }).strict(), req.body);
  const a = ownApplication(req.user.id, req.params.id);
  if (!TRANSITIONS[a.status].includes(status)) throw conflict(`Cannot move from ${a.status} to ${status}`, 'INVALID_TRANSITION');
  tx(() => {
    db.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, a.id);
    recordEvent(a.id, a.status, status, req.user.id);
  });
  const jt = db.prepare('SELECT j.title, e.company_name FROM jobs j LEFT JOIN employer_profiles e ON e.user_id = j.employer_id WHERE j.id = ?').get(a.job_id);
  notify(a.student_id, 'application_status', `Application ${status.toLowerCase()}`, `${jt?.company_name || 'The employer'} moved your application for ${jt?.title || 'a job'} to ${status}.`, '#/student/applications');
  res.json({ id: a.id, status, allowedTransitions: TRANSITIONS[status], events: eventsFor(a.id) });
}));

// ---------- Dashboard ----------
employerRouter.get('/employer/dashboard', ...employer, wrap(async (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a).n;
  const base = 'FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = ?';
  res.json({
    verification: req.user.verification,
    openJobs: one("SELECT COUNT(*) AS n FROM jobs WHERE employer_id = ? AND status = 'OPEN'", req.user.id),
    totalJobs: one('SELECT COUNT(*) AS n FROM jobs WHERE employer_id = ?', req.user.id),
    applicants: one(`SELECT COUNT(*) AS n ${base}`, req.user.id),
    shortlisted: one(`SELECT COUNT(*) AS n ${base} AND a.status = 'SHORTLISTED'`, req.user.id),
    interviews: one(`SELECT COUNT(*) AS n ${base} AND a.status = 'INTERVIEW'`, req.user.id),
    offers: one(`SELECT COUNT(*) AS n ${base} AND a.status = 'OFFERED'`, req.user.id),
  });
}));

// ---------- Admin ----------
export const adminRouter = Router();
const admin = [authenticate, requireRole('ADMIN')];

adminRouter.get('/admin/employers', ...admin, wrap(async (req, res) => {
  const status = ['PENDING', 'VERIFIED', 'REJECTED'].includes(req.query.status) ? req.query.status : null;
  const rows = db.prepare(`SELECT u.id, u.email, u.verification, u.created_at, p.company_name, p.industry, p.location FROM users u JOIN employer_profiles p ON p.user_id = u.id WHERE u.role = 'EMPLOYER' ${status ? 'AND u.verification = ?' : ''} ORDER BY u.created_at DESC`).all(...(status ? [status] : []));
  res.json({ items: rows.map((r) => ({ userId: r.id, email: r.email, verification: r.verification, createdAt: r.created_at, companyName: r.company_name, industry: r.industry, location: r.location })) });
}));

for (const [action, value] of [['approve', 'VERIFIED'], ['reject', 'REJECTED']]) {
  adminRouter.post(`/admin/employers/:userId/${action}`, ...admin, wrap(async (req, res) => {
    const u = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'EMPLOYER'").get(idParam(req.params.userId));
    if (!u) throw notFound('Employer not found');
    db.prepare('UPDATE users SET verification = ? WHERE id = ?').run(value, u.id);
    res.json({ userId: u.id, verification: value });
  }));
}

export { parseJson };
