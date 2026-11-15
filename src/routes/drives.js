import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { notFound, conflict, bad, parse, wrap } from '../util.js';
import { authenticate, requireRole } from '../auth.js';
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

// List all upcoming/active placement drives
drivesRouter.get('/drives', authenticate, wrap(async (req, res) => {
  const rows = db.prepare('SELECT * FROM placement_drives ORDER BY drive_date ASC, id DESC').all();
  res.json({ items: rows.map((r) => driveOut(r, req.user.id)) });
}));

// Create a placement drive (Employers and Admins)
drivesRouter.post('/drives', authenticate, requireRole('EMPLOYER', 'ADMIN'), wrap(async (req, res) => {
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
  const drive = db.prepare('SELECT id, status FROM placement_drives WHERE id = ?').get(driveId);
  if (!drive) throw notFound('Placement drive not found');
  if (drive.status === 'CANCELLED' || drive.status === 'COMPLETED') {
    throw bad(`Cannot register: drive is ${drive.status.toLowerCase()}`);
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
