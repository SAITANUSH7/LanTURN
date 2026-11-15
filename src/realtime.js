import { Router } from 'express';
import { authenticate } from './auth.js';

export const realtimeRouter = Router();

// In-memory active SSE client connections: Map<userId, Set<Response>>
const clients = new Map();

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

realtimeRouter.get('/realtime/stream', authenticate, (req, res) => {
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
