// Reply-time statistics for an employer: how long candidates wait before hearing back.
//
// Students ask "will anyone answer me?" more than any other question, and an employer that replies in four hours is a
// better place to apply than one that replies in four weeks. Both sides now see the same number, computed from the
// application threads that already exist - no new tracking, no self-reported data.
import { db } from './db.js';

const HOUR = 3600000;
const cache = new Map(); // employerId -> { at, stats }, invalidated by a short TTL
const TTL = 60_000;

/** Median and 90th-percentile hours from a candidate's first message to the employer's first reply. */
export function replyStats(employerId) {
  const id = Number(employerId);
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.stats;

  const rows = db.prepare(`SELECT m.application_id AS app, m.sender_role AS role, m.created_at AS at
    FROM application_messages m
    JOIN applications a ON a.id = m.application_id
    JOIN jobs j ON j.id = a.job_id
    WHERE j.employer_id = ? ORDER BY m.application_id, m.id`).all(id);

  const pending = new Map(); // application id -> { asked, replied }
  for (const r of rows) {
    const cur = pending.get(r.app) || { asked: 0, replied: 0 };
    const t = Date.parse(r.at.replace(' ', 'T') + 'Z');
    if (r.role === 'STUDENT' && !cur.asked) cur.asked = t;
    else if (r.role === 'EMPLOYER' && cur.asked && !cur.replied) cur.replied = t;
    pending.set(r.app, cur);
  }

  const hours = [];
  let awaiting = 0;
  for (const { asked, replied } of pending.values()) {
    if (!asked) continue;
    if (replied) hours.push((replied - asked) / HOUR);
    else awaiting += 1;
  }
  hours.sort((a, b) => a - b);
  const pick = (p) => (hours.length ? hours[Math.min(hours.length - 1, Math.floor((hours.length - 1) * p))] : null);
  const stats = {
    replies: hours.length,
    awaiting,
    medianHours: pick(0.5),
    p90Hours: pick(0.9),
    fastestHours: hours.length ? Math.round(hours[0] * 10) / 10 : null,
  };
  cache.set(id, { at: Date.now(), stats });
  return stats;
}

export const __clearReplyCache = () => cache.clear();

/** Human sentence for the UI: "usually replies in about 3 h", or null when there is nothing to brag about yet. */
export function replyLabel(stats) {
  if (!stats || !stats.replies) return null;
  const h = stats.medianHours;
  if (h == null) return null;
  const text = h < 1 ? 'within an hour' : h < 24 ? `in about ${Math.max(1, Math.round(h))} h` : `in about ${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'}`;
  return `Usually replies ${text}`;
}
