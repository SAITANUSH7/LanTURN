import { get, post, patch, del } from '../api.js';
import { h, clear, icon, skillChip, statusBadge, fmtDateTime, empty, errorBox, loadingBlock, toast, busy, field, input, select, textarea, badgeSource, STATUS_META, initials, scoreRing } from '../ui.js';
import { pageHead, wrapPage } from './shared.js';
import { radar } from '../charts.js';
import { t } from '../i18n.js';

const think = (btn, fn) => busy(btn, fn, 'Asking AI…');

const dimList = (dims) => h('ul', { class: 'stack stack--sm' }, dims.map((d) => h('li', null, h('div', { class: 'row row--between' }, h('strong', null, d.name), h('span', { class: 'muted' }, `${Math.round(d.score)}/100`)), d.note ? h('small', { class: 'muted' }, d.note) : null)));

// ---------------------------------------------------------------- Career DNA
export async function careerDna() {
  const host = h('div', { class: 'stack stack--lg' });
  const draw = (d) => {
    clear(host);
    const btn = h('button', { class: 'btn', type: 'button' }, icon('sparkle'), d ? 'Refresh my Career DNA' : t('Generate my Career DNA'));
    btn.onclick = () => think(btn, async () => { try { draw(await post('/career/dna')); toast('Career DNA updated', 'success'); } catch (e) { toast(e.message, 'error'); } });
    if (!d) { host.append(empty('sparkle', 'No Career DNA yet', 'Add your skills on your profile, then generate a radar of your strengths.', btn)); return; }
    host.append(
      h('div', { class: 'grid grid--2' },
        h('div', { class: 'card stack', style: { alignItems: 'center' } }, radar(d.dimensions, { label: 'Career DNA' })),
        h('div', { class: 'card stack' },
          h('div', { class: 'row' }, h('h2', { style: { fontSize: 'var(--fs-xl)' } }, d.archetype), badgeSource(d.source)),
          h('p', { class: 'prose' }, d.summary),
          d.strengths.length ? h('div', { class: 'chips' }, d.strengths.map((s) => skillChip(s, 'blue'))) : null,
          dimList(d.dimensions), h('small', { class: 'muted' }, `Updated ${fmtDateTime(d.updatedAt)}`), btn)));
  };
  draw(await get('/career/dna'));
  return wrapPage(pageHead(t('Career DNA'), 'A radar of your strengths, built from your skills, resume and activity.'), host);
}

// ---------------------------------------------------------------- Skill Arena
const MEDAL = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze', basic: 'Basic' };
const medalBadge = (m) => h('span', { class: `medal medal--${m}` }, icon('shield'), MEDAL[m] || m);

export async function arena() {
  const [skills, medals] = await Promise.all([get('/students/me/skills'), get('/arena/medals')]);
  const stage = h('div', { class: 'stack' });
  const medalsBox = h('div', { class: 'stack' });
  const drawMedals = (items) => { clear(medalsBox).append(h('h3', null, 'Your medals'), items.length ? h('div', { class: 'grid grid--2' }, items.map((m) => h('div', { class: 'card stack stack--sm' }, h('div', { class: 'row row--between' }, h('strong', null, m.skill), medalBadge(m.medal)), h('small', { class: 'muted' }, `${m.correct}/3 correct · ${fmtDateTime(m.createdAt)}`), badgeSource(m.source)))) : h('p', { class: 'muted' }, 'No medals yet.')); };
  drawMedals(medals);

  const skillSel = h('input', { class: 'input', list: 'arena-skills', placeholder: 'e.g. Python', maxlength: '60' });
  const list = h('datalist', { id: 'arena-skills' }, skills.items.map((s) => h('option', { value: s.name })));
  const rate = select([[1, 'Beginner'], [2, 'Intermediate'], [3, 'Advanced']], 2);
  const startBtn = h('button', { class: 'btn', type: 'button' }, icon('bolt'), t('Start the test'));
  const showPicker = () => clear(stage).append(h('div', { class: 'card stack' }, h('h3', null, 'Pick a skill'), h('p', { class: 'muted' }, 'Rate yourself honestly. You get 3 open questions. Answer all correctly to earn the medal for your level; otherwise you get a basic medal.'),
    h('div', { class: 'form-grid' }, field('Skill', skillSel), field('Your level', rate)), list, startBtn));
  startBtn.onclick = () => think(startBtn, async () => {
    const skill = skillSel.value.trim();
    if (!skill) { toast('Enter a skill', 'error'); return; }
    try { showTest(await post('/arena/tests', { skill, selfRating: Number(rate.value) })); } catch (e) { toast(e.message, 'error'); }
  });
  function showTest(test) {
    const areas = test.questions.map(() => textarea({ rows: '4', maxlength: '2000', placeholder: 'Your answer…' }));
    const submit = h('button', { class: 'btn btn--accent', type: 'button' }, t('Submit answers'));
    submit.onclick = () => think(submit, async () => {
      try { const m = await post(`/arena/tests/${test.id}/submit`, { answers: areas.map((a) => a.value) }); showResult(m); drawMedals(await get('/arena/medals')); } catch (e) { toast(e.message, 'error'); }
    });
    clear(stage).append(h('div', { class: 'card stack' }, h('div', { class: 'row row--between' }, h('h3', null, `${test.skill} · ${['', 'Beginner', 'Intermediate', 'Advanced'][test.tier]}`), badgeSource(test.source)),
      test.questions.map((q, i) => field(`${i + 1}. ${q.q}`, areas[i])), submit));
  }
  function showResult(m) {
    const again = h('button', { class: 'btn btn--secondary', type: 'button', onclick: showPicker }, 'Take another test');
    clear(stage).append(h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('h3', null, `${m.skill}: ${m.correct}/3`), medalBadge(m.medal), badgeSource(m.source)),
      h('ol', { class: 'stack stack--sm' }, m.feedback.map((f) => h('li', null, f))), again));
  }
  showPicker();
  return wrapPage(pageHead(t('Skill Arena'), 'Prove a skill with three open questions and earn a medal.'), stage, medalsBox);
}

// ---------------------------------------------------------------- Chat (student coach / employer assistant)
export async function chat({ user }) {
  const employer = user.role === 'EMPLOYER';
  let threadId = null;
  const threads = h('div', { class: 'stack stack--sm' });
  const log = h('div', { class: 'chat__log', role: 'log', 'aria-live': 'polite' });
  const box = textarea({ rows: '2', maxlength: '1000', placeholder: employer ? 'Ask about your jobs and applicants…' : t('Ask me anything about your career') });
  const send = h('button', { class: 'btn', type: 'button' }, icon('arrow-right'), t('Send'));
  const bubble = (role, text, source) => h('div', { class: `bubble bubble--${role}` }, h('p', null, text), source ? badgeSource(source) : null);
  const greet = () => clear(log).append(bubble('assistant', employer ? 'Hi! I can compare candidates and summarise your pipeline. I never see or share contact details.' : 'Hi! I can help with your resume, skill gaps, interviews and role choices.'));

  async function loadThreads() {
    const list = await get('/chat/threads');
    clear(threads).append(h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => { threadId = null; greet(); loadThreads(); } }, icon('plus'), t('New conversation')),
      ...list.map((th) => h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('button', { class: 'thread', type: 'button', 'aria-current': th.id === threadId ? 'true' : null, onclick: () => openThread(th.id) }, th.title),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': `Delete conversation ${th.title}`, onclick: async () => { await del(`/chat/threads/${th.id}`); if (threadId === th.id) { threadId = null; greet(); } loadThreads(); } }, icon('trash')))));
  }
  async function openThread(id) {
    const d = await get(`/chat/threads/${id}`);
    threadId = id;
    clear(log).append(...d.messages.map((m) => bubble(m.role, m.content, m.role === 'assistant' ? m.source : null)));
    log.scrollTop = log.scrollHeight;
    loadThreads();
  }
  const go = () => {
    const msg = box.value.trim();
    if (!msg) return;
    think(send, async () => {
      log.append(bubble('user', msg)); box.value = '';
      const pending = h('div', { class: 'bubble bubble--assistant', role: 'status' }, h('p', { class: 'row' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Thinking…'));
      log.append(pending); log.scrollTop = log.scrollHeight;
      try {
        const r = await post('/chat/messages', { threadId: threadId || undefined, message: msg });
        pending.remove();
        threadId = r.threadId;
        log.append(bubble('assistant', r.reply.content, r.reply.source));
        log.scrollTop = log.scrollHeight;
        loadThreads();
      } catch (e) { pending.remove(); toast(e.message, 'error'); }
    });
  };
  send.onclick = go;
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
  greet(); await loadThreads();
  return wrapPage(pageHead(employer ? t('AI Assistant') : t('Career Coach'), employer ? 'Ask questions about your jobs and candidates.' : 'Your always-on career guide.'),
    h('div', { class: 'chat' }, h('aside', { class: 'card chat__side' }, threads), h('div', { class: 'card chat__main stack' }, log, h('div', { class: 'chat__input' }, box, send))));
}

// ---------------------------------------------------------------- Notifications
export async function notifications() {
  const host = h('div', { class: 'stack' });
  async function load() {
    const d = await get('/notifications');
    clear(host);
    if (!d.items.length) { host.append(empty('info', t('No notifications yet'), 'You will see application updates here.')); return; }
    host.append(h('div', { class: 'row row--between' }, h('span', { class: 'muted' }, `${d.unread} unread`),
      h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: async () => { await post('/notifications/read-all'); await load(); refreshBell(); } }, t('Mark all read'))),
      ...d.items.map((n) => h('a', { class: `card card--hover notif ${n.read ? '' : 'notif--unread'}`, href: n.link || '#/notifications', onclick: () => { if (!n.read) post(`/notifications/${n.id}/read`).then(refreshBell).catch(() => {}); } },
        h('strong', null, n.title), n.body ? h('p', { class: 'muted' }, n.body) : null, h('small', { class: 'muted' }, fmtDateTime(n.createdAt)))));
  }
  await load();
  return wrapPage(pageHead(t('Notifications')), host);
}

/** Bell button for the top bar; the badge is updated by refreshBell(). */
const bellBadge = h('span', { class: 'bell__n', hidden: true });
export const bell = () => h('a', { class: 'btn btn--secondary btn--sm bell', href: '#/notifications', 'aria-label': 'Notifications' }, icon('bell'), bellBadge);
export async function refreshBell() {
  try { const { unread } = await get('/notifications/unread-count'); bellBadge.hidden = !unread; bellBadge.textContent = unread > 99 ? '99+' : String(unread); bellBadge.parentElement?.setAttribute('aria-label', `Notifications, ${unread} unread`); } catch { /* signed out */ }
}

// ---------------------------------------------------------------- Student job tools (cover letter / interview prep)
export function jobTools(jobId) {
  const out = h('div', { class: 'stack stack--sm' });
  const cover = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('file'), t('Cover letter'));
  const prep = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('target'), t('Interview prep'));
  cover.onclick = () => think(cover, async () => {
    try {
      const r = await post(`/jobs/${jobId}/cover-letter`);
      const copy = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => navigator.clipboard?.writeText(r.letter).then(() => toast('Copied', 'success')) }, 'Copy');
      clear(out).append(h('div', { class: 'row' }, badgeSource(r.source), copy), h('pre', { class: 'letter' }, r.letter));
    } catch (e) { toast(e.message, 'error'); }
  });
  prep.onclick = () => think(prep, async () => {
    try {
      const r = await post(`/jobs/${jobId}/interview-prep`);
      clear(out).append(badgeSource(r.source), h('ol', { class: 'stack stack--sm' }, r.questions.map((q) => h('li', null, h('strong', null, q.q), h('div', { class: 'muted' }, `${q.kind} · ${q.tip}`)))));
    } catch (e) { toast(e.message, 'error'); }
  });
  return h('div', { class: 'card stack' }, h('h3', null, 'Prepare with AI'), h('div', { class: 'row' }, cover, prep), out);
}

// ---------------------------------------------------------------- Employer: Company DNA card + JD writer
export async function companyDnaCard() {
  const host = h('div', { class: 'card stack' });
  const draw = (d) => {
    clear(host);
    const btn = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('sparkle'), d ? 'Refresh' : t('Generate'));
    btn.onclick = () => think(btn, async () => { try { draw(await post('/employer/ai/company-dna')); } catch (e) { toast(e.message, 'error'); } });
    host.append(h('div', { class: 'row row--between' }, h('h3', null, t('Company DNA')), btn));
    if (!d) { host.append(h('p', { class: 'muted' }, 'Post a job, then generate a radar of what your company looks for.')); return; }
    host.append(h('div', { class: 'row' }, h('strong', null, d.personality), badgeSource(d.source)), h('p', { class: 'prose' }, d.summary), h('div', { style: { maxWidth: '340px', margin: '0 auto' } }, radar(d.dimensions, { label: 'Company DNA' })));
  };
  try { draw(await get('/employer/ai/company-dna')); } catch (e) { clear(host).append(errorBox(e)); }
  return host;
}

/** Button that drafts a job description from title/type/location/skills supplied by getters. */
export function jdWriter({ getInput, onResult }) {
  const btn = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('sparkle'), t('Write with AI'));
  btn.onclick = () => think(btn, async () => {
    const inp = getInput();
    if (!inp.title) { toast('Enter a job title first', 'error'); return; }
    try { onResult(await post('/employer/ai/job-description', inp)); } catch (e) { toast(e.message, 'error'); }
  });
  return btn;
}

// ---------------------------------------------------------------- Employer: Kanban board
const COLS = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'REJECTED'];
const NEXT = { APPLIED: ['SHORTLISTED', 'REJECTED'], SHORTLISTED: ['INTERVIEW', 'REJECTED'], INTERVIEW: ['OFFERED', 'REJECTED'], OFFERED: [], REJECTED: [], WITHDRAWN: [] };

export async function board({ params }) {
  const host = h('div', { class: 'board', role: 'group', 'aria-label': 'Applicant board' });
  const title = h('p', { class: 'strong' });
  async function load() {
    const d = await get(`/employer/jobs/${params.id}/candidates?sort=match`);
    title.textContent = d.job.title;
    clear(host);
    for (const col of COLS) {
      const cards = d.items.filter((c) => c.status === col);
      const zone = h('div', { class: 'board__col', 'data-status': col },
        h('h3', { class: 'board__head' }, STATUS_META[col].label, h('span', { class: 'badge badge--neutral' }, String(cards.length))),
        cards.map((c) => h('div', { class: 'card card--hover board__card', draggable: 'true', 'data-id': c.applicationId, 'data-status': c.status },
          h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials(c.student.name)), h('a', { href: `#/employer/applications/${c.applicationId}` }, h('strong', null, c.student.name))),
          h('div', { class: 'muted' }, `Match ${c.matchScore}%`),
          // Buttons make every move possible without drag and drop (keyboard and touch).
          h('div', { class: 'row' }, NEXT[c.status].map((s) => h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => move(c.applicationId, s) }, s === 'REJECTED' ? 'Reject' : `→ ${STATUS_META[s].label}`))))));
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('board__col--over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('board__col--over'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault(); zone.classList.remove('board__col--over');
        const id = e.dataTransfer.getData('text/plain');
        const card = host.querySelector(`.board__card[data-id="${id}"]`);
        if (card && card.dataset.status !== col) move(Number(id), col);
      });
      zone.querySelectorAll('.board__card').forEach((el) => el.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', el.dataset.id)));
      host.append(zone);
    }
  }
  async function move(id, status) {
    try { await patch(`/employer/applications/${id}/status`, { status }); toast(`Moved to ${STATUS_META[status].label}`, 'success'); await load(); } catch (e) { toast(e.message, 'error'); await load(); }
  }
  await load();
  return wrapPage(h('a', { class: 'crumb', href: `#/employer/jobs/${params.id}/candidates` }, icon('arrow-left'), 'List view'), pageHead(t('Board'), 'Drag a card, or use the buttons, to move applicants.'), title, host);
}
