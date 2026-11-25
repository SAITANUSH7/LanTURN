import { db } from './db.js';

/** Record a privileged action. Never throws: an audit failure must not fail the action it describes. */
export function audit(actorId, action, target = '', meta = {}) {
  try {
    db.prepare('INSERT INTO audit_log (actor_id, action, target, meta) VALUES (?,?,?,?)')
      .run(actorId ?? null, String(action).slice(0, 80), String(target ?? '').slice(0, 120), JSON.stringify(meta ?? {}).slice(0, 2000));
  } catch { /* best effort */ }
}

export const recentAudit = (limit = 100) =>
  db.prepare(`SELECT a.id, a.action, a.target, a.meta, a.created_at AS createdAt, a.actor_id AS actorId, u.email AS actorEmail
    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ?`).all(Math.min(500, Math.max(1, Number(limit) || 100)));
