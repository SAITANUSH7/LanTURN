#!/usr/bin/env node
// One-shot admin password reset. Runs against the same SQLite DB the server uses.
// Usage on Railway (or anywhere the app is deployed):
//   node scripts/reset-admin.mjs <newPassword>
//   node scripts/reset-admin.mjs            # reads ADMIN_PASSWORD from env, or falls back to prompt
// If the admin row does not exist yet, it is created with role=ADMIN, verification=VERIFIED.
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { db } from '../src/db.js';

const newPassword = process.argv[2] || config.adminPassword;
if (!newPassword || newPassword.length < 8) {
  console.error('Aborting: password must be at least 8 characters.');
  console.error('Usage: node scripts/reset-admin.mjs <newPassword>');
  process.exit(1);
}

const email = config.adminEmail;
const hash = bcrypt.hashSync(newPassword, 10);
const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

if (row) {
  db.prepare('UPDATE users SET password_hash = ?, role = ?, verification = ? WHERE id = ?')
    .run(hash, 'ADMIN', 'VERIFIED', row.id);
  console.log(`Admin password updated for ${email} (user id ${row.id}).`);
} else {
  const id = Number(db.prepare("INSERT INTO users (email, password_hash, role, verification) VALUES (?,?, 'ADMIN', 'VERIFIED')")
    .run(email, hash).lastInsertRowid);
  console.log(`Admin created for ${email} (user id ${id}).`);
}
console.log('You can now log in with this password. No restart needed.');
console.log('');
console.log('IMPORTANT: the ADMIN_PASSWORD env var is authoritative on every boot.');
console.log('If it does not match the password you just set, the next server restart will revert it.');
console.log('To make this permanent, also set ADMIN_PASSWORD in your Railway Variables to the same value.');
