import { Router } from 'express';
import { enqueue } from '../queue.js';
import { notify } from '../notify.js';
import { z } from 'zod';
import { db, tx, parseJson } from '../db.js';
import { conflict, notFound, parse, wrap, bad } from '../util.js';
import { authenticate, requireRole, requireVerifiedEmployer } from '../auth.js';
import { idParam, loadJobSkills, serializeJob, JOB_SELECT, recordEvent, eventsFor, latestAnalysis, studentSkills } from './common.js';
import { skillGap } from '../ai/scoring.js';
import { llmEnabled, providerSummary } from '../ai/providers.js';
import { rankCandidates, explainTop, suggestSkills } from '../ai/hiring.js';

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
  if (b.deadline && b.deadline < new Date().toISOString().slice(0, 10)) throw bad('deadline: must not be in the past');
  const id = tx(() => {
    const jid = Number(db.prepare('INSERT INTO jobs (employer_id, title, description, type, location, remote, compensation, deadline) VALUES (?,?,?,?,?,?,?,?)')
      .run(req.user.id, b.title, b.description, b.type, b.location, b.remote ? 1 : 0, b.compensation, b.deadline ?? null).lastInsertRowid);
    saveSkills(jid, b.skills);
    return jid;
  });
  enqueue('job.match_notify', { jobId: id }, { userId: req.user.id, dedupeKey: `match:${id}` }); // heavy fan-out runs in the background
  const row = ownJob(req.user.id, id);
  res.status(201).json(serializeJob(row, loadJobSkills([id]).get(id)));
}));

employerRouter.get('/employer/jobs', ...employer, wrap(async (req, res) => {
  const rows = db.prepare(`${JOB_SELECT} WHERE j.employer_id = ? ORDER BY j.created_at DESC, j.id DESC`).all(req.user.id);
  const skills = loadJobSkills(rows.map((r) => r.id));
  const counts = new Map(db.prepare(`SELECT a.job_id, COUNT(*) AS n, SUM(a.status = 'APPLIED') AS fresh FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.employer_id = ? GROUP BY a.job_id`).all(req.user.id).map((r) => [r.job_id, r]));
  res.json({ items: rows.map((r) => ({ ...serializeJob(r, skills.get(r.id)), applicantCount: counts.get(r.id)?.n || 0, awaitingReview: counts.get(r.id)?.fresh || 0 })) });
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

employerRouter.post('/employer/jobs/:id/reopen', ...employer, requireVerifiedEmployer, wrap(async (req, res) => {
  const j = ownJob(req.user.id, req.params.id);
  if (j.status === 'OPEN') return res.json(serializeJob(j, loadJobSkills([j.id]).get(j.id)));
  if (j.deadline && j.deadline < new Date().toISOString().slice(0, 10)) throw conflict('The apply-by date has passed. Edit the job to set a new date first.', 'DEADLINE_PASSED');
  db.prepare("UPDATE jobs SET status = 'OPEN' WHERE id = ?").run(j.id);
  res.json(serializeJob(ownJob(req.user.id, j.id), loadJobSkills([j.id]).get(j.id)));
}));

// ---------- Candidates ----------
const STATUSES = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'];
const STATUS_MAP = {
  applied: 'APPLIED',
  submitted: 'APPLIED',
  reviewed: 'SHORTLISTED',
  shortlist: 'SHORTLISTED',
  shortlisted: 'SHORTLISTED',
  interview: 'INTERVIEW',
  interviewed: 'INTERVIEW',
  accepted: 'OFFERED',
  offer: 'OFFERED',
  offered: 'OFFERED',
  hired: 'OFFERED',
  rejected: 'REJECTED',
  reject: 'REJECTED',
  withdrawn: 'WITHDRAWN',
  withdraw: 'WITHDRAWN',
};

const normalizeStatus = (s) => {
  if (!s || typeof s !== 'string') return s;
  const upper = s.toUpperCase();
  if (STATUSES.includes(upper)) return upper;
  return STATUS_MAP[s.toLowerCase()] || s;
};

export const TRANSITIONS = {
  APPLIED: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['OFFERED', 'REJECTED'],
  OFFERED: [], WITHDRAWN: [],
  REJECTED: ['SHORTLISTED'], // a rejection can be reconsidered: the candidate goes back to the shortlist
};

employerRouter.get('/employer/jobs/:id/candidates', ...employer, wrap(async (req, res) => {
  const job = ownJob(req.user.id, req.params.id);
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  const sort = req.query.sort === 'resume' ? 'resume' : 'match';
  const rows = db.prepare(`SELECT a.id, a.status, a.match_score, a.created_at, a.resume_id, a.employer_rating, a.employer_note, p.full_name, p.college, p.degree, p.branch, p.graduation_year, p.location, a.student_id
    FROM applications a JOIN student_profiles p ON p.user_id = a.student_id WHERE a.job_id = ? ${status ? 'AND a.status = ?' : ''}`).all(...(status ? [job.id, status] : [job.id]));
  const items = rows.map((r) => {
    const an = r.resume_id ? latestAnalysis(r.resume_id) : null;
    return {
      applicationId: r.id, status: r.status, matchScore: r.match_score, appliedAt: r.created_at, rating: r.employer_rating, hasNote: !!r.employer_note,
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
    note: a.employer_note || '', rating: a.employer_rating,
    neighbours: (() => { const ids = db.prepare('SELECT id FROM applications WHERE job_id = ? ORDER BY match_score DESC, id').all(a.jid).map((r) => r.id); const i = ids.indexOf(a.id); return { prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null, position: i + 1, total: ids.length }; })(),
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
  const rawStatus = req.body?.status;
  const targetStatus = normalizeStatus(rawStatus);
  if (!STATUSES.includes(targetStatus)) {
    throw bad(`Invalid status: ${rawStatus}. Allowed: ${STATUSES.join(', ')}`);
  }
  const a = ownApplication(req.user.id, req.params.id);
  if (a.status !== targetStatus && !TRANSITIONS[a.status].includes(targetStatus)) {
    throw conflict(`Cannot move from ${a.status} to ${targetStatus}`, 'INVALID_TRANSITION');
  }
  tx(() => {
    db.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?").run(targetStatus, a.id);
    recordEvent(a.id, a.status, targetStatus, req.user.id);
  });
  const jt = db.prepare('SELECT j.title, e.company_name FROM jobs j LEFT JOIN employer_profiles e ON e.user_id = j.employer_id WHERE j.id = ?').get(a.job_id);
  notify(a.student_id, 'application_status', a.status === 'REJECTED' ? 'Application reconsidered' : `Application ${targetStatus.toLowerCase()}`, a.status === 'REJECTED' ? `${jt?.company_name || 'The employer'} is giving your application for ${jt?.title || 'a job'} a second look.` : `${jt?.company_name || 'The employer'} moved your application for ${jt?.title || 'a job'} to ${targetStatus}.`, '#/student/applications');
  res.json({ id: a.id, status: targetStatus, allowedTransitions: TRANSITIONS[targetStatus], events: eventsFor(a.id) });
}));

// Private recruiter notes and a 1-5 rating. Students never see these.
employerRouter.put('/employer/applications/:id/note', ...employer, wrap(async (req, res) => {
  const b = parse(z.object({ note: z.string().trim().max(2000).default(''), rating: z.number().int().min(1).max(5).nullable().default(null) }).strict(), req.body);
  const a = ownApplication(req.user.id, req.params.id);
  db.prepare('UPDATE applications SET employer_note = ?, employer_rating = ? WHERE id = ?').run(b.note, b.rating, a.id);
  res.json({ id: a.id, note: b.note, rating: b.rating });
}));

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
employerRouter.get('/employer/jobs/:id/candidates.csv', ...employer, wrap(async (req, res) => {
  const job = ownJob(req.user.id, req.params.id);
  const rows = db.prepare(`SELECT a.id, a.status, a.match_score, a.created_at, a.resume_id, a.employer_rating, a.employer_note, p.full_name, p.college, p.degree, p.branch, p.graduation_year, u.email
    FROM applications a JOIN student_profiles p ON p.user_id = a.student_id JOIN users u ON u.id = a.student_id WHERE a.job_id = ? ORDER BY a.match_score DESC, a.id`).all(job.id);
  const head = ['Name', 'Email', 'College', 'Degree', 'Branch', 'Graduation year', 'Status', 'Match %', 'Resume score', 'Your rating', 'Your note', 'Applied'];
  const lines = [head.map(csvCell).join(',')];
  for (const r of rows) {
    const an = r.resume_id ? latestAnalysis(r.resume_id) : null;
    lines.push([r.full_name, r.email, r.college, r.degree, r.branch, r.graduation_year, r.status, r.match_score, an?.overallScore ?? '', r.employer_rating ?? '', r.employer_note, r.created_at].map(csvCell).join(','));
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="candidates-job-${job.id}.csv"`, 'Cache-Control': 'no-store' });
  res.send(`\ufeff${lines.join('\r\n')}\r\n`);
}));

/** Applicants per day for the last `days` days (oldest first), zero-filled, in UTC. */
function dailyApplicants(employerId, days) {
  const rows = db.prepare(`SELECT date(a.created_at) AS d, COUNT(*) AS n FROM applications a JOIN jobs j ON j.id = a.job_id
    WHERE j.employer_id = ? AND date(a.created_at) >= date('now', ?) GROUP BY d`).all(employerId, `-${days - 1} days`);
  const by = new Map(rows.map((r) => [r.d, r.n]));
  return Array.from({ length: days }, (_, i) => { const d = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10); return { date: d, count: by.get(d) || 0 }; });
}

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
    funnel: Object.fromEntries(['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'].map((st) => [st, one(`SELECT COUNT(*) AS n ${base} AND a.status = ?`, req.user.id, st)])),
    daily: dailyApplicants(req.user.id, 14),
    attention: {
      waiting: one(`SELECT COUNT(*) AS n ${base} AND a.status = 'APPLIED'`, req.user.id),
      stale: one(`SELECT COUNT(*) AS n ${base} AND a.status = 'APPLIED' AND a.created_at <= datetime('now', '-3 days')`, req.user.id),
      closingSoon: db.prepare("SELECT id, title, deadline FROM jobs WHERE employer_id = ? AND status = 'OPEN' AND deadline IS NOT NULL AND deadline BETWEEN date('now') AND date('now', '+7 days') ORDER BY deadline LIMIT 5").all(req.user.id),
    },
  });
}));

// ---------- Candidate Shortlist Recommendations ----------
employerRouter.get('/employer/jobs/:id/recommendations', ...employer, wrap(async (req, res) => {
  const job = ownJob(req.user.id, req.params.id);
  const rows = db.prepare(`SELECT a.id, a.status, a.match_score, a.resume_id, a.student_id, p.full_name, p.degree, p.branch, p.college
    FROM applications a JOIN student_profiles p ON p.user_id = a.student_id WHERE a.job_id = ?`).all(job.id);

  const scored = rows.map((r) => {
    const medals = db.prepare('SELECT skill, medal FROM skill_medals WHERE user_id = ?').all(r.student_id);
    const dna = db.prepare('SELECT archetype FROM career_dna WHERE user_id = ?').get(r.student_id);
    const analysis = r.resume_id ? latestAnalysis(r.resume_id) : null;
    const resumeScore = analysis?.overallScore || 0;

    let compositeScore = r.match_score * 0.6 + resumeScore * 0.25 + (medals.length * 5);
    compositeScore = Math.min(Math.round(compositeScore), 99);

    const reasons = [];
    if (r.match_score >= 80) reasons.push(`High skill match (${r.match_score}%) for role requirements`);
    if (medals.length > 0) reasons.push(`Earned ${medals.length} verified skill medal${medals.length > 1 ? 's' : ''}`);
    if (dna) reasons.push(`Validated archetype: ${dna.archetype}`);

    return {
      applicationId: r.id,
      studentId: r.student_id,
      name: r.full_name,
      college: r.college,
      degree: r.degree,
      branch: r.branch,
      status: r.status,
      matchScore: r.match_score,
      resumeScore,
      compositeScore,
      medalsCount: medals.length,
      archetype: dna?.archetype || null,
      recommendationReason: reasons.join(' · ') || 'Potential candidate with foundational skills',
    };
  });

  scored.sort((a, b) => b.compositeScore - a.compositeScore);
  res.json({ jobId: job.id, jobTitle: job.title, recommendations: scored });
}));

// ---------- Admin ----------
export const adminRouter = Router();
const admin = [authenticate, requireRole('ADMIN')];

adminRouter.get('/admin/analytics', ...admin, wrap(async (_req, res) => {
  const one = (sql) => (db.prepare(sql).get()?.n || 0);

  const totalStudents = one("SELECT COUNT(*) AS n FROM users WHERE role = 'STUDENT'");
  const totalEmployers = one("SELECT COUNT(*) AS n FROM users WHERE role = 'EMPLOYER'");
  const totalJobs = one("SELECT COUNT(*) AS n FROM jobs");
  const openJobs = one("SELECT COUNT(*) AS n FROM jobs WHERE status = 'OPEN'");
  const verifiedJobs = one("SELECT COUNT(*) AS n FROM jobs WHERE verified_by_admin = 1");
  const totalApplications = one("SELECT COUNT(*) AS n FROM applications");
  const offeredApplications = one("SELECT COUNT(*) AS n FROM applications WHERE status = 'OFFERED'");
  const interviewedApplications = one("SELECT COUNT(*) AS n FROM applications WHERE status = 'INTERVIEW'");
  const shortlistedApplications = one("SELECT COUNT(*) AS n FROM applications WHERE status = 'SHORTLISTED'");

  const placementRate = totalApplications > 0 ? Math.round((offeredApplications / totalApplications) * 100) : 0;

  // In-demand skills across job requirements
  const inDemandSkills = db.prepare(`
    SELECT s.name, COUNT(*) as demandCount, AVG(js.weight) as avgWeight
    FROM job_skills js
    JOIN skills s ON s.id = js.skill_id
    GROUP BY js.skill_id
    ORDER BY demandCount DESC, avgWeight DESC
    LIMIT 8
  `).all();

  // Top student skills
  const topStudentSkills = db.prepare(`
    SELECT s.name, COUNT(*) as studentCount
    FROM student_skills ss
    JOIN skills s ON s.id = ss.skill_id
    GROUP BY ss.skill_id
    ORDER BY studentCount DESC
    LIMIT 8
  `).all();

  // Average application match score
  const avgMatch = Math.round(db.prepare("SELECT AVG(match_score) as avg FROM applications").get()?.avg || 0);

  res.json({
    metrics: {
      totalStudents,
      totalEmployers,
      totalJobs,
      openJobs,
      totalApplications,
      offeredApplications,
      interviewedApplications,
      shortlistedApplications,
      placementRate,
      avgMatchScore: avgMatch,
      verifiedJobs,
    },
    inDemandSkills,
    topStudentSkills,
  });
}));

adminRouter.get('/admin/analytics/summary', ...admin, wrap(async (_req, res) => {
  const one = (sql) => (db.prepare(sql).get()?.n || 0);

  const totalStudents = one("SELECT COUNT(*) AS n FROM users WHERE role = 'STUDENT'");
  const totalEmployers = one("SELECT COUNT(*) AS n FROM users WHERE role = 'EMPLOYER'");
  const totalJobs = one("SELECT COUNT(*) AS n FROM jobs");
  const openJobs = one("SELECT COUNT(*) AS n FROM jobs WHERE status = 'OPEN'");
  const verifiedJobs = one("SELECT COUNT(*) AS n FROM jobs WHERE verified_by_admin = 1");
  const totalApplications = one("SELECT COUNT(*) AS n FROM applications");
  const offeredApplications = one("SELECT COUNT(*) AS n FROM applications WHERE status = 'OFFERED'");
  const placementRate = totalApplications > 0 ? Math.round((offeredApplications / totalApplications) * 100) : 0;
  const avgMatch = Math.round(db.prepare("SELECT AVG(match_score) as avg FROM applications").get()?.avg || 0);

  res.json({
    users: totalStudents + totalEmployers,
    students: totalStudents,
    employers: totalEmployers,
    totalJobs,
    activeJobs: openJobs,
    applications: totalApplications,
    verifiedJobs,
    hired: offeredApplications,
    placementRate,
    avgMatchScore: avgMatch,
  });
}));

adminRouter.get('/admin/ai/diagnostics', ...admin, wrap(async (_req, res) => {
  const summary = providerSummary();
  res.json({
    aiMode: llmEnabled() ? 'llm+rules' : 'rules',
    configuredProviders: summary.filter((p) => p.configured).map((p) => p.name),
    allProviders: summary,
    quotaLimits: {
      chat: 20,
      interview: 10,
      resumeAnalysis: 10,
      jobDescription: 15,
      skillArena: 10,
    },
    systemTime: new Date().toISOString(),
  });
}));

adminRouter.get('/admin/jobs', ...admin, wrap(async (req, res) => {
  const rows = db.prepare(`
    SELECT j.*, ep.company_name,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as app_count
    FROM jobs j
    LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
    ORDER BY j.created_at DESC, j.id DESC
  `).all();

  const items = rows.map((r) => ({
    jobId: r.id,
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    jobType: r.type,
    location: r.location,
    remote: Boolean(r.remote),
    compensation: r.compensation,
    status: r.status === 'OPEN' ? 'active' : r.status.toLowerCase(),
    rawStatus: r.status,
    verifiedByAdmin: Boolean(r.verified_by_admin),
    employerId: r.employer_id,
    companyName: r.company_name || 'Partner Company',
    companyLogoURL: null,
    applicationCount: r.app_count || 0,
    createdAt: r.created_at,
  }));

  res.json({ items });
}));

adminRouter.patch('/admin/jobs/:id/verify', ...admin, wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(id);
  if (!job) throw notFound('Job not found');

  db.prepare('UPDATE jobs SET verified_by_admin = 1 WHERE id = ?').run(id);
  res.json({ jobId: id, verifiedByAdmin: true });
}));

adminRouter.patch('/admin/jobs/:id/status', ...admin, wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(id);
  if (!job) throw notFound('Job not found');

  const raw = String(req.body?.status || '').toLowerCase().trim();
  const target = (raw === 'active' || raw === 'open') ? 'OPEN' : 'CLOSED';

  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(target, id);
  res.json({ jobId: id, status: target === 'OPEN' ? 'active' : 'closed', rawStatus: target });
}));

adminRouter.get('/admin/users', ...admin, wrap(async (req, res) => {
  const role = req.query.role ? String(req.query.role).toUpperCase() : null;
  const status = req.query.status ? String(req.query.status).toLowerCase() : null;

  let query = `
    SELECT u.id, u.email, u.role, u.verification, u.created_at,
      sp.full_name AS student_name, sp.college, sp.degree, sp.branch,
      ep.company_name, ep.industry, ep.location AS emp_location
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN employer_profiles ep ON ep.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (role && ['STUDENT', 'EMPLOYER', 'ADMIN'].includes(role)) {
    query += ' AND u.role = ?';
    params.push(role);
  }
  if (status === 'disabled') {
    query += " AND u.verification = 'REJECTED'";
  } else if (status === 'active') {
    query += " AND u.verification != 'REJECTED'";
  }
  query += ' ORDER BY u.created_at DESC, u.id DESC LIMIT 100';

  const rows = db.prepare(query).all(...params);
  const items = rows.map((u) => {
    const isStudent = u.role === 'STUDENT';
    const isEmp = u.role === 'EMPLOYER';
    const displayName = isStudent ? u.student_name : (isEmp ? u.company_name : 'Platform Administrator');

    return {
      uid: u.id,
      id: u.id,
      email: u.email,
      role: u.role.toLowerCase(),
      rawRole: u.role,
      status: u.verification === 'REJECTED' ? 'disabled' : 'active',
      verification: u.verification,
      displayName: displayName || u.email.split('@')[0],
      college: u.college || null,
      degree: u.degree || null,
      branch: u.branch || null,
      industry: u.industry || null,
      createdAt: u.created_at,
    };
  });

  res.json({ items });
}));

adminRouter.patch('/admin/users/:id/status', ...admin, wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const user = db.prepare('SELECT id, verification FROM users WHERE id = ?').get(id);
  if (!user) throw notFound('User not found');

  const raw = String(req.body?.status || '').toLowerCase().trim();
  const newVerif = (raw === 'disabled' || raw === 'rejected') ? 'REJECTED' : 'VERIFIED';

  db.prepare('UPDATE users SET verification = ? WHERE id = ?').run(newVerif, id);
  res.json({ uid: id, status: newVerif === 'REJECTED' ? 'disabled' : 'active', verification: newVerif });
}));

adminRouter.patch('/admin/users/:id/role', ...admin, wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!user) throw notFound('User not found');

  const raw = String(req.body?.role || '').toUpperCase().trim();
  if (!['STUDENT', 'EMPLOYER', 'ADMIN'].includes(raw)) {
    throw bad('Invalid role. Allowed: STUDENT, EMPLOYER, ADMIN');
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(raw, id);
  res.json({ uid: id, role: raw.toLowerCase(), rawRole: raw });
}));

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

// ---------- Smart ranking, skill suggestions, bulk actions ----------
function attachRatings(jobId, items) {
  const by = new Map(db.prepare('SELECT id, employer_rating AS r, employer_note AS n FROM applications WHERE job_id = ?').all(jobId).map((r) => [r.id, r]));
  for (const it of items) { const x = by.get(it.applicationId); it.rating = x?.r ?? null; it.hasNote = !!x?.n; }
  return items;
}
employerRouter.get('/employer/jobs/:id/ranking', ...employer, wrap(async (req, res) => {
  const job = ownJob(req.user.id, req.params.id);
  const items = await rankCandidates(job);
  attachRatings(job.id, items);
  res.json({ job: { id: job.id, title: job.title, status: job.status }, source: 'rules', items });
}));

// Ask the AI provider to phrase the "why" for the top candidates (counts against the employer's daily AI quota).
employerRouter.post('/employer/jobs/:id/ranking/explain', ...employer, wrap(async (req, res) => {
  const job = ownJob(req.user.id, req.params.id);
  const ranked = await rankCandidates(job);
  attachRatings(job.id, ranked);
  const out = await explainTop(req.user.id, job, ranked);
  res.json({ job: { id: job.id, title: job.title, status: job.status }, ...out });
}));

employerRouter.post('/employer/skills/suggest', ...employer, wrap(async (req, res) => {
  const b = parse(z.object({ title: z.string().trim().max(160).default(''), description: z.string().trim().max(5000).default(''), exclude: z.array(z.number().int()).max(50).default([]) }), req.body);
  res.json({ items: await suggestSkills(b) });
}));

// Move many applications at once. Each one is checked against the same transition rules; the reply says what happened to each.
employerRouter.post('/employer/applications/bulk-status', ...employer, wrap(async (req, res) => {
  const b = parse(z.object({ ids: z.array(z.number().int()).min(1).max(100), status: z.string().max(30) }), req.body);
  const target = normalizeStatus(b.status);
  if (!STATUSES.includes(target)) throw bad(`Invalid status: ${b.status}`);
  const results = [];
  for (const id of b.ids) {
    try {
      const a = ownApplication(req.user.id, id);
      if (a.status === target) { results.push({ id, ok: true, status: target, unchanged: true }); continue; }
      if (!TRANSITIONS[a.status].includes(target)) { results.push({ id, ok: false, error: `Cannot move from ${a.status} to ${target}` }); continue; }
      tx(() => {
        db.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?").run(target, a.id);
        recordEvent(a.id, a.status, target, req.user.id);
      });
      const jt = db.prepare('SELECT j.title, e.company_name FROM jobs j LEFT JOIN employer_profiles e ON e.user_id = j.employer_id WHERE j.id = ?').get(a.job_id);
      notify(a.student_id, 'application_status', a.status === 'REJECTED' ? 'Application reconsidered' : `Application ${target.toLowerCase()}`, a.status === 'REJECTED' ? `${jt?.company_name || 'The employer'} is giving your application for ${jt?.title || 'a job'} a second look.` : `${jt?.company_name || 'The employer'} moved your application for ${jt?.title || 'a job'} to ${target}.`, '#/student/applications');
      results.push({ id, ok: true, status: target });
    } catch (e) { results.push({ id, ok: false, error: e.message }); }
  }
  res.json({ results, changed: results.filter((r) => r.ok && !r.unchanged).length, failed: results.filter((r) => !r.ok).length });
}));
