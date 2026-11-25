// Interview scheduling and the per-application message thread between a student and the employer.
import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { invalidateReplyStats } from '../replyStats.js';
import { HttpError, bad, conflict, notFound, parse, wrap, forbidden } from '../util.js';
import { authenticate, requireRole } from '../auth.js';
import { idParam, recordEvent } from './common.js';
import { notify } from '../notify.js';
import { markRead } from './engagement.js';

export const interviewsRouter = Router();

export const interviewsFor = (applicationId) => db.prepare('SELECT id, starts_at AS startsAt, duration_min AS durationMin, mode, location, note, status FROM interviews WHERE application_id = ? ORDER BY starts_at').all(applicationId);

/** Called when an application is rejected or withdrawn: its pending interviews no longer apply. */
export const cancelOpenInterviews = (applicationId) => db.prepare("UPDATE interviews SET status = 'CANCELLED' WHERE application_id = ? AND status = 'SCHEDULED'").run(applicationId);

/** The application, if the signed-in user is its student or the employer (or a member of that employer's team) who owns the job. */
function accessible(req, rawId) {
  const a = db.prepare(`SELECT a.id, a.status, a.student_id, a.job_id, j.employer_id, j.title, e.company_name,
    (SELECT full_name FROM student_profiles WHERE user_id = a.student_id) AS student_name
    FROM applications a JOIN jobs j ON j.id = a.job_id LEFT JOIN employer_profiles e ON e.user_id = j.employer_id WHERE a.id = ?`).get(idParam(rawId));
  if (!a) throw notFound('Application not found');
  const side = req.user.role === 'STUDENT' && a.student_id === req.user.id ? 'STUDENT' : req.user.role === 'EMPLOYER' && a.employer_id === req.user.id ? 'EMPLOYER' : null;
  if (!side) throw notFound('Application not found');
  return { a, side };
}

const InterviewSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(15).max(480).default(30),
  mode: z.enum(['VIDEO', 'PHONE', 'ONSITE']),
  location: z.string().trim().max(300).default(''),
  note: z.string().trim().max(1000).default(''),
}).strict();

const MODE = { VIDEO: 'Video call', PHONE: 'Phone call', ONSITE: 'On site' };
const when = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) + ' IST';

interviewsRouter.post('/employer/applications/:id/interviews', authenticate, requireRole('EMPLOYER'), wrap(async (req, res) => {
  const { a } = accessible(req, req.params.id);
  const b = parse(InterviewSchema, req.body);
  const start = new Date(b.startsAt).getTime();
  if (!(start > Date.now() + 5 * 60000)) throw bad('startsAt: must be in the future');
  if (start > Date.now() + 365 * 86400000) throw bad('startsAt: must be within the next year');
  if (b.mode !== 'PHONE' && !b.location) throw bad(b.mode === 'VIDEO' ? 'location: add the meeting link' : 'location: add the address');
  if (!['SHORTLISTED', 'INTERVIEW'].includes(a.status)) throw conflict('Shortlist the candidate before scheduling an interview', 'INVALID_TRANSITION');
  if (db.prepare("SELECT COUNT(*) n FROM interviews WHERE application_id = ? AND status = 'SCHEDULED'").get(a.id).n >= 5) throw conflict('This candidate already has 5 scheduled interviews. Cancel one first.');
  const id = tx(() => {
    const iid = Number(db.prepare('INSERT INTO interviews (application_id, starts_at, duration_min, mode, location, note, created_by) VALUES (?,?,?,?,?,?,?)')
      .run(a.id, new Date(b.startsAt).toISOString(), b.durationMin, b.mode, b.location, b.note, req.user.id).lastInsertRowid);
    if (a.status === 'SHORTLISTED') {
      db.prepare("UPDATE applications SET status = 'INTERVIEW', updated_at = datetime('now') WHERE id = ?").run(a.id);
      recordEvent(a.id, 'SHORTLISTED', 'INTERVIEW', req.user.id);
    }
    return iid;
  });
  notify(a.student_id, 'interview_scheduled', `Interview scheduled: ${a.title}`, `${a.company_name || 'The employer'} invited you: ${MODE[b.mode]}, ${when(b.startsAt)}.`, `#/student/messages?thread=${a.id}`);
  res.status(201).json({ interview: interviewsFor(a.id).find((x) => x.id === id), interviews: interviewsFor(a.id) });
}));

interviewsRouter.post('/employer/applications/:id/interviews/:iid/cancel', authenticate, requireRole('EMPLOYER'), wrap(async (req, res) => {
  const { a } = accessible(req, req.params.id);
  const it = db.prepare('SELECT * FROM interviews WHERE id = ? AND application_id = ?').get(idParam(req.params.iid), a.id);
  if (!it) throw notFound('Interview not found');
  if (it.status === 'CANCELLED') return res.json({ interviews: interviewsFor(a.id) });
  db.prepare("UPDATE interviews SET status = 'CANCELLED' WHERE id = ?").run(it.id);
  notify(a.student_id, 'interview_cancelled', `Interview cancelled: ${a.title}`, `${a.company_name || 'The employer'} cancelled the ${when(it.starts_at)} interview. They may send a new time.`, `#/student/messages?thread=${a.id}`);
  res.json({ interviews: interviewsFor(a.id) });
}));

const icsEsc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsTime = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
interviewsRouter.get('/interviews/:id/ics', authenticate, wrap(async (req, res) => {
  const it = db.prepare('SELECT * FROM interviews WHERE id = ?').get(idParam(req.params.id));
  if (!it) throw notFound('Interview not found');
  const { a } = accessible(req, it.application_id);
  const end = new Date(new Date(it.starts_at).getTime() + it.duration_min * 60000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LanTURN//Interviews//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:interview-${it.id}@lanturn`, `DTSTAMP:${icsTime(new Date())}`, `DTSTART:${icsTime(it.starts_at)}`, `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsEsc(`Interview: ${a.title}${a.company_name ? ` (${a.company_name})` : ''}`)}`,
    `LOCATION:${icsEsc(it.mode === 'PHONE' ? 'Phone call' : it.location)}`,
    `DESCRIPTION:${icsEsc(`${MODE[it.mode]}${it.note ? `. ${it.note}` : ''}`)}`,
    `STATUS:${it.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR'];
  res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="interview-${it.id}.ics"`, 'Cache-Control': 'no-store' });
  res.send(`${lines.join('\r\n')}\r\n`);
}));

// ---------- Messages ----------
const msgOut = (m) => ({ id: m.id, from: m.sender_role, body: m.body, at: m.created_at });
const systemEntry = (it) => ({
  id: `interview-${it.id}`,
  from: 'SYSTEM',
  kind: it.status === 'CANCELLED' ? 'interview_cancelled' : 'interview',
  body: it.status === 'CANCELLED'
    ? `Interview cancelled: ${when(it.starts_at)}`
    : `Interview scheduled: ${MODE[it.mode]}, ${when(it.starts_at)}${it.location ? ` · ${it.location}` : ''}${it.note ? ` · ${it.note}` : ''}`,
  at: it.starts_at,
});

interviewsRouter.get('/applications/:id/messages', authenticate, requireRole('STUDENT', 'EMPLOYER'), wrap(async (req, res) => {
  const { a, side } = accessible(req, req.params.id);
  const messages = db.prepare('SELECT * FROM application_messages WHERE application_id = ? ORDER BY id').all(a.id).map(msgOut);
  // An interview is part of the conversation: showing it in the thread means nobody has to cross-reference a
  // separate page to answer "when was I invited, and did they cancel?".
  const system = interviewsFor(a.id).map(systemEntry);
  const items = [...messages, ...system].sort((x, y) => (x.at === y.at ? 0 : x.at < y.at ? -1 : 1));
  markRead(req.user.id, a.id); // reading the thread is what "read" means
  res.json({
    items,
    you: side,
    canReply: side === 'EMPLOYER' ? a.status !== 'WITHDRAWN' : messages.some((m) => m.from === 'EMPLOYER') && a.status !== 'WITHDRAWN',
  });
}));

interviewsRouter.post('/applications/:id/messages', authenticate, requireRole('STUDENT', 'EMPLOYER'), wrap(async (req, res) => {
  const { a, side } = accessible(req, req.params.id);
  const b = parse(z.object({ body: z.string().trim().min(1, 'write a message').max(2000) }).strict(), req.body);
  if (a.status === 'WITHDRAWN') throw conflict('This application was withdrawn');
  const prior = db.prepare('SELECT sender_role FROM application_messages WHERE application_id = ?').all(a.id);
  if (side === 'STUDENT' && !prior.some((m) => m.sender_role === 'EMPLOYER')) throw forbidden('You can reply once the employer has written to you', 'EMPLOYER_MUST_START');
  const recent = db.prepare("SELECT COUNT(*) n FROM application_messages WHERE sender_id = ? AND created_at >= datetime('now','-1 hour')").get(req.user.id).n;
  if (recent >= 20) throw new HttpError(429, 'RATE_LIMITED', 'Too many messages this hour. Please wait a little.');
  const id = Number(db.prepare('INSERT INTO application_messages (application_id, sender_id, sender_role, body) VALUES (?,?,?,?)').run(a.id, req.user.id, side, b.body).lastInsertRowid);
  invalidateReplyStats(a.employer_id);
  const preview = b.body.length > 140 ? `${b.body.slice(0, 137)}...` : b.body;
  if (side === 'EMPLOYER') notify(a.student_id, 'message_received', `${a.company_name || 'An employer'} sent you a message`, `About ${a.title}: ${preview}`, `#/student/messages?thread=${a.id}`);
  else notify(a.employer_id, 'message_received', `${a.student_name || 'A candidate'} replied`, `About ${a.title}: ${preview}`, `#/employer/messages?thread=${a.id}`);
  res.status(201).json({ message: msgOut(db.prepare('SELECT * FROM application_messages WHERE id = ?').get(id)) });
}));
