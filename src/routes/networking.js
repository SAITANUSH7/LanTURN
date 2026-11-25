import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { HttpError, notFound, conflict, bad, parse, wrap, page } from '../util.js';
import { authenticate } from '../auth.js';
import { notify } from '../notify.js';
import { emitToUser } from '../realtime.js';
import { idParam } from './common.js';

export const networkingRouter = Router();
const auth = [authenticate];

function userSummary(userId) {
  const u = db.prepare('SELECT id, email, role, verification FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  let name = '';
  let headline = '';
  if (u.role === 'STUDENT') {
    const p = db.prepare('SELECT full_name, college, degree, branch FROM student_profiles WHERE user_id = ?').get(userId);
    name = p?.full_name || u.email.split('@')[0];
    headline = [p?.degree, p?.branch, p?.college].filter(Boolean).join(' · ');
  } else if (u.role === 'EMPLOYER') {
    const p = db.prepare('SELECT company_name, industry, location FROM employer_profiles WHERE user_id = ?').get(userId);
    name = p?.company_name || u.email.split('@')[0];
    headline = [p?.industry, p?.location].filter(Boolean).join(' · ');
  } else {
    name = 'LanTURN Admin';
    headline = 'Platform Administrator';
  }
  // Deliberately no email: it is shown on the feed, in connections and in DM lists to every signed-in user.
  // Contact happens through LanTURN's own messaging.
  return { id: u.id, name, role: u.role, headline };
}

// ==========================================
// 1. Connections & Networking
// ==========================================

// Get user's connections and pending requests
networkingRouter.get('/networking/connections', ...auth, wrap(async (req, res) => {
  const myId = req.user.id;
  const accepted = db.prepare(`
    SELECT id, requester_id, recipient_id, created_at, updated_at
    FROM connections
    WHERE (requester_id = ? OR recipient_id = ?) AND status = 'ACCEPTED'
    ORDER BY updated_at DESC
  `).all(myId, myId);

  const pendingIncoming = db.prepare(`
    SELECT id, requester_id, recipient_id, created_at
    FROM connections
    WHERE recipient_id = ? AND status = 'PENDING'
    ORDER BY created_at DESC
  `).all(myId);

  const pendingOutgoing = db.prepare(`
    SELECT id, requester_id, recipient_id, created_at
    FROM connections
    WHERE requester_id = ? AND status = 'PENDING'
    ORDER BY created_at DESC
  `).all(myId);

  res.json({
    connections: accepted.map((c) => {
      const peerId = c.requester_id === myId ? c.recipient_id : c.requester_id;
      return { id: c.id, peer: userSummary(peerId), connectedAt: c.updated_at };
    }),
    incomingRequests: pendingIncoming.map((c) => ({
      id: c.id,
      requester: userSummary(c.requester_id),
      requestedAt: c.created_at,
    })),
    outgoingRequests: pendingOutgoing.map((c) => ({
      id: c.id,
      recipient: userSummary(c.recipient_id),
      requestedAt: c.created_at,
    })),
  });
}));

// Send a connection request
networkingRouter.post('/networking/connect/:userId', ...auth, wrap(async (req, res) => {
  const targetId = idParam(req.params.userId);
  if (targetId <= 0 || targetId === req.user.id) throw bad('Invalid recipient');
  const target = db.prepare('SELECT id, role, verification FROM users WHERE id = ?').get(targetId);
  if (!target || target.verification === 'REJECTED') throw notFound('User not found');

  const existing = db.prepare(`
    SELECT * FROM connections
    WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)
  `).get(req.user.id, targetId, targetId, req.user.id);

  if (existing) {
    if (existing.status === 'ACCEPTED') throw conflict('You are already connected with this user', 'ALREADY_CONNECTED');
    if (existing.status === 'PENDING') throw conflict('A connection request is already pending', 'REQUEST_PENDING');
    // If previously rejected, allow re-requesting by updating
    db.prepare("UPDATE connections SET requester_id = ?, recipient_id = ?, status = 'PENDING', updated_at = datetime('now') WHERE id = ?")
      .run(req.user.id, targetId, existing.id);
  } else {
    db.prepare('INSERT INTO connections (requester_id, recipient_id, status) VALUES (?, ?, ?)')
      .run(req.user.id, targetId, 'PENDING');
  }

  const sender = userSummary(req.user.id);
  notify(targetId, 'connection_request', `New connection request from ${sender.name}`, `${sender.name} (${sender.headline || sender.role}) wants to connect with you.`, '#/networking');
  res.status(201).json({ ok: true, message: 'Connection request sent' });
}));

// Accept connection request
networkingRouter.post('/networking/requests/:id/accept', ...auth, wrap(async (req, res) => {
  const connId = idParam(req.params.id);
  const conn = db.prepare("SELECT * FROM connections WHERE id = ? AND recipient_id = ? AND status = 'PENDING'").get(connId, req.user.id);
  if (!conn) throw notFound('Connection request not found');

  db.prepare("UPDATE connections SET status = 'ACCEPTED', updated_at = datetime('now') WHERE id = ?").run(conn.id);
  const me = userSummary(req.user.id);
  notify(conn.requester_id, 'connection_accepted', `${me.name} accepted your connection`, `You and ${me.name} are now connected on LanTURN.`, '#/networking');

  res.json({ ok: true, status: 'ACCEPTED' });
}));

// Reject connection request
networkingRouter.post('/networking/requests/:id/reject', ...auth, wrap(async (req, res) => {
  const connId = idParam(req.params.id);
  const conn = db.prepare("SELECT * FROM connections WHERE id = ? AND recipient_id = ? AND status = 'PENDING'").get(connId, req.user.id);
  if (!conn) throw notFound('Connection request not found');

  db.prepare("UPDATE connections SET status = 'REJECTED', updated_at = datetime('now') WHERE id = ?").run(conn.id);
  res.json({ ok: true, status: 'REJECTED' });
}));

// Remove connection
networkingRouter.delete('/networking/connections/:id', ...auth, wrap(async (req, res) => {
  const connId = idParam(req.params.id);
  const conn = db.prepare('SELECT * FROM connections WHERE id = ? AND (requester_id = ? OR recipient_id = ?)').get(connId, req.user.id, req.user.id);
  if (!conn) throw notFound('Connection not found');

  db.prepare('DELETE FROM connections WHERE id = ?').run(conn.id);
  res.json({ ok: true });
}));

// ==========================================
// 2. Feed & Community Posts
// ==========================================

const CreatePostSchema = z.object({
  content: z.string().trim().min(1, 'Post content cannot be empty').max(3000),
  mediaUrl: z.string().trim().max(500).default(''),
  postType: z.enum(['UPDATE', 'ACHIEVEMENT', 'PROJECT', 'QUESTION']).default('UPDATE'),
}).strict();

// Get community feed
networkingRouter.get('/networking/feed', ...auth, wrap(async (req, res) => {
  const { pageSize, offset, page: p } = page(req.query);
  const rows = db.prepare(`
    SELECT p.*,
      EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS is_liked
    FROM posts p
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, pageSize, offset);

  const total = db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;

  const items = rows.map((post) => ({
    id: post.id,
    content: post.content,
    mediaUrl: post.media_url,
    postType: post.post_type,
    likesCount: post.likes_count,
    commentsCount: post.comments_count,
    isLiked: Boolean(post.is_liked),
    createdAt: post.created_at,
    author: userSummary(post.author_id),
  }));

  res.json({ items, total, page: p, pageSize });
}));

// Create a post
networkingRouter.post('/networking/posts', ...auth, wrap(async (req, res) => {
  const b = parse(CreatePostSchema, req.body);
  const id = Number(
    db.prepare('INSERT INTO posts (author_id, content, media_url, post_type) VALUES (?, ?, ?, ?)')
      .run(req.user.id, b.content, b.mediaUrl, b.postType).lastInsertRowid
  );

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  res.status(201).json({
    id: post.id,
    content: post.content,
    mediaUrl: post.media_url,
    postType: post.post_type,
    likesCount: 0,
    commentsCount: 0,
    isLiked: false,
    createdAt: post.created_at,
    author: userSummary(post.author_id),
  });
}));

// Delete a post: the author, or an admin moderating the feed.
networkingRouter.delete('/networking/posts/:id', ...auth, wrap(async (req, res) => {
  const post = db.prepare('SELECT id, author_id FROM posts WHERE id = ?').get(idParam(req.params.id));
  if (!post) throw notFound('Post not found');
  if (post.author_id !== req.user.id && req.user.role !== 'ADMIN') throw notFound('Post not found');
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  res.json({ ok: true });
}));

// Like / unlike post
networkingRouter.post('/networking/posts/:id/like', ...auth, wrap(async (req, res) => {
  const postId = idParam(req.params.id);
  const post = db.prepare('SELECT id, author_id FROM posts WHERE id = ?').get(postId);
  if (!post) throw notFound('Post not found');

  const existing = db.prepare('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?').get(req.user.id, postId);

  tx(() => {
    if (existing) {
      db.prepare('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?').run(req.user.id, postId);
      db.prepare('UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(postId);
    } else {
      db.prepare('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)').run(req.user.id, postId);
      db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').run(postId);
    }
  });

  const updated = db.prepare('SELECT likes_count FROM posts WHERE id = ?').get(postId);
  res.json({ ok: true, isLiked: !existing, likesCount: updated.likes_count });
}));

// Get comments for a post
networkingRouter.get('/networking/posts/:id/comments', ...auth, wrap(async (req, res) => {
  const postId = idParam(req.params.id);
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(postId)) throw notFound('Post not found');
  const rows = db.prepare('SELECT * FROM post_comments WHERE post_id = ? ORDER BY id ASC').all(postId);
  res.json({
    items: rows.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.created_at,
      author: userSummary(c.author_id),
    })),
  });
}));

// Add comment to post
networkingRouter.post('/networking/posts/:id/comments', ...auth, wrap(async (req, res) => {
  const postId = idParam(req.params.id);
  const post = db.prepare('SELECT id, author_id FROM posts WHERE id = ?').get(postId);
  if (!post) throw notFound('Post not found');

  const { content } = parse(z.object({ content: z.string().trim().min(1).max(1000) }).strict(), req.body);

  const commentId = tx(() => {
    const cid = Number(db.prepare('INSERT INTO post_comments (post_id, author_id, content) VALUES (?, ?, ?)').run(postId, req.user.id, content).lastInsertRowid);
    db.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').run(postId);
    return cid;
  });

  if (post.author_id !== req.user.id) {
    const sender = userSummary(req.user.id);
    notify(post.author_id, 'post_comment', `${sender.name} commented on your post`, content.slice(0, 100), '#/networking');
  }

  res.status(201).json({
    id: commentId,
    content,
    createdAt: new Date().toISOString(),
    author: userSummary(req.user.id),
  });
}));

// ==========================================
// 3. Direct Messaging
// ==========================================

// Get user's conversation threads
networkingRouter.get('/messages/conversations', ...auth, wrap(async (req, res) => {
  const myId = req.user.id;
  const rows = db.prepare(`
    SELECT DISTINCT
      CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS peer_id
    FROM direct_messages
    WHERE sender_id = ? OR recipient_id = ?
  `).all(myId, myId, myId);

  const convos = rows.map((r) => {
    const lastMsg = db.prepare(`
      SELECT content, created_at, sender_id, read_at
      FROM direct_messages
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      ORDER BY id DESC LIMIT 1
    `).get(myId, r.peer_id, r.peer_id, myId);

    const unread = db.prepare(`
      SELECT COUNT(*) AS n
      FROM direct_messages
      WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL
    `).get(r.peer_id, myId).n;

    return {
      peer: userSummary(r.peer_id),
      lastMessage: lastMsg ? { content: lastMsg.content, at: lastMsg.created_at, isMine: lastMsg.sender_id === myId } : null,
      unreadCount: unread,
    };
  });

  convos.sort((a, b) => new Date(b.lastMessage?.at || 0) - new Date(a.lastMessage?.at || 0));
  res.json({ items: convos });
}));

// Get message history with a specific user
networkingRouter.get('/messages/:userId', ...auth, wrap(async (req, res) => {
  const peerId = idParam(req.params.userId);
  if (peerId <= 0) throw bad('Invalid user ID');

  // Mark incoming messages as read
  db.prepare("UPDATE direct_messages SET read_at = datetime('now') WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL")
    .run(peerId, req.user.id);

  const msgs = db.prepare(`
    SELECT id, sender_id, recipient_id, content, read_at, created_at
    FROM direct_messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    ORDER BY id ASC LIMIT 100
  `).all(req.user.id, peerId, peerId, req.user.id);

  res.json({
    peer: userSummary(peerId),
    messages: msgs.map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      isMine: m.sender_id === req.user.id,
      content: m.content,
      read: Boolean(m.read_at),
      createdAt: m.created_at,
    })),
  });
}));

// Send a direct message
networkingRouter.post('/messages/:userId', ...auth, wrap(async (req, res) => {
  const peerId = idParam(req.params.userId);
  if (peerId <= 0 || peerId === req.user.id) throw bad('Invalid recipient');
  const peer = db.prepare('SELECT id, verification FROM users WHERE id = ?').get(peerId);
  if (!peer || peer.verification === 'REJECTED') throw notFound('That person is not on LanTURN');

  const { content } = parse(z.object({ content: z.string().trim().min(1).max(2000) }).strict(), req.body);
  // A first message from a stranger is limited, so one account cannot spam the whole campus.
  const fresh = db.prepare("SELECT COUNT(*) n FROM direct_messages WHERE sender_id = ? AND created_at >= datetime('now','-1 day')").get(req.user.id).n;
  if (fresh >= 60) throw new HttpError(429, 'RATE_LIMITED', 'You have started a lot of conversations today. Try again tomorrow.');

  const id = Number(
    db.prepare('INSERT INTO direct_messages (sender_id, recipient_id, content) VALUES (?, ?, ?)')
      .run(req.user.id, peerId, content).lastInsertRowid
  );

  const sender = userSummary(req.user.id);
  notify(peerId, 'direct_message', `New message from ${sender.name}`, content.slice(0, 80), `#/messages/${req.user.id}`);
  emitToUser(peerId, 'message', { id, senderId: req.user.id, content, sender, createdAt: new Date().toISOString() });

  res.status(201).json({
    id,
    senderId: req.user.id,
    isMine: true,
    content,
    createdAt: new Date().toISOString(),
  });
}));

// ==========================================
// 4. Skill Endorsements
// ==========================================

networkingRouter.post('/networking/endorse', ...auth, wrap(async (req, res) => {
  const b = parse(z.object({
    studentId: z.number().int().positive(),
    skillId: z.number().int().positive(),
  }).strict(), req.body);

  if (b.studentId === req.user.id) throw bad('You cannot endorse your own skills');

  // Verify student has this skill
  const hasSkill = db.prepare('SELECT 1 FROM student_skills WHERE user_id = ? AND skill_id = ?').get(b.studentId, b.skillId);
  if (!hasSkill) throw bad('Student does not have this skill listed');

  const existing = db.prepare('SELECT 1 FROM skill_endorsements WHERE endorser_id = ? AND student_id = ? AND skill_id = ?')
    .get(req.user.id, b.studentId, b.skillId);
  if (existing) throw conflict('You have already endorsed this skill');

  db.prepare('INSERT INTO skill_endorsements (endorser_id, student_id, skill_id) VALUES (?, ?, ?)')
    .run(req.user.id, b.studentId, b.skillId);

  const endorser = userSummary(req.user.id);
  const skillName = db.prepare('SELECT name FROM skills WHERE id = ?').get(b.skillId)?.name || 'a skill';
  notify(b.studentId, 'skill_endorsed', `${endorser.name} endorsed your ${skillName} skill`, `Your profile now displays an endorsement for ${skillName}.`, '#/student/profile');

  res.status(201).json({ ok: true, message: 'Skill endorsed successfully' });
}));

networkingRouter.get('/networking/endorsements/:studentId', ...auth, wrap(async (req, res) => {
  const studentId = idParam(req.params.studentId);
  const rows = db.prepare(`
    SELECT se.skill_id, s.name, COUNT(*) AS endorsement_count
    FROM skill_endorsements se
    JOIN skills s ON s.id = se.skill_id
    WHERE se.student_id = ?
    GROUP BY se.skill_id
  `).all(studentId);

  res.json({ items: rows });
}));
