import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { HttpError, bad, notFound, parse, wrap } from '../util.js';
import { authenticate, requireRole } from '../auth.js';
import { CAREER_DOMAINS } from '../data/careerRoadmaps.js';
import { config } from '../config.js';

export const careerRoadmapsRouter = Router();
const student = [authenticate, requireRole('STUDENT')];
const anyone = [authenticate];

// Pre-index domains for O(1) lookup
const domainMap = new Map(CAREER_DOMAINS.map((d) => [d.id, d]));

// Helper to calculate total topics in a domain
function countDomainTopics(domain) {
  return domain.stages.reduce((acc, stage) => acc + (stage.topics?.length || 0), 0);
}

// ── GET /roadmaps/domains — list all available career domains
careerRoadmapsRouter.get('/roadmaps/domains', ...anyone, wrap(async (_req, res) => {
  const domains = CAREER_DOMAINS.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    icon: d.icon,
    color: d.color,
    gradient: d.gradient,
    description: d.description,
    estimatedMonths: d.estimatedMonths,
    stagesCount: d.stages.length,
    topicsCount: countDomainTopics(d),
  }));
  res.json({ domains });
}));

// ── GET /roadmaps/domains/:domainId — get full static domain data
careerRoadmapsRouter.get('/roadmaps/domains/:domainId', ...anyone, wrap(async (req, res) => {
  const domain = domainMap.get(req.params.domainId);
  if (!domain) throw notFound('Career domain not found');
  res.json({ domain });
}));

// ── GET /roadmaps/me — get enrolled roadmaps with progress
careerRoadmapsRouter.get('/roadmaps/me', ...student, wrap(async (req, res) => {
  const enrolled = db.prepare('SELECT * FROM career_roadmaps WHERE student_id = ? ORDER BY enrolled_at DESC').all(req.user.id);

  const results = enrolled.map((r) => {
    const domain = domainMap.get(r.domain_id);
    const progressRows = db.prepare('SELECT stage_index, topic_index, completed_at FROM roadmap_progress WHERE roadmap_id = ?').all(r.id);
    const completedKeys = progressRows.map((p) => `${p.stage_index}-${p.topic_index}`);
    const totalTopics = domain ? countDomainTopics(domain) : 0;
    const completedCount = completedKeys.length;
    const progressPercent = totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

    return {
      id: r.id,
      roadmapId: r.id,
      domainId: r.domain_id,
      domainTitle: r.domain_title,
      enrolledAt: r.enrolled_at,
      domain: domain || null,
      completedKeys,
      completedCount,
      totalTopics,
      progressPercent,
    };
  });

  res.json({ roadmaps: results, items: results });
}));

// ── POST /roadmaps/me/enroll — enroll in a new domain
careerRoadmapsRouter.post('/roadmaps/me/enroll', ...student, wrap(async (req, res) => {
  const { domainId } = parse(z.object({ domainId: z.string().min(1).max(80) }).strict(), req.body);
  const domain = domainMap.get(domainId);
  if (!domain) throw notFound('Career domain not found');

  const existing = db.prepare('SELECT * FROM career_roadmaps WHERE student_id = ? AND domain_id = ?').get(req.user.id, domainId);
  if (existing) {
    return res.status(200).json({ id: existing.id, roadmapId: existing.id, domainId, domainTitle: domain.title, enrolledAt: existing.enrolled_at });
  }

  const id = Number(
    db.prepare('INSERT INTO career_roadmaps (student_id, domain_id, domain_title) VALUES (?,?,?)')
      .run(req.user.id, domainId, domain.title).lastInsertRowid
  );

  res.status(201).json({ id, roadmapId: id, domainId, domainTitle: domain.title, domain });
}));

// ── DELETE /roadmaps/me/:roadmapId — unenroll
careerRoadmapsRouter.delete('/roadmaps/me/:roadmapId', ...student, wrap(async (req, res) => {
  const id = Number(req.params.roadmapId);
  if (!id) throw bad('Invalid roadmap ID');
  const r = db.prepare('SELECT * FROM career_roadmaps WHERE id = ? AND student_id = ?').get(id, req.user.id);
  if (!r) throw notFound('Roadmap not found');

  tx(() => {
    db.prepare('DELETE FROM roadmap_progress WHERE roadmap_id = ?').run(r.id);
    db.prepare('DELETE FROM career_roadmaps WHERE id = ?').run(r.id);
  });

  res.json({ ok: true, removed: true });
}));

// ── PATCH /roadmaps/me/:roadmapId/progress — toggle topic completion
careerRoadmapsRouter.patch('/roadmaps/me/:roadmapId/progress', ...student, wrap(async (req, res) => {
  const id = Number(req.params.roadmapId);
  if (!id) throw bad('Invalid roadmap ID');
  const r = db.prepare('SELECT * FROM career_roadmaps WHERE id = ? AND student_id = ?').get(id, req.user.id);
  if (!r) throw notFound('Roadmap not found');

  const b = parse(z.object({
    stageIndex: z.number().int().min(0).max(20),
    topicIndex: z.number().int().min(0).max(50),
    completed: z.boolean(),
  }).strict(), req.body);

  if (b.completed) {
    db.prepare(`INSERT INTO roadmap_progress (roadmap_id, student_id, stage_index, topic_index, completed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(roadmap_id, stage_index, topic_index) DO UPDATE SET completed_at = datetime('now')`)
      .run(r.id, req.user.id, b.stageIndex, b.topicIndex);
  } else {
    db.prepare('DELETE FROM roadmap_progress WHERE roadmap_id = ? AND stage_index = ? AND topic_index = ?')
      .run(r.id, b.stageIndex, b.topicIndex);
  }

  const domain = domainMap.get(r.domain_id);
  const totalTopics = domain ? countDomainTopics(domain) : 0;
  const completedRows = db.prepare('SELECT stage_index, topic_index FROM roadmap_progress WHERE roadmap_id = ?').all(r.id);
  const completedKeys = completedRows.map((p) => `${p.stage_index}-${p.topic_index}`);
  const progressPercent = totalTopics > 0 ? Math.round((completedKeys.length / totalTopics) * 100) : 0;

  res.json({
    ok: true,
    roadmapId: r.id,
    completed: b.completed,
    stageIndex: b.stageIndex,
    topicIndex: b.topicIndex,
    completedCount: completedKeys.length,
    totalTopics,
    progressPercent,
    completedKeys,
  });
}));

// ── POST /roadmaps/analyze-resume — AI / text resume gap analysis against career domain
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

careerRoadmapsRouter.post('/roadmaps/analyze-resume', ...student, upload.single('file'), wrap(async (req, res) => {
  const domainId = req.body?.domainId;
  if (!domainId) throw bad('domainId is required');
  const domain = domainMap.get(domainId);
  if (!domain) throw notFound('Career domain not found');

  let resumeText = '';
  if (req.file) {
    const buf = req.file.buffer;
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only PDF files are supported');
    try {
      const parsed = await pdfParse(new Uint8Array(buf));
      resumeText = parsed.text || '';
    } catch {
      throw new HttpError(422, 'UNREADABLE_PDF', 'Unable to parse PDF text');
    }
  } else {
    // If no file uploaded directly, fall back to student's latest uploaded resume in database
    const latest = db.prepare('SELECT extracted_text FROM resumes WHERE student_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!latest?.extracted_text) throw bad('Please upload a PDF resume or submit one on your profile first');
    resumeText = latest.extracted_text;
  }

  const normalizedText = resumeText.toLowerCase();

  // Evaluate matching topics across all stages
  const matchedTopics = [];
  const missingTopics = [];

  domain.stages.forEach((stage, sIdx) => {
    stage.topics.forEach((topic, tIdx) => {
      const key = `${sIdx}-${tIdx}`;
      // Clean topic keywords for matching
      const keywords = topic.toLowerCase().split(/[\s/,&]+/).filter((w) => w.length > 2);
      const isMatched = keywords.some((kw) => normalizedText.includes(kw));

      if (isMatched) {
        matchedTopics.push({ key, stageIndex: sIdx, topicIndex: tIdx, title: topic, stageTitle: stage.title });
      } else {
        missingTopics.push({ key, stageIndex: sIdx, topicIndex: tIdx, title: topic, stageTitle: stage.title });
      }
    });
  });

  const totalTopics = matchedTopics.length + missingTopics.length;
  const matchPercent = totalTopics > 0 ? Math.round((matchedTopics.length / totalTopics) * 100) : 0;

  res.json({
    domainId,
    domainTitle: domain.title,
    matchPercent,
    matchedCount: matchedTopics.length,
    missingCount: missingTopics.length,
    totalTopics,
    matchedTopics,
    missingTopics,
    recommendations: missingTopics.slice(0, 5).map((t) => `Prioritize learning ${t.title} in Stage: ${t.stageTitle}`),
  });
}));

// ── POST /roadmaps/sync-resume-progress — batch-complete matched topics
careerRoadmapsRouter.post('/roadmaps/sync-resume-progress', ...student, wrap(async (req, res) => {
  const b = parse(z.object({
    roadmapId: z.number().int().positive(),
    topicKeys: z.array(z.string().regex(/^\d+-\d+$/)).min(1),
  }).strict(), req.body);

  const r = db.prepare('SELECT * FROM career_roadmaps WHERE id = ? AND student_id = ?').get(b.roadmapId, req.user.id);
  if (!r) throw notFound('Roadmap not found');

  const ins = db.prepare(`INSERT INTO roadmap_progress (roadmap_id, student_id, stage_index, topic_index, completed_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(roadmap_id, stage_index, topic_index) DO UPDATE SET completed_at = datetime('now')`);

  let synced = 0;
  tx(() => {
    for (const key of b.topicKeys) {
      const [si, ti] = key.split('-').map(Number);
      ins.run(r.id, req.user.id, si, ti);
      synced++;
    }
  });

  res.json({ ok: true, synced, roadmapId: r.id });
}));
