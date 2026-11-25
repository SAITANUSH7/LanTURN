import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { notFound, conflict, bad, parse, wrap } from '../util.js';
import { authenticate, requireRole, requireVerifiedEmployer } from '../auth.js';
import { audit } from '../audit.js';
import { notify } from '../notify.js';
import { idParam } from './common.js';

export const drivesRouter = Router();

const DriveSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(3000).default(''),
  driveDate: z.string().trim().min(4).max(60),
  venue: z.string().trim().max(160).default('Campus Auditorium / Virtual'),
  eligibility: z.string().trim().max(160).default('All Branches (Min. 6.5 CGPA)'),
  packageDetails: z.string().trim().max(120).default('As per company standards'),
}).strict();

function driveOut(r, userId = null) {
  const regCount = db.prepare('SELECT COUNT(*) as n FROM drive_registrations WHERE drive_id = ?').get(r.id)?.n || 0;
  let isRegistered = false;
  let registrationStatus = null;

  if (userId) {
    const reg = db.prepare('SELECT status FROM drive_registrations WHERE drive_id = ? AND student_id = ?').get(r.id, userId);
    if (reg) {
      isRegistered = true;
      registrationStatus = reg.status;
    }
  }

  return {
    id: r.id,
    companyName: r.company_name,
    title: r.title,
    description: r.description,
    driveDate: r.drive_date,
    venue: r.venue,
    eligibility: r.eligibility,
    packageDetails: r.package_details,
    status: r.status,
    registeredCount: regCount,
    isRegistered,
    registrationStatus,
    createdAt: r.created_at,
  };
}

// Admins can also publish a campus-wide drive.
drivesRouter.post('/admin/drives', authenticate, requireRole('ADMIN'), wrap(async (req, res) => {
  const b = parse(DriveSchema, req.body);
  const id = Number(db.prepare(`INSERT INTO placement_drives (company_name, title, description, drive_date, venue, eligibility, package_details, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(b.companyName, b.title, b.description, b.driveDate, b.venue, b.eligibility, b.packageDetails, req.user.id).lastInsertRowid);
  audit(req.user.id, 'drive.create', `drive:${id}`, { title: b.title });
  res.status(201).json(driveOut(db.prepare('SELECT * FROM placement_drives WHERE id = ?').get(id), req.user.id));
}));

// List all upcoming/active placement drives
drivesRouter.get('/drives', authenticate, wrap(async (req, res) => {
  const rows = db.prepare('SELECT * FROM placement_drives ORDER BY drive_date ASC, id DESC').all();
  res.json({ items: rows.map((r) => driveOut(r, req.user.id)) });
}));

// Create a placement drive (verified employers and admins)
drivesRouter.post('/drives', authenticate, requireRole('EMPLOYER'), requireVerifiedEmployer, wrap(async (req, res) => {
  const b = parse(DriveSchema, req.body);
  const id = Number(
    db.prepare(`
      INSERT INTO placement_drives (company_name, title, description, drive_date, venue, eligibility, package_details, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(b.companyName, b.title, b.description, b.driveDate, b.venue, b.eligibility, b.packageDetails, req.user.id).lastInsertRowid
  );

  res.status(201).json(driveOut(db.prepare('SELECT * FROM placement_drives WHERE id = ?').get(id), req.user.id));
}));

// Single drive detail
drivesRouter.get('/drives/:id', authenticate, wrap(async (req, res) => {
  const r = db.prepare('SELECT * FROM placement_drives WHERE id = ?').get(idParam(req.params.id));
  if (!r) throw notFound('Placement drive not found');
  res.json(driveOut(r, req.user.id));
}));

// Student registers for a drive
drivesRouter.post('/drives/:id/register', authenticate, requireRole('STUDENT'), wrap(async (req, res) => {
  const driveId = idParam(req.params.id);
  const drive = db.prepare('SELECT id, status, drive_date FROM placement_drives WHERE id = ?').get(driveId);
  if (!drive) throw notFound('Placement drive not found');
  if (drive.status === 'CANCELLED' || drive.status === 'COMPLETED') {
    throw bad(`Cannot register: drive is ${drive.status.toLowerCase()}`);
  }
  // drive_date is free text on purpose ("12-14 March"), so only reject a clearly past ISO date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(drive.drive_date) && drive.drive_date < new Date().toISOString().slice(0, 10)) {
    throw bad('Registration closed: this drive has already taken place');
  }

  const existing = db.prepare('SELECT id FROM drive_registrations WHERE drive_id = ? AND student_id = ?').get(driveId, req.user.id);
  if (existing) {
    throw conflict('You are already registered for this placement drive', 'ALREADY_REGISTERED');
  }

  db.prepare('INSERT INTO drive_registrations (drive_id, student_id) VALUES (?, ?)').run(driveId, req.user.id);
  res.status(201).json({ driveId, isRegistered: true, status: 'REGISTERED' });
}));

// Student cancels registration
drivesRouter.delete('/drives/:id/register', authenticate, requireRole('STUDENT'), wrap(async (req, res) => {
  const driveId = idParam(req.params.id);
  db.prepare('DELETE FROM drive_registrations WHERE drive_id = ? AND student_id = ?').run(driveId, req.user.id);
  res.json({ driveId, isRegistered: false });
}));

// Student views registered drives
drivesRouter.get('/drives/my/registrations', authenticate, requireRole('STUDENT'), wrap(async (req, res) => {
  const rows = db.prepare(`
    SELECT pd.*, dr.status as reg_status, dr.registered_at
    FROM placement_drives pd
    JOIN drive_registrations dr ON dr.drive_id = pd.id
    WHERE dr.student_id = ?
    ORDER BY pd.drive_date ASC
  `).all(req.user.id);

  res.json({
    items: rows.map((r) => ({
      ...driveOut(r, req.user.id),
      registeredAt: r.registered_at,
    })),
  });
}));

// ---- Drive lifecycle: the creator (or an admin) moves it along, and can see who signed up ----
const DRIVE_STATUSES = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'];
const DRIVE_FLOW = { UPCOMING: ['ONGOING', 'CANCELLED'], ONGOING: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: ['UPCOMING'] };

function ownedDrive(req, rawId) {
  const d = db.prepare('SELECT * FROM placement_drives WHERE id = ?').get(idParam(rawId));
  if (!d) throw notFound('Placement drive not found');
  if (req.user.role !== 'ADMIN' && d.created_by !== req.user.id) throw notFound('Placement drive not found');
  return d;
}

drivesRouter.patch('/drives/:id', authenticate, requireRole('EMPLOYER', 'ADMIN'), wrap(async (req, res) => {
  const d = ownedDrive(req, req.params.id);
  const b = parse(z.object({ status: z.enum(DRIVE_STATUSES).optional(), title: z.string().trim().min(2).max(120).optional(), description: z.string().trim().max(3000).optional(), driveDate: z.string().trim().min(4).max(60).optional(), venue: z.string().trim().max(160).optional(), eligibility: z.string().trim().max(160).optional(), packageDetails: z.string().trim().max(120).optional() }).strict(), req.body ?? {});
  if (b.status && b.status !== d.status && !DRIVE_FLOW[d.status].includes(b.status)) {
    throw conflict(`Cannot move a drive from ${d.status.toLowerCase()} to ${b.status.toLowerCase()}`, 'INVALID_TRANSITION');
  }
  const next = { ...d, ...(b.title ? { title: b.title } : {}), ...(b.description !== undefined ? { description: b.description } : {}), ...(b.driveDate ? { drive_date: b.driveDate } : {}), ...(b.venue ? { venue: b.venue } : {}), ...(b.eligibility ? { eligibility: b.eligibility } : {}), ...(b.packageDetails ? { package_details: b.packageDetails } : {}), ...(b.status ? { status: b.status } : {}) };
  db.prepare('UPDATE placement_drives SET title=?, description=?, drive_date=?, venue=?, eligibility=?, package_details=?, status=? WHERE id=?')
    .run(next.title, next.description, next.drive_date, next.venue, next.eligibility, next.package_details, next.status, d.id);
  if (b.status && b.status !== d.status) {
    audit(req.user.id, 'drive.status', `drive:${d.id}`, { from: d.status, to: b.status });
    for (const r of db.prepare('SELECT student_id FROM drive_registrations WHERE drive_id = ?').all(d.id)) {
      notify(r.student_id, 'drive_update', `${d.title}: ${b.status.toLowerCase()}`, `${d.company_name} updated this placement drive to ${b.status.toLowerCase()}.`, '#/student/drives');
    }
  }
  res.json(driveOut(db.prepare('SELECT * FROM placement_drives WHERE id = ?').get(d.id), req.user.id));
}));

drivesRouter.get('/drives/:id/registrations', authenticate, requireRole('EMPLOYER', 'ADMIN'), wrap(async (req, res) => {
  const d = ownedDrive(req, req.params.id);
  const rows = db.prepare(`SELECT r.id, r.status, r.registered_at, p.full_name, p.college, p.degree, p.branch, p.graduation_year, u.email
    FROM drive_registrations r JOIN users u ON u.id = r.student_id LEFT JOIN student_profiles p ON p.user_id = r.student_id
    WHERE r.drive_id = ? ORDER BY r.registered_at`).all(d.id);
  const counts = Object.fromEntries(['REGISTERED', 'ATTENDED', 'SHORTLISTED', 'ABSENT'].map((st) => [st, rows.filter((r) => r.status === st).length]));
  res.json({ drive: { id: d.id, title: d.title, status: d.status, driveDate: d.drive_date }, counts, items: rows });
}));

// Attendance is recorded by the drive owner: REGISTERED -> ATTENDED / SHORTLISTED / ABSENT.
drivesRouter.patch('/drives/:id/registrations/:regId', authenticate, requireRole('EMPLOYER', 'ADMIN'), wrap(async (req, res) => {
  const d = ownedDrive(req, req.params.id);
  const b = parse(z.object({ status: z.enum(['REGISTERED', 'ATTENDED', 'SHORTLISTED', 'ABSENT']) }).strict(), req.body ?? {});
  const reg = db.prepare('SELECT * FROM drive_registrations WHERE id = ? AND drive_id = ?').get(idParam(req.params.regId), d.id);
  if (!reg) throw notFound('Registration not found');
  db.prepare('UPDATE drive_registrations SET status = ? WHERE id = ?').run(b.status, reg.id);
  notify(reg.student_id, 'drive_update', `${d.title}: ${b.status.toLowerCase()}`, `${d.company_name} marked you ${b.status.toLowerCase()} for this placement drive.`, '#/student/drives');
  res.json({ id: reg.id, status: b.status });
}));
