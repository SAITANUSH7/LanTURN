// Transactional email over an HTTP API (Resend-compatible). Nothing here runs unless EMAIL_API_KEY and EMAIL_FROM are set.
// Flow: notify() -> maybeEmail() -> durable queue task 'email.send' (retries with backoff) -> provider API.
// A user can switch emails off in settings or with the unsubscribe link in every message.
import crypto from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';
import { registerTask, enqueue } from './queue.js';
import { allow, success, failure } from './ai/breaker.js';

let fetchImpl = (...a) => fetch(...a);
export const __setEmailFetch = (fn) => { fetchImpl = fn || ((...a) => fetch(...a)); };
export const emailEnabled = () => Boolean(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);
const apiUrl = () => process.env.EMAIL_API_URL || 'https://api.resend.com/emails';
export const publicUrl = () => (process.env.PUBLIC_URL || `http://localhost:${config.port || 3000}`).replace(/\/$/, '');

// Only these notification types become emails. Chat, connection and comment noise stays in-app.
const EMAILED = new Set(['application_status', 'application_received', 'strong_applicant', 'job_match', 'job_removed', 'interview_scheduled', 'interview_cancelled', 'message_received']);
const DAILY_CAP = { job_match: 3, message_received: 5 };

db.exec(`CREATE TABLE IF NOT EXISTS email_prefs (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id, type, created_at);`);

export const prefsFor = (userId) => ({ enabled: (db.prepare('SELECT enabled FROM email_prefs WHERE user_id = ?').get(userId)?.enabled ?? 1) === 1, available: emailEnabled() });
export const setPrefs = (userId, enabled) => db.prepare('INSERT INTO email_prefs (user_id, enabled) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled').run(userId, enabled ? 1 : 0);

export const unsubToken = (userId) => crypto.createHmac('sha256', config.accessSecret).update(`unsub:${userId}`).digest('hex').slice(0, 32);
export const checkUnsubToken = (userId, t) => { const a = Buffer.from(unsubToken(userId)); const b = Buffer.from(String(t)); return a.length === b.length && crypto.timingSafeEqual(a, b); };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderEmail({ title, body, link, userId }) {
  const open = link ? `${publicUrl()}/${link.startsWith('#') ? link : `#${link}`}` : publicUrl();
  const unsub = `${publicUrl()}/api/email/unsubscribe?u=${userId}&t=${unsubToken(userId)}`;
  const text = `${title}\n\n${body}\n\nOpen: ${open}\n\nStop these emails: ${unsub}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto"><h2 style="margin:0 0 12px">${esc(title)}</h2><p>${esc(body)}</p><p><a href="${esc(open)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open LanTURN</a></p><p style="color:#888;font-size:12px"><a href="${esc(unsub)}">Stop these emails</a></p></div>`;
  return { text, html, unsub };
}

export async function sendEmail({ to, subject, text, html, unsub }) {
  if (!emailEnabled()) throw new Error('Email is not configured');
  allow('email');
  try {
    const res = await fetchImpl(apiUrl(), {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.EMAIL_API_KEY}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html, headers: unsub ? { 'List-Unsubscribe': `<${unsub}>` } : undefined }),
    });
    if (!res.ok) throw new Error(`email provider HTTP ${res.status}`);
    success('email');
  } catch (e) { failure('email'); throw e; }
}

/** Called from notify(). Cheap checks only; the actual send happens in the queue. Never throws. */
export function maybeEmail(userId, type, title, body, link) {
  try {
    if (!emailEnabled() || !EMAILED.has(type) || !prefsFor(userId).enabled) return;
    const cap = DAILY_CAP[type];
    if (cap && db.prepare("SELECT COUNT(*) n FROM email_log WHERE user_id = ? AND type = ? AND status = 'sent' AND created_at >= datetime('now','-1 day')").get(userId, type).n >= cap) return;
    enqueue('email.send', { userId, type, title, body, link }, { userId, maxAttempts: 5 });
  } catch { /* best effort */ }
}

/** Invitation to join an employer's hiring team. Sent only when email is configured; the owner can always copy the link instead. */
export function emailInvite(to, company, link) {
  if (!emailEnabled()) return false;
  enqueue('email.invite', { to, company, link }, { maxAttempts: 4 });
  return true;
}
registerTask('email.invite', async ({ to, company, link }) => {
  const text = `${company} invited you to join their hiring team on LanTURN.\n\nAccept the invitation: ${link}\n\nThe link works for 7 days. If you did not expect this, ignore this email.`;
  const html = `<p><strong>${company.replace(/[<>&]/g, '')}</strong> invited you to join their hiring team on LanTURN.</p><p><a href="${link}">Accept the invitation</a></p><p style="color:#666">The link works for 7 days. If you did not expect this, ignore this email.</p>`;
  await sendEmail({ to, subject: `${company} invited you to LanTURN`, text, html });
  return { sent: true };
});

registerTask('email.send', async ({ userId, type, title, body, link }) => {
  if (!prefsFor(userId).enabled) return { skipped: 'opted out' };
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
  if (!u) return { skipped: 'no user' };
  const { text, html, unsub } = renderEmail({ title, body, link, userId });
  try {
    await sendEmail({ to: u.email, subject: title, text, html, unsub });
    db.prepare("INSERT INTO email_log (user_id, type, status) VALUES (?,?,'sent')").run(userId, type);
    return { sent: true };
  } catch (e) {
    db.prepare("INSERT INTO email_log (user_id, type, status, error) VALUES (?,?,'failed',?)").run(userId, type, String(e.message).slice(0, 200));
    throw e; // let the queue retry with backoff
  }
});
