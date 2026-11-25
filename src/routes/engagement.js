// The two-sided engagement layer: a shared inbox over application threads, candidate-defined saved searches with
// alerts, and reply-time statistics. Everything here builds on tables that already exist - no parallel messaging stack.
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { parse, wrap, notFound, bad, forbidden } from '../util.js';
import { authenticate, requireRole } from '../auth.js';
import { idParam, matchFor, studentContext, openJobsBundle } from './common.js';
import { notify } from '../notify.js';
import { registerTask } from '../queue.js';
import { replyStats } from '../replyStats.js';

export const engagementRouter = Router();
const student = [authenticate, requireRole('STUDENT')];
const employer = [authenticate, requireRole('EMPLOYER')];
const both = [authenticate, requireRole('STUDENT', 'EMPLOYER')];

// ---------------------------------------------------------------- Inbox
/** The application, if this user is on it. Mirrors the guard in interviews.js: an id that is not yours is a 404, not a 403. */
function accessible(user, rawId) {
  const a = db.prepare(`SELECT a.id, a.status, a.student_id, a.job_id, j.employer_id, j.title, e.company_name,
    (SELECT full_name FROM student_profiles WHERE user_id = a.student_id) AS student_name
    FROM applications a JOIN jobs j ON j.id = a.job_id LEFT JOIN employer_profiles e ON e.user_id = j.employer_id
    WHERE a.id = ?`).get(idParam(rawId));
  if (!a) throw notFound('Application not found');
  const side = user.role === 'STUDENT' && a.student_id === user.id ? 'STUDENT' : user.role === 'EMPLOYER' && a.employer_id === user.id ? 'EMPLOYER' : null;
  if (!side) throw notFound('Application not found');
  return { a, side };
}

const THREADS = `SELECT a.id, a.status, a.student_id, a.job_id, j.title, j.employer_id,
    e.company_name, (SELECT full_name FROM student_profiles WHERE user_id = a.student_id) AS student_name,
    (SELECT COUNT(*) FROM application_messages m WHERE m.application_id = a.id) AS message_count,
    (SELECT COUNT(*) FROM application_messages m WHERE m.application_id = a.id AND m.sender_role <> ?
       AND m.id > COALESCE((SELECT last_read_id FROM message_reads r WHERE r.user_id = ? AND r.application_id = a.id), 0)) AS unread,
    (SELECT body FROM application_messages m WHERE m.application_id = a.id ORDER BY m.id DESC LIMIT 1) AS last_body,
    (SELECT created_at FROM application_messages m WHERE m.application_id = a.id ORDER BY m.id DESC LIMIT 1) AS last_at,
    (SELECT sender_role FROM application_messages m WHERE m.application_id = a.id ORDER BY m.id DESC LIMIT 1) AS last_from,
    (SELECT COUNT(*) FROM interviews i WHERE i.application_id = a.id AND i.status = 'SCHEDULED') AS upcoming
  FROM applications a JOIN jobs j ON j.id = a.job_id LEFT JOIN employer_profiles e ON e.user_id = j.employer_id`;

function threadsFor(user, { limit = 50 } = {}) {
  const side = user.role === 'STUDENT' ? 'STUDENT' : 'EMPLOYER';
  const mine = side === 'STUDENT' ? 'a.student_id = ?' : 'j.employer_id = ?';
  const rows = db.prepare(`${THREADS} WHERE ${mine} AND EXISTS (SELECT 1 FROM application_messages m WHERE m.application_id = a.id)
    ORDER BY COALESCE(last_at, a.updated_at) DESC, a.id DESC LIMIT ?`).all(side, user.id, user.id, limit);
  return rows.map((r) => ({
    applicationId: r.id,
    status: r.status,
    job: { id: r.job_id, title: r.title },
    you: side,
    with: side === 'STUDENT' ? (r.company_name || 'Employer') : (r.student_name || 'Candidate'),
    unread: r.unread,
    last: r.last_at ? { body: r.last_body, at: r.last_at, from: r.last_from } : null,
    upcomingInterviews: r.upcoming,
  }));
}

engagementRouter.get('/messages/threads', ...both, wrap(async (req, res) => {
  const items = threadsFor(req.user);
  res.json({ items, unread: items.reduce((n, t) => n + t.unread, 0) });
}));

// Cheap enough for the shell to poll when the stream is unavailable (offline, blocked EventSource).
engagementRouter.get('/messages/unread', ...both, wrap(async (req, res) => {
  const items = threadsFor(req.user, { limit: 500 });
  res.json({ unread: items.reduce((n, t) => n + t.unread, 0) });
}));

engagementRouter.post('/messages/threads/:id/read', ...both, wrap(async (req, res) => {
  const { a } = accessible(req.user, req.params.id);
  markRead(req.user.id, a.id);
  res.json({ ok: true });
}));

/** Record that this user has seen everything up to the newest message in a thread. */
export function markRead(userId, applicationId) {
  const max = db.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM application_messages WHERE application_id = ?').get(applicationId).n;
  db.prepare(`INSERT INTO message_reads (user_id, application_id, last_read_id) VALUES (?,?,?)
    ON CONFLICT(user_id, application_id) DO UPDATE SET last_read_id = MAX(message_reads.last_read_id, excluded.last_read_id), updated_at = datetime('now')`)
    .run(userId, applicationId, max);
}

// ---------------------------------------------------------------- Saved searches
const SearchSchema = z.object({
  name: z.string().trim().max(60).default(''),
  q: z.string().trim().max(120).default(''),
  type: z.enum(['', 'INTERNSHIP', 'FULL_TIME', 'PART_TIME', 'CONTRACT']).default(''),
  location: z.string().trim().max(80).default(''),
  remote: z.boolean().default(false),
  skillId: z.number().int().positive().nullable().default(null),
  minMatch: z.number().int().min(40).max(100).default(70),
}).strict();

const searchOut = (r) => ({ id: r.id, name: r.name, q: r.q, type: r.type, location: r.location, remote: !!r.remote, skillId: r.skill_id, minMatch: r.min_match, createdAt: r.created_at });

/** Accepts a camelCase row from the API and a raw column row (min_match) from the database. */
export const searchLabel = (s) => {
  const name = String(s.name || '').trim();
  const bits = [s.q && `"${s.q}"`, s.type && s.type.replace('_', ' ').toLowerCase(), s.location, s.remote && 'remote']
    .filter(Boolean)
    // A search called "Backend" that filters on "Backend" should not read "Backend · "Backend"".
    .filter((b) => !(name && b.replace(/"/g, '').toLowerCase() === name.toLowerCase()));
  const min = s.minMatch ?? s.min_match ?? 70;
  const head = name || bits[0] || 'Any job';
  const rest = name ? bits : bits.slice(1);
  return `${head}${rest.length ? ` · ${rest.join(' · ')}` : ''} · ${min}%+`;
};

/** Does this open job satisfy the stored filters? Same predicates the /jobs query uses, so results never disagree. */
export function searchMatchesJob(s, job) {
  const q = String(s.q || '').toLowerCase();
  if (q && !(`${job.title} ${job.description || ''} ${job.company_name || ''}`.toLowerCase().includes(q))) return false;
  if (s.type && job.type !== s.type) return false;
  if (s.location && !String(job.location || '').toLowerCase().includes(String(s.location).toLowerCase())) return false;
  if (s.remote && !job.remote) return false;
  return true;
}

/** Score every open job against one saved search. Uses the cached job bundle, so a preview costs no queries. */
export function searchJobsFor(s, studentId) {
  const ctx = s.__ctx || studentContext(studentId);
  const b = openJobsBundle();
  const out = [];
  for (const job of b.rows) {
    if (!searchMatchesJob(s, job)) continue;
    const skills = b.skills.get(job.id);
    if (s.skill_id && !(skills || []).some((x) => x.skill_id === s.skill_id)) continue;
    const m = matchFor(job, skills, ctx);
    if (m.score >= s.min_match) out.push({ id: job.id, title: job.title, company: job.company_name || '', location: job.location, type: job.type, remote: !!job.remote, score: m.score });
  }
  return out.sort((x, y) => y.score - x.score || x.id - y.id);
}

engagementRouter.get('/student/saved-searches', ...student, wrap(async (req, res) => {
  const rows = db.prepare('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ items: rows.map((r) => ({ ...searchOut(r), label: searchLabel(r), matches: searchJobsFor(r, req.user.id).length })) });
}));

engagementRouter.post('/student/saved-searches', ...student, wrap(async (req, res) => {
  const b = parse(SearchSchema, req.body);
  if (!b.q && !b.type && !b.location && !b.remote && !b.skillId) throw bad('Save a search with at least one filter, or it would match every job');
  if (b.skillId && !db.prepare('SELECT 1 FROM skills WHERE id = ?').get(b.skillId)) throw bad('skillId: unknown skill');
  const existing = db.prepare('SELECT * FROM saved_searches WHERE user_id = ?').all(req.user.id);
  const dup = existing.find((r) => r.q === b.q && r.type === b.type && r.location === b.location && !!r.remote === b.remote && (r.skill_id || null) === b.skillId);
  if (dup) return res.status(200).json({ search: { ...searchOut(dup), label: searchLabel(dup) }, duplicate: true });
  if (existing.length >= 20) throw bad('You can keep 20 saved searches. Delete one first.');
  const id = Number(db.prepare('INSERT INTO saved_searches (user_id, name, q, type, location, remote, skill_id, min_match) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.user.id, b.name, b.q, b.type, b.location, b.remote ? 1 : 0, b.skillId, b.minMatch).lastInsertRowid);
  const row = db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(id);
  res.status(201).json({ search: { ...searchOut(row), label: searchLabel(row), matches: searchJobsFor(row, req.user.id).length } });
}));

engagementRouter.delete('/student/saved-searches/:id', ...student, wrap(async (req, res) => {
  const r = db.prepare('DELETE FROM saved_searches WHERE id = ? AND user_id = ?').run(idParam(req.params.id), req.user.id);
  if (!r.changes) throw notFound('Saved search not found');
  res.json({ ok: true });
}));

engagementRouter.get('/student/saved-searches/:id/matches', ...student, wrap(async (req, res) => {
  const s = db.prepare('SELECT * FROM saved_searches WHERE id = ? AND user_id = ?').get(idParam(req.params.id), req.user.id);
  if (!s) throw notFound('Saved search not found');
  const hits = searchJobsFor(s, req.user.id);
  res.json({ id: s.id, label: searchLabel(s), total: hits.length, items: hits.slice(0, 10) });
}));

/**
 * Alerts for one new job, for every saved search that it satisfies. Idempotent: a (type, link) pair already in
 * notifications means that person was told about this job, so a retried task never double-notifies.
 */
export function runSavedSearchAlerts(jobId) {
  const job = db.prepare(`SELECT j.*, e.company_name FROM jobs j LEFT JOIN employer_profiles e ON e.user_id = j.employer_id
    WHERE j.id = ? AND j.status = 'OPEN' AND (j.deadline IS NULL OR j.deadline >= date('now'))`).get(jobId);
  if (!job) return { skipped: 'job not open' };
  const searches = db.prepare('SELECT * FROM saved_searches').all();
  const link = `#/student/jobs/${job.id}`;
  const told = new Set(db.prepare("SELECT user_id FROM notifications WHERE type = 'saved_search_alert' AND link = ?").all(link).map((r) => r.user_id));
  const ctxCache = new Map();
  let sent = 0;
  for (const s of searches) {
    if (told.has(s.user_id)) continue;
    if (!searchMatchesJob(s, job)) continue;
    s.__ctx = ctxCache.get(s.user_id) || studentContext(s.user_id);
    ctxCache.set(s.user_id, s.__ctx);
    const hits = searchJobsFor(s, s.user_id);
    const hit = hits.find((h) => h.id === job.id);
    if (!hit) continue;
    notify(s.user_id, 'saved_search_alert', `${hit.score}% match for "${searchLabel(s)}"`, `${job.title}${job.company_name ? ` at ${job.company_name}` : ''}`, link);
    sent += 1;
  }
  return { alerted: sent, searches: searches.length };
}
registerTask('alerts.saved_search', async ({ jobId }) => runSavedSearchAlerts(jobId));

// ---------------------------------------------------------------- Reply time
engagementRouter.get('/employer/response-time', ...employer, wrap(async (req, res) => {
  const stats = replyStats(req.user.id);
  res.json(stats);
}));

// Exported for the student-facing application detail (see jobs.js).
export { replyStats };
export const requireStudentOrEmployer = both;
export const __test = { accessible, threadsFor, searchMatchesJob };
export { forbidden };
