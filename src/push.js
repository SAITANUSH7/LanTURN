// Web Push (browser alerts). Off unless VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set. Generate a pair with:
//   npx web-push generate-vapid-keys
import webpush from 'web-push';
import { db } from './db.js';
import { registerTask, enqueue } from './queue.js';

const PUSHED = new Set(['application_received', 'application_status', 'interview_scheduled', 'interview_cancelled', 'message_received']);
let sender = (sub, payload, opts) => webpush.sendNotification(sub, payload, opts);
export const __setPushSender = (fn) => { sender = fn || ((sub, payload, opts) => webpush.sendNotification(sub, payload, opts)); };

export const pushEnabled = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || '';
const subject = () => process.env.VAPID_SUBJECT || (process.env.EMAIL_FROM ? `mailto:${process.env.EMAIL_FROM.replace(/^.*<|>.*$/g, '')}` : (process.env.PUBLIC_URL || 'https://example.com'));
const details = () => ({ vapidDetails: { subject: subject(), publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } });

export const subscriptionCount = (userId) => db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?').get(userId).n;

/** Called from notify(). Cheap; the network call happens in the queue. Never throws. */
export function maybePush(userId, type, title, body, link) {
  try {
    if (!pushEnabled() || !PUSHED.has(type) || !subscriptionCount(userId)) return;
    enqueue('push.send', { userId, title, body: String(body || '').slice(0, 140), link }, { userId, maxAttempts: 3 });
  } catch { /* best effort */ }
}

registerTask('push.send', async ({ userId, title, body, link }) => {
  if (!pushEnabled()) return { skipped: 'push not configured' };
  const subs = db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId);
  const payload = JSON.stringify({ title, body, link: link || '' });
  let sent = 0; let removed = 0; let transient = null;
  for (const s of subs) {
    try {
      await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'normal', ...details() });
      db.prepare("UPDATE push_subscriptions SET last_ok_at = datetime('now') WHERE id = ?").run(s.id);
      sent += 1;
    } catch (e) {
      // 404/410: the browser dropped this subscription for good. Anything else may pass, so let the queue retry.
      if (e?.statusCode === 404 || e?.statusCode === 410) { db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id); removed += 1; } else transient = e;
    }
  }
  if (transient && !sent) throw transient;
  return { sent, removed };
});
