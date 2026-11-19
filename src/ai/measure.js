// Measuring whether our scores predict real hiring outcomes, plus the opt-in direction feedback used to retrain the ML model.
// Outcome labels come from employers' decisions: positive = SHORTLISTED/INTERVIEW/OFFERED, negative = REJECTED.
// Still-open (APPLIED) and WITHDRAWN applications carry no signal and are excluded.
import { db } from '../db.js';
import { CAREER_DOMAINS } from '../data/careerRoadmaps.js';

export const MIN_LABELED = 30;
const POSITIVE = ['SHORTLISTED', 'INTERVIEW', 'OFFERED'];

/** Area under the ROC curve = P(random positive scores above random negative), ties count half. */
export function auc(rows) {
  const pos = rows.filter((r) => r.y === 1);
  const neg = rows.filter((r) => r.y === 0);
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p.score > n.score ? 1 : p.score === n.score ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** Of the k top-scored applications, what fraction were positive. */
export function precisionAtK(rows, k) {
  const top = [...rows].sort((a, b) => b.score - a.score).slice(0, k);
  return top.length ? top.filter((r) => r.y === 1).length / top.length : null;
}

const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

export function measureOutcomes() {
  const rows = db.prepare(`SELECT a.id, a.status, a.match_score, a.resume_id FROM applications a WHERE a.status IN ('SHORTLISTED','INTERVIEW','OFFERED','REJECTED')`).all();
  const analysis = db.prepare('SELECT overall_score s FROM resume_analyses WHERE resume_id = ? ORDER BY id DESC LIMIT 1');
  const data = rows.map((r) => ({ y: POSITIVE.includes(r.status) ? 1 : 0, match: r.match_score, resume: r.resume_id ? (analysis.get(r.resume_id)?.s ?? null) : null }));
  const positives = data.filter((d) => d.y === 1).length;
  const negatives = data.length - positives;
  const signal = (key) => {
    const set = data.filter((d) => d[key] != null).map((d) => ({ y: d.y, score: d[key] }));
    const a = auc(set);
    const k = Math.max(1, Math.round(set.length / 5));
    return { n: set.length, auc: round(a), precisionAtTopFifth: round(precisionAtK(set, k)), interpretation: a == null ? 'needs both outcomes' : a >= 0.7 ? 'useful signal' : a >= 0.55 ? 'weak signal' : 'no better than chance' };
  };
  const enough = data.length >= MIN_LABELED && positives >= 5 && negatives >= 5;
  return {
    labeled: data.length, positives, negatives, baseRate: round(data.length ? positives / data.length : null),
    enoughData: enough,
    note: enough ? 'Computed on real employer decisions. Employers may already be influenced by the match score they see, so treat this as agreement with employers, not proof of ability.'
      : `Not enough decided applications yet: need at least ${MIN_LABELED} with 5+ of each outcome. Numbers below are for orientation only.`,
    matchScore: signal('match'), resumeScore: signal('resume'),
  };
}

// ---- Opt-in direction feedback -------------------------------------------------------------------------------------
// A student confirms the career direction that is really theirs. Only that label plus their skill NAMES are ever used for
// training (no resume text, name or contact data). Consent is the act of submitting; deleting withdraws it.
export const validDomain = (id) => CAREER_DOMAINS.some((d) => d.id === id);

export function feedbackFor(userId) {
  const r = db.prepare('SELECT domain, consent_at FROM ml_feedback WHERE user_id = ?').get(userId);
  return r ? { consent: true, domain: r.domain, since: r.consent_at } : { consent: false, domain: null, since: null };
}
export function saveFeedback(userId, domain) {
  db.prepare("INSERT INTO ml_feedback (user_id, domain, consent_at) VALUES (?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET domain = excluded.domain, consent_at = datetime('now')").run(userId, domain);
}
export const withdrawFeedback = (userId) => db.prepare('DELETE FROM ml_feedback WHERE user_id = ?').run(userId).changes;

/** Training documents from consenting students with at least 3 skills. Text = skill names only. */
export function feedbackExtras() {
  const rows = db.prepare(`SELECT f.user_id, f.domain, GROUP_CONCAT(s.name, ', ') names, COUNT(*) n
    FROM ml_feedback f JOIN student_skills ss ON ss.user_id = f.user_id JOIN skills s ON s.id = ss.skill_id GROUP BY f.user_id`).all();
  return rows.filter((r) => r.n >= 3 && validDomain(r.domain)).map((r) => ({ label: r.domain, text: r.names }));
}
