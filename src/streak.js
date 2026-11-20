// Daily activity streak. A day counts when the student did at least one real action (apply, ATS check, interview answer, resume upload).
// Days are calendar days in APP_TZ_OFFSET_MIN (default 330 = India), so "today" matches what the student sees on their clock.
import { db } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS daily_actions (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY (user_id, day, kind))`);

const offsetMin = () => Number(process.env.APP_TZ_OFFSET_MIN ?? 330);
export const dayOf = (ms = Date.now()) => new Date(ms + offsetMin() * 60000).toISOString().slice(0, 10);

export function recordAction(userId, kind, ms = Date.now()) {
  try { db.prepare('INSERT OR IGNORE INTO daily_actions (user_id, day, kind) VALUES (?,?,?)').run(userId, dayOf(ms), kind); } catch { /* best effort */ }
}

export function streakFor(userId, ms = Date.now()) {
  const days = db.prepare('SELECT DISTINCT day FROM daily_actions WHERE user_id = ? ORDER BY day DESC').all(userId).map((r) => r.day);
  const set = new Set(days);
  const today = dayOf(ms);
  const prev = (d) => dayOf(Date.parse(`${d}T12:00:00Z`) - 86400000 + offsetMin() * 60000 - offsetMin() * 60000);
  const doneToday = set.has(today);
  // The streak is still alive if the last active day was yesterday: today is not over yet.
  let cursor = doneToday ? today : prev(today);
  let current = 0;
  while (set.has(cursor)) { current += 1; cursor = prev(cursor); }
  let best = 0; let run = 0; let last = null;
  for (const d of [...days].reverse()) { run = last && prev(d) === last ? run + 1 : 1; best = Math.max(best, run); last = d; }
  return { current, best, doneToday, activeDays: days.length, today, todayKinds: db.prepare('SELECT kind FROM daily_actions WHERE user_id = ? AND day = ?').all(userId, today).map((r) => r.kind) };
}
