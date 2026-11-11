import { db } from './db.js';

/** Create an in-app notification. Never throws: a failed notification must not fail the action that caused it. */
export function notify(userId, type, title, body = '', link = '') {
  try {
    db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)').run(userId, type, title.slice(0, 160), body.slice(0, 400), link.slice(0, 160));
  } catch { /* best effort */ }
}
