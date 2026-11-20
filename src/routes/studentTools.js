import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { bad, notFound, parse, wrap } from '../util.js';
import { ResumeDraft, atsCheck, toText, toHtml } from '../ai/studentTools.js';
import { studentSkills, loadJobSkills } from './common.js';
import { recordAction, streakFor } from '../streak.js';

export const studentToolsRouter = Router();
const student = [authenticate, requireRole('STUDENT')];

db.exec(`CREATE TABLE IF NOT EXISTS resume_drafts (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));`);

const loadDraft = (uid) => {
  const r = db.prepare('SELECT data FROM resume_drafts WHERE user_id = ?').get(uid);
  if (r) return ResumeDraft.parse(JSON.parse(r.data));
  // First visit: start from what the profile already knows.
  const p = db.prepare('SELECT p.full_name, p.college, p.degree, p.branch, p.graduation_year, u.email FROM student_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?').get(uid) || {};
  return ResumeDraft.parse({ name: p.full_name || '', email: p.email || '', skills: studentSkills(uid).map((s) => s.name).slice(0, 40),
    education: p.college ? [{ school: p.college, degree: [p.degree, p.branch].filter(Boolean).join(' in '), years: p.graduation_year ? `Expected ${p.graduation_year}` : '' }] : [] });
};

function jobContext(jobId) {
  const j = db.prepare("SELECT id, title, description FROM jobs WHERE id = ? AND status = 'OPEN'").get(jobId);
  if (!j) throw notFound('Job not found');
  const skills = (loadJobSkills([j.id]).get(j.id) || []).map((s) => s.name);
  return { job: j, skills, title: j.title, text: `${j.title}\n${j.description}\n${skills.join(', ')}` };
}

studentToolsRouter.get('/student/builder', ...student, wrap(async (req, res) => { res.json(loadDraft(req.user.id)); }));
studentToolsRouter.put('/student/builder', ...student, wrap(async (req, res) => {
  const d = parse(ResumeDraft, req.body);
  db.prepare("INSERT INTO resume_drafts (user_id, data, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").run(req.user.id, JSON.stringify(d));
  res.json(d);
}));
studentToolsRouter.post('/student/builder/check', ...student, wrap(async (req, res) => {
  const b = parse(z.object({ jobId: z.number().int().positive().optional() }), req.body || {});
  const d = loadDraft(req.user.id);
  const out = atsCheck(d, b.jobId ? jobContext(b.jobId).text : '');
  recordAction(req.user.id, 'ats_check');
  res.json(out);
}));
studentToolsRouter.get('/student/builder/export', ...student, wrap(async (req, res) => {
  const d = loadDraft(req.user.id);
  if (!d.name.trim()) throw bad('Add your name before exporting');
  res.json({ html: toHtml(d), text: toText(d) });
}));

// ---- Today: streak and the single next step ----
studentToolsRouter.get('/student/today', ...student, wrap(async (req, res) => {
  const uid = req.user.id;
  const n = (sql) => db.prepare(sql).get(uid).n;
  const resumes = n('SELECT COUNT(*) n FROM resumes WHERE student_id = ?');
  const skills = n('SELECT COUNT(*) n FROM student_skills WHERE user_id = ?');
  const checked = n("SELECT COUNT(*) n FROM daily_actions WHERE user_id = ? AND kind = 'ats_check'");
  const applied = n('SELECT COUNT(*) n FROM applications WHERE student_id = ?');
  const recentInterview = n("SELECT COUNT(*) n FROM mock_interviews WHERE student_id = ? AND created_at >= datetime('now','-7 days')");
  const steps = [
    [!resumes, 'Upload your resume', 'It unlocks your skills, direction and job matches.', '#/student/resume'],
    [skills < 5, 'Add at least 5 skills', 'Matching works from your skills.', '#/student/profile'],
    [!checked, 'Run the ATS check on your resume', 'Find out what a screening tool would flag.', '#/student/builder'],
    [!applied, 'Apply to one job today', 'Pick a job with a high match and apply.', '#/student/jobs'],
    [!recentInterview, 'Do a 5-question mock interview', 'Practice answers before the real thing.', '#/student/coach'],
  ].find((s) => s[0]);
  const next = steps ? { title: steps[1], why: steps[2], link: steps[3] } : { title: 'Learn the next topic on your roadmap', why: 'Small daily progress compounds.', link: '#/student/roadmap' };
  res.json({ streak: streakFor(uid), next });
}));
