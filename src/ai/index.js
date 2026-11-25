import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../util.js';
import { extractSkills, skillByName } from './skills.js';
import { deterministicResume, rubricFromRules, narrativeFromRules, roadmapFromRules } from './scoring.js';
import { llmEnabled, llmResume, llmRoadmap } from './llm.js';

/**
 * AI quota. Each feature has its own daily allowance (a chat message should not cost the same as a verdict), and an
 * action is only charged when a language model was actually called: the rules engine answers for free.
 *
 *   const ticket = checkQuota(userId, 'resume_analysis');   // throws when the day's allowance is spent
 *   ... run the feature ...
 *   if (result.source !== 'llm') refundQuota(ticket);       // rules answered: give the allowance back
 */
const LIMITS = {
  chat: 20,
  interview: 10,
  resume_analysis: 10,
  jd: 15,
  arena: 10,
  dna: 5,
  roadmap: 5,
  cover: 5,
  cdna: 5,
  map: 10,
  rank: 20,
  verdict: 5,
  ocr: 3,
  tailor: 5,
};
export const quotaLimit = (kind) => LIMITS[kind] ?? config.aiDailyQuota;
export const quotaSnapshot = (userId) => Object.fromEntries(
  [...new Set(Object.keys(LIMITS).concat(db.prepare('SELECT DISTINCT kind FROM ai_usage WHERE user_id = ?').all(userId).map((r) => r.kind)))]
    .map((kind) => [kind, { used: usedToday(userId, kind), limit: quotaLimit(kind) }]),
);
const usedToday = (userId, kind) => db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND kind = ? AND date(created_at) = date('now')").get(userId, kind).n;

export function assertQuota(userId, kind) {
  const limit = quotaLimit(kind);
  if (usedToday(userId, kind) >= limit) {
    throw new HttpError(429, 'AI_QUOTA_EXCEEDED', `Daily limit of ${limit} for this AI feature reached. It resets at midnight UTC.`, { kind, limit });
  }
}

/** Reserve one unit. Returns the row id so a rules-engine answer can hand it back. */
export function spendQuota(userId, kind) {
  return Number(db.prepare('INSERT INTO ai_usage (user_id, kind) VALUES (?,?)').run(userId, kind).lastInsertRowid);
}

export function refundQuota(ticket) {
  if (!ticket) return;
  try { db.prepare('DELETE FROM ai_usage WHERE id = ?').run(ticket); } catch { /* already gone */ }
}

export function checkQuota(userId, kind) {
  assertQuota(userId, kind);
  return spendQuota(userId, kind);
}

/**
 * Resume analysis. Structure, contact, length and quantification are always computed by rules.
 * The language model (when configured) supplies the 0-60 rubric, strengths and improvements.
 * Any LLM failure falls back to the rules-based narrative and is recorded in `source`.
 */
export async function analyzeResume(rawText) {
  const text = rawText.slice(0, config.resumeMaxChars);
  const det = deterministicResume(text);
  const ruleSkills = extractSkills(text);

  let rubric;
  let narrative;
  let source = 'rules';
  let llmSkills = [];
  if (llmEnabled()) {
    try {
      const out = await llmResume(text);
      rubric = out.rubric;
      narrative = { strengths: out.strengths, improvements: [...out.improvements].sort((a, b) => a.priority - b.priority), summary: out.summary };
      llmSkills = out.skills;
      source = 'llm';
    } catch (e) {
      console.warn('LLM resume analysis failed, using rules:', e.message);
    }
  }
  const mapped = new Map(ruleSkills.map((s) => [s.id, { id: s.id, name: s.name, evidence: s.evidence }]));
  const unmapped = [];
  for (const s of llmSkills) {
    const hit = skillByName(s.name);
    if (hit) mapped.set(hit.id, { id: hit.id, name: hit.name, evidence: s.evidence || '' });
    else unmapped.push(s.name);
  }
  if (!rubric) {
    rubric = rubricFromRules(det, mapped.size);
    narrative = narrativeFromRules(det, mapped.size);
  }
  const ai = rubric.clarity + rubric.skills + rubric.writing;
  return {
    overall: Math.max(0, Math.min(100, det.score + ai)),
    deterministic: det.score,
    ai,
    breakdown: { ...det.parts, ...rubric },
    skills: { mapped: [...mapped.values()], unmapped },
    strengths: narrative.strengths,
    improvements: narrative.improvements,
    summary: narrative.summary,
    source,
  };
}

export async function buildRoadmap(targetTitle, studentSkillNames, gap) {
  if (!gap.missing.length) return { plan: roadmapFromRules(targetTitle, gap), source: 'rules' };
  if (llmEnabled()) {
    try {
      return { plan: await llmRoadmap(targetTitle, studentSkillNames, gap), source: 'llm' };
    } catch (e) {
      console.warn('LLM roadmap failed, using rules:', e.message);
    }
  }
  return { plan: roadmapFromRules(targetTitle, gap), source: 'rules' };
}
