import { db } from './db.js';
import { emitToUser } from './realtime.js';
import { maybeEmail } from './email.js';

/** Create an in-app notification. Never throws: a failed notification must not fail the action that caused it. */
export function notify(userId, type, title, body = '', link = '') {
  deliver(userId, type, title, body, link);
  // An employer account's alerts reach every member of its hiring team too.
  try { for (const m of db.prepare('SELECT id FROM users WHERE team_owner_id = ?').all(userId)) deliver(m.id, type, title, body, link); } catch { /* best effort */ }
}

function deliver(userId, type, title, body, link) {
  try {
    const id = db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)')
      .run(userId, type, title.slice(0, 160), body.slice(0, 400), link.slice(0, 160)).lastInsertRowid;
    emitToUser(userId, 'notification', { id: Number(id), type, title, body, link, read: false, createdAt: new Date().toISOString() });
    maybeEmail(userId, type, title, body, link);
  } catch { /* best effort */ }
}
