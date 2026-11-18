// After a resume is uploaded: fill the profile, set skills, choose the best direction, enrol the roadmap, match jobs.
// Everything here is rules-based, so it works with no AI key and costs no quota. Existing user edits are never overwritten.
import { db, tx } from '../db.js';
import { extractSkills } from './skills.js';
import { classifyDomains, nlpEnabled } from '../nlp.js';
import { extractProfile } from './profileExtract.js';
import { CAREER_DOMAINS } from '../data/careerRoadmaps.js';
import { computeCareerMap } from '../routes/careerMap.js';

const PLACEHOLDER = /^(new )?(student|user|test)( (\d+|one|two|three))?$/i;

export function topJobMatches(userId, limit = 5) {
  const mine = new Set(db.prepare('SELECT skill_id FROM student_skills WHERE user_id = ?').all(userId).map((r) => r.skill_id));
  const jobs = db.prepare("SELECT j.id, j.title, j.location, j.type, e.company_name FROM jobs j LEFT JOIN employer_profiles e ON e.user_id = j.employer_id WHERE j.status = 'OPEN'").all();
  const reqStmt = db.prepare('SELECT js.skill_id, js.weight, s.name FROM job_skills js JOIN skills s ON s.id = js.skill_id WHERE js.job_id = ?');
  return jobs.map((j) => {
    const req = reqStmt.all(j.id);
    const total = req.reduce((a, r) => a + r.weight, 0) || 1;
    const have = req.filter((r) => mine.has(r.skill_id));
    const missing = req.filter((r) => !mine.has(r.skill_id)).map((r) => r.name);
    return { id: j.id, title: j.title, company: j.company_name || '', location: j.location, type: j.type, match: Math.round((have.reduce((a, r) => a + r.weight, 0) / total) * 100), missing };
  }).sort((a, b) => b.match - a.match).slice(0, limit);
}

export function autoSetup(userId) {
  const resume = db.prepare('SELECT id, extracted_text FROM resumes WHERE student_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  if (!resume?.extracted_text) return null;
  const text = resume.extracted_text;
  const prof = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId) || {};
  const found = extractProfile(text);
  const filled = {};
  const set = {};
  const empty = (v) => v == null || String(v).trim() === '';
  if ((empty(prof.full_name) || PLACEHOLDER.test(prof.full_name)) && found.name) { set.full_name = found.name; filled.name = found.name; }
  if (empty(prof.college) && found.college) { set.college = found.college; filled.college = found.college; }
  if (empty(prof.degree) && found.degree) { set.degree = found.degree; filled.degree = found.degree; }
  if (empty(prof.branch) && found.branch) { set.branch = found.branch; filled.branch = found.branch; }
  if (!prof.graduation_year && found.graduationYear) { set.graduation_year = found.graduationYear; filled.graduationYear = found.graduationYear; }
  if (empty(prof.location) && found.location) { set.location = found.location; filled.location = found.location; }

  const skillHits = extractSkills(text);
  tx(() => {
    db.prepare('INSERT OR IGNORE INTO student_profiles (user_id) VALUES (?)').run(userId);
    const ins = db.prepare("INSERT OR IGNORE INTO student_skills (user_id, skill_id, source) VALUES (?,?,'RESUME')");
    for (const s of skillHits) ins.run(userId, s.id);
    const keys = Object.keys(set);
    if (keys.length) db.prepare(`UPDATE student_profiles SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`).run(...keys.map((k) => set[k]), userId);
  });

  const { map } = computeCareerMap(userId);
  const focus = map.focus;
  const skills = db.prepare('SELECT s.name FROM student_skills ss JOIN skills s ON s.id = ss.skill_id WHERE ss.user_id = ? ORDER BY s.name').all(userId).map((r) => r.name);
  const p2 = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId);
  const headline = [p2.degree && `${p2.degree}${p2.branch ? ' ' + p2.branch : ''} student`, focus && `aiming for ${focus.title}`].filter(Boolean).join(' · ');
  if (focus) db.prepare('INSERT OR IGNORE INTO career_roadmaps (student_id, domain_id, domain_title) VALUES (?,?,?)').run(userId, focus.id, focus.title);
  const summary = {
    resumeId: resume.id,
    at: new Date().toISOString(),
    filled,
    skills,
    headline,
    direction: focus ? { id: focus.id, title: focus.title, fit: focus.fit, matched: focus.matched, total: focus.total } : null,
    alternatives: map.domains.filter((d) => d.id !== focus?.id).slice(0, 3).map((d) => ({ id: d.id, title: d.title, fit: d.fit })),
    nextActions: map.nextActions.slice(0, 4),
    jobs: topJobMatches(userId, 5),
  };
  db.prepare("UPDATE student_profiles SET headline = ?, target_domain = ?, auto_setup = ?, auto_filled_at = datetime('now') WHERE user_id = ?").run(headline, focus?.id ?? null, JSON.stringify(summary), userId);
  return summary;
}
export const domainCount = CAREER_DOMAINS.length;

/**
 * Optional ML second opinion (Python sidecar): which Career AIsle directions does this resume read like?
 * Merged into the stored auto-setup JSON. Never throws; returns the setup unchanged if the model is unavailable.
 */
export async function attachMl(userId, setup) {
  if (!setup || !nlpEnabled()) return setup;
  try {
    const resume = db.prepare('SELECT extracted_text FROM resumes WHERE student_id = ? ORDER BY id DESC LIMIT 1').get(userId);
    const text = `${resume?.extracted_text || ''}\nSkills: ${(setup.skills || []).join(', ')}`;
    const out = await classifyDomains(text, 3);
    if (!out) return setup;
    const title = (id) => CAREER_DOMAINS.find((d) => d.id === id)?.title || id;
    setup.ml = { modelVersion: out.version, top: out.top.map((t) => ({ id: t.id, title: title(t.id), prob: t.prob })) };
    db.prepare('UPDATE student_profiles SET auto_setup = ? WHERE user_id = ?').run(JSON.stringify(setup), userId);
  } catch (e) { console.warn('ml classification failed:', e.message); }
  return setup;
}
