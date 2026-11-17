import { db } from './db.js';
import { registerTask, enqueue } from './queue.js';
import { matchMany, pack } from './match.js';
import { notify } from './notify.js';

const MIN_MATCH = 60;
const MAX_NOTIFY = 200;

/** New job posted: tell the students whose skills cover most of it. Idempotent (skips people already told). */
registerTask('job.match_notify', async ({ jobId }) => {
  const job = db.prepare("SELECT j.id, j.title, e.company_name FROM jobs j LEFT JOIN employer_profiles e ON e.user_id = j.employer_id WHERE j.id = ? AND j.status = 'OPEN'").get(jobId);
  if (!job) return { skipped: 'job not open' };
  const req = db.prepare('SELECT skill_id, weight FROM job_skills WHERE job_id = ?').all(jobId);
  if (!req.length) return { skipped: 'no required skills' };
  const rows = db.prepare("SELECT u.id uid, ss.skill_id FROM users u LEFT JOIN student_skills ss ON ss.user_id = u.id WHERE u.role = 'STUDENT'").all();
  const byUser = new Map();
  for (const r of rows) { if (!byUser.has(r.uid)) byUser.set(r.uid, []); if (r.skill_id != null) byUser.get(r.uid).push(r.skill_id); }
  const ids = [...byUser.keys()];
  const { skillIds, offsets } = pack(ids.map((i) => byUser.get(i)));
  const scores = matchMany(skillIds, offsets, Int32Array.from(req.map((r) => r.skill_id)), Int32Array.from(req.map((r) => r.weight)));
  const link = `#/student/jobs/${jobId}`;
  const told = new Set(db.prepare("SELECT user_id FROM notifications WHERE type = 'job_match' AND link = ?").all(link).map((r) => r.user_id));
  const hits = ids.map((uid, i) => ({ uid, score: scores[i] })).filter((h) => h.score >= MIN_MATCH && !told.has(h.uid)).sort((a, b) => b.score - a.score).slice(0, MAX_NOTIFY);
  for (const h of hits) notify(h.uid, 'job_match', `New job matches you ${h.score}%`, `${job.title}${job.company_name ? ` at ${job.company_name}` : ''}`, link);
  return { notified: hits.length, considered: ids.length };
});

/** Housekeeping: expired sessions, old failed-login rows, finished tasks; keep the SQLite file healthy. */
registerTask('maintenance.cleanup', async () => {
  const del = (sql) => Number(db.prepare(sql).run().changes);
  const out = {
    refreshTokens: del("DELETE FROM refresh_tokens WHERE expires_at < datetime('now', '-1 day') OR revoked_at < datetime('now', '-7 days')"),
    loginAttempts: del("DELETE FROM login_attempts WHERE at < datetime('now', '-1 day')"),
    doneTasks: del("DELETE FROM tasks WHERE status = 'DONE' AND finished_at < datetime('now', '-7 days')"),
    failedTasks: del("DELETE FROM tasks WHERE status = 'FAILED' AND finished_at < datetime('now', '-30 days')"),
  };
  db.exec('PRAGMA optimize');
  db.exec('PRAGMA wal_checkpoint(PASSIVE)');
  return out;
});

let hourly = null;
export function startScheduler() {
  enqueue('maintenance.cleanup', {}, { dedupeKey: 'maintenance', delayMs: 30_000 });
  hourly = setInterval(() => enqueue('maintenance.cleanup', {}, { dedupeKey: 'maintenance' }), 3_600_000);
  hourly.unref();
}
export const stopScheduler = () => { if (hourly) clearInterval(hourly); hourly = null; };
