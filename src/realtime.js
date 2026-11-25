import crypto from 'node:crypto';
import { Router } from 'express';
import { authenticate } from './auth.js';
import { wrap } from './util.js';

export const realtimeRouter = Router();

// In-memory active SSE client connections: Map<userId, Set<Response>>
const clients = new Map();

// EventSource cannot send an Authorization header, and the refresh cookie is scoped to /api/auth on purpose. So the
// client trades its bearer token for a single-use ticket that lives for a minute and only opens this one stream.
const tickets = new Map(); // ticket -> { userId, exp }
const TICKET_MS = 60_000;

export function issueTicket(userId) {
  const t = crypto.randomBytes(24).toString('base64url');
  tickets.set(t, { userId: Number(userId), exp: Date.now() + TICKET_MS });
  const timer = setTimeout(() => tickets.delete(t), TICKET_MS);
  timer.unref?.();
  return t;
}

function consumeTicket(t) {
  const rec = tickets.get(String(t || ''));
  if (!rec) return null;
  tickets.delete(String(t)); // single use: a leaked ticket is worthless
  return rec.exp > Date.now() ? rec.userId : null;
}

realtimeRouter.post('/realtime/ticket', authenticate, wrap(async (req, res) => {
  res.json({ ticket: issueTicket(req.user.id), expiresIn: TICKET_MS / 1000 });
}));

export function emitToUser(userId, event, data) {
  const userClients = clients.get(Number(userId));
  if (!userClients || userClients.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of userClients) {
    try {
      res.write(payload);
    } catch {
      userClients.delete(res);
    }
  }
}

const streamAuth = (req, res, next) => {
  const fromTicket = req.query.ticket ? consumeTicket(req.query.ticket) : null;
  if (fromTicket) { req.user = { id: fromTicket }; return next(); }
  return authenticate(req, res, next);
};

realtimeRouter.get('/realtime/stream', streamAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering

  // Send initial handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ userId: req.user.id, time: new Date().toISOString() })}\n\n`);

  const userId = Number(req.user.id);
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId).add(res);

  // Keep-alive heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const userClients = clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) clients.delete(userId);
    }
    res.end();
  });
});
