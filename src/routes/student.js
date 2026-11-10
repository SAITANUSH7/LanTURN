import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { z } from 'zod';
import { db, tx, parseJson } from '../db.js';
import { config } from '../config.js';
import { HttpError, bad, notFound, parse, wrap } from '../util.js';
import { authenticate, requireRole } from '../auth.js';
import { analyzeResume, buildRoadmap, checkQuota } from '../ai/index.js';
import { skillGap } from '../ai/scoring.js';
import { idParam, studentSkills, studentContext, loadJobSkills, latestAnalysis } from './common.js';

export const studentRouter = Router();
const student = [authenticate, requireRole('STUDENT')];

// ---------- Profile ----------
const TYPES = ['INTERNSHIP', 'FULL_TIME', 'PART_TIME', 'CONTRACT'];
const ProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  college: z.string().trim().max(160).default(''),
  degree: z.string().trim().max(80).default(''),
  branch: z.string().trim().max(80).default(''),
  graduationYear: z.number().int().min(2000).max(2100).nullable().optional(),
  location: z.string().trim().max(120).default(''),
  bio: z.string().trim().max(1000).default(''),
  preferredTypes: z.array(z.enum(TYPES)).max(4).default([]),
  preferredLocations: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
}).strict();

const profileOut = (p) => ({
  fullName: p.full_name, college: p.college, degree: p.degree, branch: p.branch,
  graduationYear: p.graduation_year, location: p.location, bio: p.bio,
  preferredTypes: parseJson(p.preferred_types, []), preferredLocations: parseJson(p.preferred_locations, []),
});

studentRouter.get('/students/me/profile', ...student, wrap(async (req, res) => {
  res.json(profileOut(db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(req.user.id)));
}));

studentRouter.put('/students/me/profile', ...student, wrap(async (req, res) => {
  const b = parse(ProfileSchema, req.body);
  db.prepare(`UPDATE student_profiles SET full_name=?, college=?, degree=?, branch=?, graduation_year=?, location=?, bio=?, preferred_types=?, preferred_locations=? WHERE user_id=?`)
    .run(b.fullName, b.college, b.degree, b.branch, b.graduationYear ?? null, b.location, b.bio, JSON.stringify(b.preferredTypes), JSON.stringify(b.preferredLocations), req.user.id);
  res.json(profileOut(db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(req.user.id)));
}));

// ---------- Skills ----------
studentRouter.get('/students/me/skills', ...student, wrap(async (req, res) => {
  res.json({ items: studentSkills(req.user.id) });
}));

studentRouter.put('/students/me/skills', ...student, wrap(async (req, res) => {
  const { skillIds } = parse(z.object({ skillIds: z.array(z.number().int().positive()).max(100) }).strict(), req.body);
  const valid = skillIds.length
    ? db.prepare(`SELECT id FROM skills WHERE id IN (${skillIds.map(() => '?').join(',')})`).all(...skillIds).map((r) => r.id)
    : [];
  tx(() => {
    if (valid.length) db.prepare(`DELETE FROM student_skills WHERE user_id = ? AND skill_id NOT IN (${valid.map(() => '?').join(',')})`).run(req.user.id, ...valid);
    else db.prepare('DELETE FROM student_skills WHERE user_id = ?').run(req.user.id);
    const ins = db.prepare("INSERT OR IGNORE INTO student_skills (user_id, skill_id, source) VALUES (?,?,'MANUAL')");
    for (const id of valid) ins.run(req.user.id, id);
  });
  res.json({ items: studentSkills(req.user.id) });
}));

// ---------- Taxonomy (any signed-in user) ----------
studentRouter.get('/skills', authenticate, wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const rows = q
    ? db.prepare("SELECT DISTINCT s.id, s.name, s.category FROM skills s LEFT JOIN skill_aliases a ON a.skill_id = s.id WHERE lower(s.name) LIKE ? OR a.alias LIKE ? ORDER BY s.name LIMIT 30").all(`%${q}%`, `%${q}%`)
    : db.prepare('SELECT id, name, category FROM skills ORDER BY category, name').all();
  res.json({ items: rows });
}));

studentRouter.get('/roles', authenticate, wrap(async (_req, res) => {
  res.json({ items: db.prepare('SELECT id, slug, title, description FROM roles ORDER BY title').all() });
}));

studentRouter.get('/roles/:id', authenticate, wrap(async (req, res) => {
  const r = db.prepare('SELECT id, slug, title, description FROM roles WHERE id = ?').get(idParam(req.params.id));
  if (!r) throw notFound('Role not found');
  r.skills = db.prepare('SELECT s.id AS skillId, s.name, rs.weight FROM role_skills rs JOIN skills s ON s.id = rs.skill_id WHERE rs.role_id = ? ORDER BY rs.weight DESC, s.name').all(r.id);
  res.json(r);
}));

// ---------- Resumes ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

const resumeOut = (r) => ({
  id: r.id, filename: r.filename, sizeBytes: r.size_bytes, pageCount: r.page_count, createdAt: r.created_at,
  hasFile: !!r.file_key, analysis: latestAnalysis(r.id),
});

function ownedResume(userId, id) {
  const r = db.prepare('SELECT * FROM resumes WHERE id = ? AND student_id = ?').get(idParam(id), userId);
  if (!r) throw notFound('Resume not found');
  return r;
}

/** Run an analysis and persist it, also merging recognised skills into the profile. */
async function runAnalysis(userId, resume) {
  checkQuota(userId, 'resume_analysis');
  try {
    const out = await analyzeResume(resume.extracted_text);
    tx(() => {
      db.prepare(`INSERT INTO resume_analyses (resume_id, status, overall_score, deterministic_score, ai_score, breakdown, extracted_skills, strengths, improvements, summary, source)
        VALUES (?, 'COMPLETED', ?,?,?,?,?,?,?,?,?)`)
        .run(resume.id, out.overall, out.deterministic, out.ai, JSON.stringify(out.breakdown), JSON.stringify({ mapped: out.skills.mapped.map((s) => s.name), unmapped: out.skills.unmapped }), JSON.stringify(out.strengths), JSON.stringify(out.improvements), out.summary, out.source);
      const ins = db.prepare("INSERT OR IGNORE INTO student_skills (user_id, skill_id, source) VALUES (?,?,'RESUME')");
      for (const s of out.skills.mapped) ins.run(userId, s.id);
    });
  } catch (e) {
    console.error('Resume analysis failed:', e.message);
    db.prepare("INSERT INTO resume_analyses (resume_id, status, error) VALUES (?, 'FAILED', ?)").run(resume.id, 'ANALYSIS_FAILED');
  }
}

studentRouter.post('/resumes', ...student, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw bad('file: a PDF is required');
  const consent = req.body?.consent === 'true';
  if (!req.user.consent_at && !consent) throw new HttpError(400, 'CONSENT_REQUIRED', 'Please confirm that your resume text may be processed to analyse it');
  const buf = req.file.buffer;
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only PDF files are supported');
  let parsed;
  try {
    // pdf-parse reads the whole backing ArrayBuffer, so hand it a standalone copy (Node pools small Buffers).
    parsed = await pdfParse(new Uint8Array(buf));
  } catch (e) {
    console.warn('pdf parse error:', e?.message);
    throw new HttpError(422, 'UNREADABLE_PDF', 'This PDF could not be read. It may be encrypted or damaged.');
  }
  const text = (parsed.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (parsed.numpages > 10) throw new HttpError(422, 'UNREADABLE_PDF', 'Resumes longer than 10 pages are not supported');
  if (text.length < 200) throw new HttpError(422, 'UNREADABLE_PDF', 'We could not find enough text. Upload a text-based PDF, not a scan or image.');
  const key = `${crypto.randomUUID()}.pdf`;
  fs.writeFileSync(path.join(config.uploadDir, key), buf, { mode: 0o600 });
  if (!req.user.consent_at) db.prepare("UPDATE users SET consent_at = datetime('now') WHERE id = ?").run(req.user.id);
  const filename = path.basename(req.file.originalname || 'resume.pdf').slice(0, 120);
  const id = Number(db.prepare('INSERT INTO resumes (student_id, filename, file_key, size_bytes, page_count, extracted_text) VALUES (?,?,?,?,?,?)').run(req.user.id, filename, key, buf.length, parsed.numpages || 1, text).lastInsertRowid);
  await runAnalysis(req.user.id, db.prepare('SELECT * FROM resumes WHERE id = ?').get(id));
  res.status(201).json(resumeOut(db.prepare('SELECT * FROM resumes WHERE id = ?').get(id)));
}));

studentRouter.get('/resumes', ...student, wrap(async (req, res) => {
  const rows = db.prepare('SELECT * FROM resumes WHERE student_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ items: rows.map(resumeOut) });
}));

studentRouter.get('/resumes/:id', ...student, wrap(async (req, res) => {
  res.json({ ...resumeOut(ownedResume(req.user.id, req.params.id)), text: ownedResume(req.user.id, req.params.id).extracted_text });
}));

studentRouter.post('/resumes/:id/analyze', ...student, wrap(async (req, res) => {
  const r = ownedResume(req.user.id, req.params.id);
  await runAnalysis(req.user.id, r);
  res.json(resumeOut(r));
}));

studentRouter.delete('/resumes/:id', ...student, wrap(async (req, res) => {
  const r = ownedResume(req.user.id, req.params.id);
  if (r.file_key) fs.rmSync(path.join(config.uploadDir, r.file_key), { force: true });
  db.prepare('DELETE FROM resumes WHERE id = ?').run(r.id);
  res.json({ ok: true });
}));

// Owner, or an employer who received an application using this resume, may download the PDF.
studentRouter.get('/resumes/:id/file', authenticate, wrap(async (req, res) => {
  const r = db.prepare('SELECT * FROM resumes WHERE id = ?').get(idParam(req.params.id));
  if (!r || !r.file_key) throw notFound('Resume file not found');
  let allowed = req.user.role === 'STUDENT' && r.student_id === req.user.id;
  if (!allowed && req.user.role === 'EMPLOYER') {
    allowed = !!db.prepare('SELECT 1 FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.resume_id = ? AND j.employer_id = ?').get(r.id, req.user.id);
  }
  if (!allowed) throw notFound('Resume file not found');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${r.filename.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(path.join(config.uploadDir, r.file_key)).pipe(res);
}));

// ---------- Career: skill gap and roadmap ----------
const TargetSchema = z.object({ roleId: z.number().int().positive().optional(), jobId: z.number().int().positive().optional() })
  .strict()
  .refine((v) => Boolean(v.roleId) !== Boolean(v.jobId), { message: 'Provide exactly one of roleId or jobId' });

function resolveTarget(body) {
  const t = parse(TargetSchema, body);
  if (t.roleId) {
    const r = db.prepare('SELECT id, title FROM roles WHERE id = ?').get(t.roleId);
    if (!r) throw notFound('Role not found');
    const required = db.prepare('SELECT rs.skill_id, rs.weight, s.name, s.category FROM role_skills rs JOIN skills s ON s.id = rs.skill_id WHERE rs.role_id = ?').all(r.id);
    return { type: 'ROLE', id: r.id, title: r.title, required };
  }
  const j = db.prepare("SELECT id, title FROM jobs WHERE id = ? AND status = 'OPEN'").get(t.jobId);
  if (!j) throw notFound('Job not found');
  return { type: 'JOB', id: j.id, title: j.title, required: loadJobSkills([j.id]).get(j.id) };
}

const gapOut = (target, gap, count) => ({ target: { type: target.type, id: target.id, title: target.title }, matchPercent: gap.matchPercent, matched: gap.matched, missing: gap.missing, studentSkillCount: count });

studentRouter.post('/career/skill-gap', ...student, wrap(async (req, res) => {
  const target = resolveTarget(req.body);
  const ctx = studentContext(req.user.id);
  res.json(gapOut(target, skillGap(target.required, ctx.skillIds), ctx.skills.length));
}));

const roadmapOut = (r) => ({ id: r.id, target: { type: r.target_type, id: r.target_id, title: r.target_title }, gap: parseJson(r.gap), plan: parseJson(r.plan), source: r.source, createdAt: r.created_at });

studentRouter.post('/career/roadmaps', ...student, wrap(async (req, res) => {
  const target = resolveTarget(req.body);
  const ctx = studentContext(req.user.id);
  const gap = skillGap(target.required, ctx.skillIds);
  checkQuota(req.user.id, 'roadmap');
  const { plan, source } = await buildRoadmap(target.title, ctx.skills.map((s) => s.name), gap);
  const id = Number(db.prepare('INSERT INTO roadmaps (student_id, target_type, target_id, target_title, gap, plan, source) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.id, target.type, target.id, target.title, JSON.stringify(gapOut(target, gap, ctx.skills.length)), JSON.stringify(plan), source).lastInsertRowid);
  res.status(201).json(roadmapOut(db.prepare('SELECT * FROM roadmaps WHERE id = ?').get(id)));
}));

studentRouter.get('/career/roadmaps/latest', ...student, wrap(async (req, res) => {
  const r = db.prepare('SELECT * FROM roadmaps WHERE student_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
  res.json(r ? roadmapOut(r) : null);
}));

studentRouter.get('/career/roadmaps/:id', ...student, wrap(async (req, res) => {
  const r = db.prepare('SELECT * FROM roadmaps WHERE id = ? AND student_id = ?').get(idParam(req.params.id), req.user.id);
  if (!r) throw notFound('Roadmap not found');
  res.json(roadmapOut(r));
}));
