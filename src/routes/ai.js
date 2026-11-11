import { Router } from 'express';
import { z } from 'zod';
import { db, tx, parseJson } from '../db.js';
import { HttpError, bad, notFound, parse, wrap } from '../util.js';
import { authenticate, requireRole } from '../auth.js';
import { checkQuota } from '../ai/index.js';
import { providerSummary, llmEnabled, PRESETS, resolveProvider, sealKey, testProvider, listModels, recentCalls } from '../ai/providers.js';
import * as F from '../ai/features.js';
import { skillGap } from '../ai/scoring.js';
import { idParam, studentContext, loadJobSkills, JOB_SELECT, latestAnalysis } from './common.js';

export const aiRouter = Router();
const student = [authenticate, requireRole('STUDENT')];
const employer = [authenticate, requireRole('EMPLOYER')];
const anyone = [authenticate];

aiRouter.get('/ai/status', ...anyone, wrap(async (_req, res) => {
  res.json({ enabled: llmEnabled(), providers: providerSummary() });
}));

// ---------- Notifications ----------
const notifOut = (n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: !!n.read_at, createdAt: n.created_at });
aiRouter.get('/notifications', ...anyone, wrap(async (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n;
  res.json({ unread, items: rows.map(notifOut) });
}));
aiRouter.get('/notifications/unread-count', ...anyone, wrap(async (req, res) => {
  res.json({ unread: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n });
}));
aiRouter.post('/notifications/read-all', ...anyone, wrap(async (req, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id);
  res.json({ unread: 0 });
}));
aiRouter.post('/notifications/:id/read', ...anyone, wrap(async (req, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?").run(idParam(req.params.id), req.user.id);
  res.json({ ok: true });
}));

// ---------- Student: Career DNA ----------
function dnaContext(userId) {
  const ctx = studentContext(userId);
  const r = db.prepare('SELECT id FROM resumes WHERE student_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  const an = r ? latestAnalysis(r.id) : null;
  return {
    skills: ctx.skills.map((s) => ({ name: s.name, category: s.category })),
    resumeScore: an?.deterministicScore ?? null,
    applications: db.prepare('SELECT COUNT(*) AS n FROM applications WHERE student_id = ?').get(userId).n,
    medals: db.prepare('SELECT skill, medal FROM skill_medals WHERE user_id = ?').all(userId),
  };
}
const dnaOut = (r) => r && ({ archetype: r.archetype, summary: r.summary, strengths: parseJson(r.strengths, []), dimensions: parseJson(r.dimensions, []), source: r.source, updatedAt: r.updated_at });

aiRouter.get('/career/dna', ...student, wrap(async (req, res) => {
  res.json(dnaOut(db.prepare('SELECT * FROM career_dna WHERE user_id = ?').get(req.user.id)));
}));
aiRouter.post('/career/dna', ...student, wrap(async (req, res) => {
  const c = dnaContext(req.user.id);
  if (!c.skills.length) throw bad('Add at least one skill on your profile first');
  checkQuota(req.user.id, 'dna');
  const d = await F.careerDna(c);
  db.prepare(`INSERT INTO career_dna (user_id, archetype, summary, dimensions, strengths, source, updated_at) VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET archetype=excluded.archetype, summary=excluded.summary, dimensions=excluded.dimensions, strengths=excluded.strengths, source=excluded.source, updated_at=excluded.updated_at`)
    .run(req.user.id, d.archetype, d.summary, JSON.stringify(d.dimensions), JSON.stringify(d.strengths || []), d.source);
  res.status(201).json(dnaOut(db.prepare('SELECT * FROM career_dna WHERE user_id = ?').get(req.user.id)));
}));

// ---------- Student: Skill Arena ----------
const testOut = (t) => ({ id: t.id, skill: t.skill, tier: t.tier, status: t.status, source: t.source, questions: parseJson(t.questions, []).map((q) => ({ q: q.q })) });
const medalOut = (m) => ({ id: m.id, skill: m.skill, medal: m.medal, correct: m.correct, feedback: parseJson(m.feedback, []), source: m.source, createdAt: m.created_at });

aiRouter.get('/arena/medals', ...student, wrap(async (req, res) => {
  res.json(db.prepare('SELECT * FROM skill_medals WHERE user_id = ? ORDER BY id DESC').all(req.user.id).map(medalOut));
}));
aiRouter.post('/arena/tests', ...student, wrap(async (req, res) => {
  const b = parse(z.object({ skill: z.string().trim().min(1).max(60), selfRating: z.number().int().min(1).max(3) }).strict(), req.body);
  checkQuota(req.user.id, 'arena');
  const g = await F.generateSkillTest(b.skill, b.selfRating);
  const id = Number(db.prepare('INSERT INTO skill_tests (user_id, skill, tier, questions, source) VALUES (?,?,?,?,?)').run(req.user.id, b.skill, b.selfRating, JSON.stringify(g.questions), g.source).lastInsertRowid);
  res.status(201).json(testOut(db.prepare('SELECT * FROM skill_tests WHERE id = ?').get(id)));
}));
aiRouter.post('/arena/tests/:id/submit', ...student, wrap(async (req, res) => {
  const b = parse(z.object({ answers: z.array(z.string().max(2000)).length(3) }).strict(), req.body);
  const t = db.prepare('SELECT * FROM skill_tests WHERE id = ? AND user_id = ?').get(idParam(req.params.id), req.user.id);
  if (!t) throw notFound('Test not found');
  if (t.status !== 'OPEN') throw new HttpError(409, 'ALREADY_SUBMITTED', 'This test was already submitted');
  checkQuota(req.user.id, 'arena');
  const ev = await F.evaluateSkillTest(t.skill, t.tier, parseJson(t.questions, []), b.answers);
  const correct = ev.results.filter((r) => r.correct).length;
  const medal = F.medalFor(t.tier, correct);
  const id = tx(() => {
    db.prepare("UPDATE skill_tests SET status = 'DONE' WHERE id = ?").run(t.id);
    return Number(db.prepare('INSERT INTO skill_medals (user_id, test_id, skill, medal, correct, feedback, source) VALUES (?,?,?,?,?,?,?)')
      .run(req.user.id, t.id, t.skill, medal, correct, JSON.stringify(ev.results.map((r) => r.feedback)), ev.source).lastInsertRowid);
  });
  res.status(201).json(medalOut(db.prepare('SELECT * FROM skill_medals WHERE id = ?').get(id)));
}));

// ---------- Student: cover letter + interview prep ----------
function jobFor(userId, jobId) {
  const row = db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(idParam(jobId));
  if (!row) throw notFound('Job not found');
  const skills = loadJobSkills([row.id]).get(row.id);
  const ctx = studentContext(userId);
  return { row, skills, gap: skillGap(skills, ctx.skillIds), ctx };
}
aiRouter.post('/jobs/:id/cover-letter', ...student, wrap(async (req, res) => {
  const { row, gap } = jobFor(req.user.id, req.params.id);
  const p = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(req.user.id);
  checkQuota(req.user.id, 'cover');
  const out = await F.coverLetter({ name: p.full_name, degree: p.degree, college: p.college, jobTitle: row.title, company: row.company_name || '', matched: gap.matched.map((m) => m.skill), missing: gap.missing.map((m) => m.skill) });
  res.json({ letter: out.letter, source: out.source });
}));
aiRouter.post('/jobs/:id/interview-prep', ...student, wrap(async (req, res) => {
  const { row, skills } = jobFor(req.user.id, req.params.id);
  checkQuota(req.user.id, 'interview');
  const out = await F.interviewPrep({ title: row.title, skills: skills.map((s) => s.name) });
  res.json({ questions: out.questions, source: out.source });
}));

// ---------- Chat threads (student coach + employer assistant) ----------
function chatContext(user) {
  if (user.role === 'STUDENT') {
    const c = dnaContext(user.id);
    const p = db.prepare('SELECT full_name, degree, branch, graduation_year FROM student_profiles WHERE user_id = ?').get(user.id);
    const roleGaps = db.prepare('SELECT r.title, rs.skill_id, s.name, rs.weight FROM roles r JOIN role_skills rs ON rs.role_id = r.id JOIN skills s ON s.id = rs.skill_id').all();
    const have = studentContext(user.id).skillIds;
    const miss = new Map();
    for (const r of roleGaps) if (!have.has(r.skill_id)) miss.set(r.name, (miss.get(r.name) || 0) + r.weight);
    return { name: p?.full_name, degree: p?.degree, branch: p?.branch, graduationYear: p?.graduation_year, skills: c.skills.map((s) => s.name), resumeScore: c.resumeScore, applications: c.applications, topMissing: [...miss.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0]) };
  }
  // Employer: aggregated applicant summaries. No emails, phones or resume text.
  const jobs = db.prepare("SELECT id, title, status, type FROM jobs WHERE employer_id = ? ORDER BY id DESC LIMIT 15").all(user.id);
  const cands = db.prepare(`SELECT p.full_name AS name, j.title AS job, a.match_score AS matchScore, a.status FROM applications a JOIN jobs j ON j.id = a.job_id
    JOIN student_profiles p ON p.user_id = a.student_id WHERE j.employer_id = ? ORDER BY a.match_score DESC LIMIT 25`).all(user.id);
  return { jobs, candidates: cands };
}
function myThread(user, id) {
  const t = db.prepare('SELECT * FROM chat_threads WHERE id = ? AND user_id = ?').get(idParam(id), user.id);
  if (!t) throw notFound('Conversation not found');
  return t;
}
const scopeOf = (u) => (u.role === 'EMPLOYER' ? 'employer' : 'student');
const chatRoles = [authenticate, requireRole('STUDENT', 'EMPLOYER')];

aiRouter.get('/chat/threads', ...chatRoles, wrap(async (req, res) => {
  const rows = db.prepare('SELECT id, title, updated_at FROM chat_threads WHERE user_id = ? AND scope = ? ORDER BY updated_at DESC, id DESC LIMIT 50').all(req.user.id, scopeOf(req.user));
  res.json(rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at })));
}));
aiRouter.get('/chat/threads/:id', ...chatRoles, wrap(async (req, res) => {
  const t = myThread(req.user, req.params.id);
  res.json({ id: t.id, title: t.title, messages: db.prepare('SELECT id, role, content, source, created_at FROM chat_messages WHERE thread_id = ? ORDER BY id').all(t.id).map((m) => ({ id: m.id, role: m.role, content: m.content, source: m.source, createdAt: m.created_at })) });
}));
aiRouter.delete('/chat/threads/:id', ...chatRoles, wrap(async (req, res) => {
  const t = myThread(req.user, req.params.id);
  db.prepare('DELETE FROM chat_threads WHERE id = ?').run(t.id);
  res.status(204).end();
}));
aiRouter.post('/chat/messages', ...chatRoles, wrap(async (req, res) => {
  const b = parse(z.object({ threadId: z.number().int().positive().optional(), message: z.string().trim().min(1).max(1000) }).strict(), req.body);
  checkQuota(req.user.id, 'chat');
  const scope = scopeOf(req.user);
  let t;
  if (b.threadId) t = myThread(req.user, b.threadId);
  else {
    const id = Number(db.prepare('INSERT INTO chat_threads (user_id, scope, title) VALUES (?,?,?)').run(req.user.id, scope, b.message.slice(0, 60)).lastInsertRowid);
    t = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(id);
  }
  db.prepare("INSERT INTO chat_messages (thread_id, role, content) VALUES (?, 'user', ?)").run(t.id, b.message);
  const history = db.prepare('SELECT role, content FROM chat_messages WHERE thread_id = ? ORDER BY id').all(t.id);
  const reply = await F.chatReply(scope, chatContext(req.user), history);
  db.prepare("INSERT INTO chat_messages (thread_id, role, content, source) VALUES (?, 'assistant', ?, ?)").run(t.id, reply.text, reply.source);
  db.prepare("UPDATE chat_threads SET updated_at = datetime('now') WHERE id = ?").run(t.id);
  res.status(201).json({ threadId: t.id, reply: { role: 'assistant', content: reply.text, source: reply.source } });
}));

// ---------- Employer: JD writer + Company DNA ----------
aiRouter.post('/employer/ai/job-description', ...employer, wrap(async (req, res) => {
  const b = parse(z.object({ title: z.string().trim().min(2).max(120), type: z.enum(['INTERNSHIP', 'FULL_TIME', 'PART_TIME', 'CONTRACT']).default('FULL_TIME'), location: z.string().trim().max(120).default(''), skills: z.array(z.string().trim().min(1).max(60)).max(15).default([]) }).strict(), req.body);
  const co = db.prepare('SELECT company_name, industry FROM employer_profiles WHERE user_id = ?').get(req.user.id);
  checkQuota(req.user.id, 'jd');
  const out = await F.jobDescription({ ...b, company: co?.company_name || '', industry: co?.industry || '' });
  res.json(out);
}));
const cdnaOut = (r) => r && ({ personality: r.personality, summary: r.summary, dimensions: parseJson(r.dimensions, []), source: r.source, updatedAt: r.updated_at });
aiRouter.get('/employer/ai/company-dna', ...employer, wrap(async (req, res) => {
  res.json(cdnaOut(db.prepare('SELECT * FROM company_dna WHERE user_id = ?').get(req.user.id)));
}));
aiRouter.post('/employer/ai/company-dna', ...employer, wrap(async (req, res) => {
  const jobs = db.prepare('SELECT id, title, status, type FROM jobs WHERE employer_id = ?').all(req.user.id);
  const sk = loadJobSkills(jobs.map((j) => j.id));
  const co = db.prepare('SELECT company_name, industry, size, description FROM employer_profiles WHERE user_id = ?').get(req.user.id);
  checkQuota(req.user.id, 'cdna');
  const d = await F.companyDna({ company: co, jobs: jobs.map((j) => ({ title: j.title, status: j.status, type: j.type, skills: sk.get(j.id).map((s) => ({ name: s.name, category: s.category })) })) });
  db.prepare(`INSERT INTO company_dna (user_id, personality, summary, dimensions, source, updated_at) VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET personality=excluded.personality, summary=excluded.summary, dimensions=excluded.dimensions, source=excluded.source, updated_at=excluded.updated_at`)
    .run(req.user.id, d.personality, d.summary, JSON.stringify(d.dimensions), d.source);
  res.status(201).json(cdnaOut(db.prepare('SELECT * FROM company_dna WHERE user_id = ?').get(req.user.id)));
}));

// ---------- Admin: provider keys managed from the web UI ----------
const admin = [authenticate, requireRole('ADMIN')];
const mask = (k) => (k ? `••••${k.slice(-4)}` : '');
function providerRow(name) {
  const r = resolveProvider(name, { ignoreDisabled: true });
  const row = db.prepare('SELECT enabled, model, base_url FROM ai_settings WHERE provider = ?').get(name);
  const p = PRESETS[name];
  return { name, label: p.label, configured: !!r, origin: r ? r.origin : null, keyHint: r ? mask(r.key) : '', model: r ? r.model : p.model, baseUrl: r ? r.baseUrl : p.baseUrl, enabled: row ? !!row.enabled : true, customModel: !!row?.model, editableUrl: name === 'custom' || !!row?.base_url };
}
aiRouter.get('/admin/ai', ...admin, wrap(async (_req, res) => {
  res.json({ providers: Object.keys(PRESETS).map(providerRow), active: providerSummary() });
}));
aiRouter.put('/admin/ai/:name', ...admin, wrap(async (req, res) => {
  const name = String(req.params.name);
  if (!PRESETS[name]) throw notFound('Unknown provider');
  const b = parse(z.object({
    apiKey: z.string().trim().max(500).optional(),
    model: z.string().trim().max(500).optional(),
    baseUrl: z.string().trim().max(300).refine((v) => !v || /^https?:\/\//i.test(v), 'Must start with http:// or https://').optional(),
    enabled: z.boolean().optional(),
  }).strict(), req.body);
  const cur = db.prepare('SELECT * FROM ai_settings WHERE provider = ?').get(name);
  const next = {
    key: b.apiKey === undefined ? cur?.api_key_enc || '' : sealKey(b.apiKey), // omit = keep, '' = clear
    model: b.model ?? cur?.model ?? '',
    base: b.baseUrl ?? cur?.base_url ?? '',
    enabled: b.enabled === undefined ? (cur ? cur.enabled : 1) : (b.enabled ? 1 : 0),
  };
  db.prepare(`INSERT INTO ai_settings (provider, api_key_enc, model, base_url, enabled, updated_at) VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET api_key_enc=excluded.api_key_enc, model=excluded.model, base_url=excluded.base_url, enabled=excluded.enabled, updated_at=excluded.updated_at`)
    .run(name, next.key, next.model, next.base, next.enabled);
  res.json(providerRow(name));
}));
aiRouter.delete('/admin/ai/:name', ...admin, wrap(async (req, res) => {
  db.prepare('DELETE FROM ai_settings WHERE provider = ?').run(String(req.params.name));
  res.json(providerRow(String(req.params.name)));
}));
aiRouter.post('/admin/ai/:name/test', ...admin, wrap(async (req, res) => {
  if (!PRESETS[req.params.name]) throw notFound('Unknown provider');
  const b = parse(z.object({ model: z.string().trim().max(200).optional() }).strict(), req.body || {});
  res.json(await testProvider(req.params.name, b.model));
}));
aiRouter.get('/admin/ai/logs', ...admin, wrap(async (_req, res) => { res.json({ items: recentCalls().slice(0, 40) }); }));
// Try several models at once (short timeout) so the admin can see which ones this key can really call.
aiRouter.post('/admin/ai/:name/probe', ...admin, wrap(async (req, res) => {
  if (!PRESETS[req.params.name]) throw notFound('Unknown provider');
  const b = parse(z.object({ models: z.array(z.string().trim().min(1).max(200)).min(1).max(8) }).strict(), req.body);
  const results = await Promise.all(b.models.map((m) => testProvider(req.params.name, m, 20000)));
  res.json({ results: results.map((r, i) => ({ model: b.models[i], ok: r.ok, ms: r.ms || 0, error: r.ok ? '' : r.error })) });
}));
aiRouter.get('/admin/ai/:name/models', ...admin, wrap(async (req, res) => {
  if (!PRESETS[req.params.name]) throw notFound('Unknown provider');
  res.json(await listModels(req.params.name));
}));
