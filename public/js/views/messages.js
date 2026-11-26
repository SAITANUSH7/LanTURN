// The shared inbox: every conversation a person has, on either side of a hiring pipeline.
//
// Before this, a message only existed inside the one application page it belonged to, so a student had to open each
// application to discover an employer had written, and an employer had no way to see who was waiting. This view is
// that list plus the thread, and it reuses `messageThread` so there is exactly one conversation component.
import { get, post, session } from '../api.js';
import { h, clear, icon, empty, errorBox, loadingBlock } from '../ui.js';
import { pageHead, wrapPage, messageThread } from './shared.js';
import { refreshBell } from './ai.js';

const relTime = (iso) => {
  const t = Date.parse(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z'));
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};

const excerpt = (s, n = 90) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

export async function inbox({ query = {}, onLeave, user }) {
  const role = user?.role || session.user?.role || 'STUDENT';
  const isEmployer = role === 'EMPLOYER';
  const rows = h('div', { class: 'inbox__list' });
  const pane = h('section', { class: 'inbox__pane', 'aria-label': 'Conversation' });
  // With no threads the pane used to stay mounted next to the empty state: two dashed boxes side by side, the right one
  // saying "pick a conversation" about a list that has none. The grid collapses to one column instead.
  const box = h('div', { class: 'inbox' }, rows, pane);
  const stamp = h('span', { class: 'muted', 'aria-live': 'polite' });
  let items = [];
  let openId = Number(query.thread) || null;

  function paintList() {
    clear(rows);
    box.classList.toggle('is-empty', !items.length);
    pane.hidden = !items.length;
    if (!items.length) {
      rows.append(empty('mail', 'No conversations yet', isEmployer ? 'Message a candidate from their application and the thread appears here.' : 'When an employer writes to you about an application, it lands here.'));
      return;
    }
    for (const t of items) {
      const current = t.applicationId === openId;
      rows.append(h('button', {
        type: 'button', class: `inbox__item${current ? ' is-open' : ''}${t.unread ? ' has-unread' : ''}`,
        'aria-current': current ? 'true' : null,
        onclick: () => open(t.applicationId),
      },
      h('div', { class: 'inbox__who' },
        h('strong', null, t.with),
        h('span', { class: 'muted' }, relTime(t.last?.at)),
        t.unread ? h('span', { class: 'inbox__n', 'aria-label': `${t.unread} unread` }, t.unread > 9 ? '9+' : String(t.unread)) : null),
      h('div', { class: 'inbox__meta' }, h('span', { class: 'muted' }, t.job.title), t.upcomingInterviews ? h('span', { class: 'badge badge--accent' }, icon('clock'), 'Interview') : null),
      h('p', { class: 'inbox__preview' }, t.last?.from === (isEmployer ? 'STUDENT' : 'EMPLOYER') ? '' : 'You: ', excerpt(t.last?.body))));
    }
  }

  function paintPane() {
    clear(pane);
    const t = items.find((x) => x.applicationId === openId);
    if (!t) {
      pane.append(h('div', { class: 'inbox__placeholder' }, icon('mail'), h('p', { class: 'muted' }, 'Pick a conversation to read it.')));
      return;
    }
    const href = isEmployer ? `#/employer/applications/${t.applicationId}` : '#/student/applications';
    pane.append(
      h('div', { class: 'inbox__head' },
        h('div', null, h('h2', null, t.with), h('p', { class: 'muted' }, `${t.job.title} · ${t.status.toLowerCase()}`)),
        h('a', { class: 'btn btn--secondary btn--sm', href }, icon('file'), 'Application')),
      messageThread(t.applicationId, { onCount: () => { /* the thread component owns its own log */ } }));
    // Opening a thread is what "read" means; the bell in the topbar should agree immediately.
    post(`/messages/threads/${t.applicationId}/read`).then(() => { refreshBell(); }).catch(() => { /* the GET already marks read */ });
  }

  function open(id) {
    openId = Number(id);
    try { history.replaceState(null, '', `#/${isEmployer ? 'employer' : 'student'}/messages?thread=${openId}`); } catch { /* optional */ }
    paintList();
    paintPane();
  }

  async function load({ quiet = false } = {}) {
    try {
      const d = await get('/messages/threads');
      items = d.items;
      if (!quiet) stamp.textContent = `${items.length} conversation${items.length === 1 ? '' : 's'}${d.unread ? ` · ${d.unread} unread` : ''}`;
      if (!openId && items.length) openId = items[0].applicationId;
      paintList();
      paintPane();
    } catch (e) {
      if (!quiet) clear(rows).append(errorBox(e, () => load()));
    }
  }

  rows.append(loadingBlock(3));
  await load();

  // Live: the shell's SSE connection re-broadcasts a notification as a DOM event, so a new message appears without
  // polling. The 45 s fallback keeps the list honest if the stream is blocked (corporate proxy, offline).
  const onLive = () => load({ quiet: true });
  window.addEventListener('lan:notification', onLive);
  const timer = setInterval(() => load({ quiet: true }), 45000);
  onLeave(() => { window.removeEventListener('lan:notification', onLive); clearInterval(timer); });

  const note = h('p', { class: 'muted' }, '');
  const quick = isEmployer
    ? get('/employer/response-time')
      .then((s) => (s.replies ? `You usually reply ${s.medianHours < 1 ? 'within an hour' : `in about ${Math.round(s.medianHours)} h`}${s.awaiting ? ` · ${s.awaiting} candidate${s.awaiting === 1 ? '' : 's'} still waiting` : ''}.` : 'No replies yet - answering quickly is the cheapest way to win candidates.'))
      .catch(() => '')
    : Promise.resolve('Employers start the conversation; you can reply as soon as they write.');
  quick.then((text) => { note.textContent = text; });

  return wrapPage(
    pageHead('Messages', isEmployer ? 'Every candidate conversation in one place.' : 'Your conversations with employers.',
      h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => load() }, icon('refresh'), 'Refresh')),
    stamp, note,
    box,
  );
}

export default inbox;
