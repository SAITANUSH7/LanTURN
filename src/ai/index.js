import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../util.js';
import { extractSkills, skillByName } from './skills.js';
import { deterministicResume, rubricFromRules, narrativeFromRules, roadmapFromRules } from './scoring.js';
import { llmEnabled, llmResume, llmRoadmap } from './llm.js';

/** Count AI actions per user per day and refuse past the quota. */
export function checkQuota(userId, kind) {
  const used = db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND created_at >= datetime('now','-1 day')").get(userId).n;
  if (used >= config.aiDailyQuota) throw new HttpError(429, 'AI_QUOTA_EXCEEDED', `Daily AI limit of ${config.aiDailyQuota} reached. Try again tomorrow.`);
  db.prepare('INSERT INTO ai_usage (user_id, kind) VALUES (?,?)').run(userId, kind);
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
