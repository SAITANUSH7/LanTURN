import { db, parseJson } from '../db.js';
import { skillGap, preferenceMatch, freshness, matchScore } from '../ai/scoring.js';

export const idParam = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : -1;
};

export function studentSkills(userId) {
  return db.prepare('SELECT s.id, s.name, s.category, ss.source FROM student_skills ss JOIN skills s ON s.id = ss.skill_id WHERE ss.user_id = ? ORDER BY s.name').all(userId);
}

export function studentContext(userId) {
  const skills = studentSkills(userId);
  const p = db.prepare('SELECT preferred_types, preferred_locations FROM student_profiles WHERE user_id = ?').get(userId);
  return {
    skills,
    skillIds: new Set(skills.map((s) => s.id)),
    prefs: { types: parseJson(p?.preferred_types, []), locations: parseJson(p?.preferred_locations, []) },
  };
}

/** Load required skills for many jobs in one query. Returns Map(jobId -> [{skill_id, name, category, weight}]). */
export function loadJobSkills(jobIds) {
  const map = new Map(jobIds.map((id) => [id, []]));
  if (!jobIds.length) return map;
  const rows = db.prepare(
    `SELECT js.job_id, js.skill_id, js.weight, s.name, s.category FROM job_skills js JOIN skills s ON s.id = js.skill_id WHERE js.job_id IN (${jobIds.map(() => '?').join(',')}) ORDER BY js.weight DESC, s.name`,
  ).all(...jobIds);
  for (const r of rows) map.get(r.job_id).push(r);
  return map;
}

export function serializeJob(j, skills) {
  return {
    id: j.id,
    title: j.title,
    description: j.description,
    type: j.type,
    location: j.location,
    remote: !!j.remote,
    compensation: j.compensation,
    deadline: j.deadline,
    status: j.status,
    createdAt: j.created_at,
    company: { id: j.employer_id, name: j.company_name || '', industry: j.industry || '', location: j.company_location || '' },
    skills: skills.map((s) => ({ skillId: s.skill_id, name: s.name, weight: s.weight })),
  };
}

export const JOB_SELECT = `SELECT j.*, e.company_name, e.industry, e.location AS company_location
  FROM jobs j LEFT JOIN employer_profiles e ON e.user_id = j.employer_id`;

export function matchFor(job, skills, ctx) {
  const gap = skillGap(skills, ctx.skillIds);
  const pref = preferenceMatch(job, ctx.prefs);
  const fresh = freshness(job.created_at);
  return {
    score: matchScore(gap.matchPercent, pref, fresh),
    skillMatch: gap.matchPercent,
    prefMatch: pref,
    freshness: fresh,
    matched: gap.matched,
    missing: gap.missing,
  };
}

export function recordEvent(applicationId, from, to, actorId) {
  db.prepare('INSERT INTO application_events (application_id, from_status, to_status, actor_id) VALUES (?,?,?,?)').run(applicationId, from, to, actorId);
}

export function eventsFor(applicationId) {
  return db.prepare('SELECT from_status AS "from", to_status AS "to", created_at AS at FROM application_events WHERE application_id = ? ORDER BY id').all(applicationId);
}

export function latestAnalysis(resumeId) {
  const a = db.prepare('SELECT * FROM resume_analyses WHERE resume_id = ? ORDER BY id DESC LIMIT 1').get(resumeId);
  return a ? serializeAnalysis(a) : null;
}

export function serializeAnalysis(a) {
  return {
    id: a.id,
    status: a.status,
    overallScore: a.overall_score,
    deterministicScore: a.deterministic_score,
    aiScore: a.ai_score,
    breakdown: parseJson(a.breakdown, {}),
    extractedSkills: parseJson(a.extracted_skills, { mapped: [], unmapped: [] }),
    strengths: parseJson(a.strengths, []),
    improvements: parseJson(a.improvements, []),
    summary: a.summary,
    source: a.source,
    error: a.error,
    createdAt: a.created_at,
  };
}
