import { get, post, put, patch, openApplicationResume, reloadUser } from '../api.js';
import { h, clear, icon, scoreRing, skillChip, statusBadge, verifyBadge, fmtDate, fmtDateTime, empty, errorBox, loadingBlock, toast, confirmDialog, busy, field, input, select, textarea, TYPE_LABEL, STATUS_META, initials } from '../ui.js';
import { pageHead, wrapPage, analysisView, emailPrefsCard, downloadFile, interviewRow, messageThread } from './shared.js';
import { jdWriter, companyDnaCard } from './ai.js';

const pendingBanner = (v) => v === 'VERIFIED' ? null
  : h('div', { class: `alert ${v === 'REJECTED' ? 'alert--danger' : 'alert--warning'}`, role: 'status' }, icon(v === 'REJECTED' ? 'x' : 'clock'),
    h('div', null, h('strong', null, v === 'REJECTED' ? 'Your employer account was not approved.' : 'Your account is waiting for admin approval.'), h('p', null, 'You can set up your company profile now. Posting jobs unlocks once an admin approves your account.')));

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Five-star picker (radio group, keyboard friendly). onChange(null) clears. */
function ratingInput(value, onChange) {
  let cur = value || null;
  const box = h('div', { class: 'rating', role: 'radiogroup', 'aria-label': 'Your rating' });
  const paint = () => {
    clear(box);
    [1, 2, 3, 4, 5].forEach((n) => box.append(h('button', { type: 'button', class: `rating__star${cur >= n ? ' is-on' : ''}`, role: 'radio', 'aria-checked': String(cur === n), 'aria-label': `${n} of 5`, onclick: () => { cur = cur === n ? null : n; onChange(cur); paint(); } }, icon('star'))));
    box.append(h('span', { class: 'muted rating__txt' }, cur ? `${cur} / 5` : 'Not rated'));
  };
  paint();
  return box;
}
const ratingTag = (r) => (r ? h('span', { class: 'chip chip--amber', title: `Your rating: ${r} of 5` }, icon('star'), String(r)) : null);

function attentionCard(a, jobs) {
  if (!a) return null;
  const busiest = [...jobs].sort((x, y) => y.awaitingReview - x.awaitingReview)[0];
  const rows = [];
  if (a.waiting) rows.push(h('li', null, icon('users'), h('div', null, h('strong', null, `${a.waiting} applicant${a.waiting === 1 ? '' : 's'} waiting for a first look`), a.stale ? h('p', { class: 'muted' }, `${a.stale} ${a.stale === 1 ? 'has' : 'have'} been waiting 3+ days. Quick replies keep good candidates engaged.`) : null),
    busiest?.awaitingReview ? h('a', { class: 'btn btn--sm', href: `#/employer/jobs/${busiest.id}/candidates?status=APPLIED` }, 'Review') : null));
  a.closingSoon.forEach((j) => rows.push(h('li', null, icon('clock'), h('div', null, h('strong', null, `${j.title} closes ${fmtDate(j.deadline)}`), h('p', { class: 'muted' }, 'Extend the date if you still need candidates.')), h('a', { class: 'btn btn--secondary btn--sm', href: `#/employer/jobs/${j.id}/edit` }, 'Edit'))));
  return h('section', { class: 'card stack stack--sm attention' }, h('h3', { class: 'card__title' }, 'Needs your attention'),
    rows.length ? h('ul', { class: 'attention__list' }, rows) : h('p', { class: 'muted' }, 'You are all caught up. New applicants will show up here.'));
}

// ---------------------------------------------------------------- Dashboard
export async function dashboard() {
  const [d, jobs, rt] = await Promise.all([get('/employer/dashboard'), get('/employer/jobs'), get('/employer/response-time').catch(() => null)]);
  // A number without a unit or a sentence under it is a guess. Every tile says what it counts.
  const stat = (label, value, cls = '', hint = '') => h('div', { class: `stat ${cls}` },
    h('div', { class: 'stat__label' }, label), h('div', { class: 'stat__value' }, value), hint ? h('span', { class: 'stat__hint' }, hint) : null);
  // Candidates can see this number on their application, so it belongs on the dashboard too - not hidden in a report.
  const replyStat = rt?.replies
    ? stat('Median reply', rt.medianHours < 1 ? '<1 h' : rt.medianHours < 24 ? `${Math.round(rt.medianHours)} h` : `${Math.round(rt.medianHours / 24)} d`, rt.awaiting ? 'stat--warn' : '', rt.awaiting ? `${rt.awaiting} waiting on you` : 'to your first message')
    : stat('Median reply', '—', '', 'no replies sent yet');
  return wrapPage(
    pageHead('Dashboard', 'Your hiring pipeline at a glance.', d.verification === 'VERIFIED' ? h('a', { class: 'btn btn--accent', href: '#/employer/jobs/new' }, icon('plus'), 'Post a job') : verifyBadge(d.verification)),
    pendingBanner(d.verification),
    attentionCard(d.attention, jobs.items),
    h('div', { class: 'stats' },
      stat('Open jobs', d.openJobs, 'stat--accent', 'accepting applications'),
      stat('Applicants', d.applicants, '', 'across all jobs'),
      stat('Shortlisted', d.shortlisted, '', 'moved past screening'),
      stat('Interviews', d.interviews, '', 'scheduled or held'),
      stat('Offers', d.offers, '', 'sent to candidates'),
      replyStat),
    h('div', { class: 'split split--even' }, applicantsChart(d.daily || []), funnelChart(d.funnel || {})),
    h('section', { class: 'stack' }, h('div', { class: 'row row--between' }, h('h2', { class: 'section-title' }, 'Your jobs'), h('a', { href: '#/employer/jobs' }, 'Manage all')),
      jobs.items.length ? jobs.items.slice(0, 5).map(jobRow) : empty('briefcase', 'No jobs posted yet', d.verification === 'VERIFIED' ? 'Post your first role and start receiving matched candidates.' : 'Once approved, your postings appear here.', d.verification === 'VERIFIED' ? h('a', { class: 'btn', href: '#/employer/jobs/new' }, 'Post a job') : null)));
}

function jobRow(j, reload) {
  const actions = h('div', { class: 'row row--wrap' },
    h('a', { class: 'btn btn--sm', href: `#/employer/jobs/${j.id}/candidates` }, icon('users'), `Candidates (${j.applicantCount})`),
    j.awaitingReview ? h('a', { class: 'badge badge--accent', href: `#/employer/jobs/${j.id}/candidates?status=APPLIED`, title: 'Applicants you have not reviewed yet' }, `${j.awaitingReview} new`) : null,
    reload ? h('a', { class: 'btn btn--ghost btn--sm', href: `#/employer/jobs/new?from=${j.id}` }, icon('copy'), 'Duplicate') : null,
    reload && j.status !== 'OPEN' ? h('button', { class: 'btn btn--secondary btn--sm', onclick: (ev) => busy(ev.currentTarget, async () => { try { await post(`/employer/jobs/${j.id}/reopen`); toast('Job reopened', 'success'); reload(); } catch (e) { toast(e.message, 'error'); } }) }, icon('refresh'), 'Reopen') : null,
    reload && j.status === 'OPEN' ? h('a', { class: 'btn btn--secondary btn--sm', href: `#/employer/jobs/${j.id}/edit` }, 'Edit') : null,
    reload && j.status === 'OPEN' ? h('button', { class: 'btn btn--danger btn--sm', onclick: async () => {
      if (!(await confirmDialog({ title: 'Close this job?', body: 'It disappears from search. Existing applications stay available to you.', confirmText: 'Close job', danger: true }))) return;
      try { await post(`/employer/jobs/${j.id}/close`); toast('Job closed'); reload(); } catch (e) { toast(e.message, 'error'); }
    } }, 'Close') : null);
  return h('div', { class: 'card stack stack--sm' },
    h('div', { class: 'row row--between' }, h('div', null, h('h3', null, j.title), h('p', { class: 'muted' }, `${TYPE_LABEL[j.type]} · ${j.remote ? 'Remote' : j.location || 'Location flexible'} · posted ${fmtDate(j.createdAt)}`)),
      h('span', { class: `badge ${j.status === 'OPEN' ? 'badge--success' : 'badge--neutral'}` }, j.status === 'OPEN' ? 'Open' : 'Closed')),
    h('div', { class: 'chips' }, j.skills.map((s) => skillChip(s.name, null, s.weight))), actions);
}

// ---------------------------------------------------------------- Jobs list
export async function jobs({ query = {} } = {}) {
  const host = h('div', { class: 'stack' });
  const me = await get('/employer/dashboard');
  let all = [];
  let filter = ['OPEN', 'CLOSED'].includes(query.status) ? query.status : '';
  let q = (query.q || '').trim();
  const bar = h('div', { class: 'row row--between row--wrap' });
  const search = input({ type: 'search', placeholder: 'Search your jobs', 'aria-label': 'Search your jobs', value: q, style: { maxWidth: '280px' } });
  const sync = () => { const p = new URLSearchParams(); if (filter) p.set('status', filter); if (q) p.set('q', q); try { history.replaceState(null, '', `#/employer/jobs${p.toString() ? `?${p}` : ''}`); } catch { /* optional */ } };
  function paint() {
    sync();
    const n = (st) => all.filter((j) => j.status === st).length;
    clear(bar).append(h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' },
      ...[['', `All (${all.length})`], ['OPEN', `Open (${n('OPEN')})`], ['CLOSED', `Closed (${n('CLOSED')})`]].map(([k, l]) => h('button', { class: 'filter', 'aria-pressed': String(filter === k), onclick: () => { filter = k; paint(); } }, l))), search);
    const shown = all.filter((j) => (!filter || j.status === filter) && (!q || `${j.title} ${j.location || ''} ${j.skills.map((x) => x.name).join(' ')}`.toLowerCase().includes(q.toLowerCase())));
    clear(host);
    if (!all.length) host.append(empty('briefcase', 'No jobs yet', 'Post a role with the skills it needs. Candidates are ranked against them automatically.', me.verification === 'VERIFIED' ? h('a', { class: 'btn', href: '#/employer/jobs/new' }, 'Post a job') : null));
    else if (!shown.length) host.append(empty('search', 'No jobs match', 'Try another filter or clear the search.'));
    shown.forEach((j) => host.append(jobRow(j, load)));
  }
  async function load() {
    try { all = (await get('/employer/jobs')).items; paint(); } catch (e) { clear(host).append(errorBox(e, load)); }
  }
  let t; search.oninput = () => { clearTimeout(t); t = setTimeout(() => { q = search.value.trim(); paint(); search.focus(); }, 150); };
  await load();
  return wrapPage(pageHead('My jobs', 'Post roles and review who applied.', me.verification === 'VERIFIED' ? h('a', { class: 'btn btn--accent', href: '#/employer/jobs/new' }, icon('plus'), 'Post a job') : null), pendingBanner(me.verification), all.length ? bar : null, host);
}

// ---------------------------------------------------------------- Job form
export async function jobForm({ params, query = {}, navigate }) {
  const editing = Boolean(params.id);
  const source = params.id || query.from;
  const duplicating = !editing && Boolean(query.from);
  const [me, existing] = await Promise.all([get('/employer/dashboard'), source ? get(`/jobs/${source}`).catch(() => null) : null]);
  const v = {
    title: input({ value: existing?.title || '', required: true, maxlength: '120' }),
    description: textarea({ rows: '7', maxlength: '5000', placeholder: 'What will this person do? What will they learn?' }, existing?.description || ''),
    type: select(Object.entries(TYPE_LABEL), existing?.type || 'INTERNSHIP'),
    location: input({ value: existing?.location || '', placeholder: 'City' }),
    comp: input({ value: existing?.compensation || '', placeholder: 'e.g. ₹25,000 / month' }),
    deadline: input({ type: 'date', value: duplicating ? '' : existing?.deadline || '', min: editing ? null : todayIso() }),
    remote: h('input', { type: 'checkbox', checked: existing?.remote ? true : null }),
  };
  const skills = new Map((existing?.skills || []).map((s) => [s.skillId, { id: s.skillId, name: s.name, weight: s.weight }]));
  const skillList = h('div', { class: 'stack stack--sm' });
  const paint = () => {
    clear(skillList);
    if (!skills.size) skillList.append(h('p', { class: 'muted' }, 'Add at least one required skill.'));
    [...skills.values()].forEach((s) => {
      const w = select([[3, 'Core (3)'], [2, 'Important (2)'], [1, 'Nice to have (1)']], s.weight, { 'aria-label': `Importance of ${s.name}`, style: { width: '190px' }, onchange: (e) => { s.weight = Number(e.target.value); } });
      skillList.append(h('div', { class: 'row row--between card card--flat', style: { padding: '10px 14px' } }, h('strong', null, s.name), h('div', { class: 'row' }, w, h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': `Remove ${s.name}`, onclick: () => { skills.delete(s.id); paint(); } }, icon('x')))));
    });
  };
  paint();
  const search = input({ type: 'search', placeholder: 'Search skills to add', autocomplete: 'off', 'aria-label': 'Search skills' });
  const list = h('div', { class: 'picker__list', hidden: true });
  let timer;
  search.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = search.value.trim();
      if (!q) { list.hidden = true; return; }
      const d = await get(`/skills?q=${encodeURIComponent(q)}`);
      clear(list);
      d.items.filter((s) => !skills.has(s.id)).forEach((s) => list.append(h('button', { type: 'button', onclick: () => { skills.set(s.id, { id: s.id, name: s.name, weight: 2 }); paint(); search.value = ''; list.hidden = true; } }, s.name, h('small', null, s.category))));
      list.hidden = !list.childNodes.length;
    }, 180);
  };
  const sugBox = h('div', { class: 'chips', 'aria-live': 'polite' });
  const sugBtn = h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: () => busy(sugBtn, async () => {
    try {
      const d = await post('/employer/skills/suggest', { title: v.title.value.trim(), description: v.description.value.trim(), exclude: [...skills.keys()] });
      clear(sugBox);
      if (!d.items.length) { sugBox.append(h('p', { class: 'muted' }, 'No suggestions yet. Add a title or a few lines of description first.')); return; }
      d.items.forEach((x) => sugBox.append(h('button', { type: 'button', class: 'chip chip--blue', title: x.reason, onclick: (ev) => { skills.set(x.skillId, { id: x.skillId, name: x.name, weight: Math.min(3, Math.max(1, x.weight)) }); paint(); ev.currentTarget.remove(); } }, `+ ${x.name}`, h('small', { class: 'muted' }, ` ${x.reason}`))));
    } catch (e) { toast(e.message, 'error'); }
  }) }, icon('target'), 'Suggest skills');
  const btn = h('button', { class: 'btn', type: 'submit', disabled: me.verification !== 'VERIFIED' ? true : null }, editing ? 'Save changes' : 'Publish job');
  const form = h('form', { class: 'card stack', onsubmit: (e) => {
    e.preventDefault();
    const problem = v.title.value.trim().length < 3 ? ['Give the job a title of at least 3 characters.', v.title]
      : v.description.value.trim().length < 10 ? ['Add a short description (at least 10 characters).', v.description]
        : !skills.size ? ['Add at least one required skill so candidates can be matched.', search]
          : (!editing && v.deadline.value && v.deadline.value < todayIso()) ? ['The apply-by date is in the past.', v.deadline] : null;
    if (problem) { toast(problem[0], 'error'); problem[1].focus(); return; }
    busy(btn, async () => {
      const body = { title: v.title.value.trim(), description: v.description.value.trim(), type: v.type.value, location: v.location.value.trim(), remote: v.remote.checked, compensation: v.comp.value.trim(), deadline: v.deadline.value || null, skills: [...skills.values()].map((s) => ({ skillId: s.id, weight: s.weight })) };
      try {
        if (editing) await put(`/employer/jobs/${params.id}`, body); else await post('/employer/jobs', body);
        toast(editing ? 'Job updated' : 'Job published', 'success');
        navigate('/employer/jobs');
      } catch (ex) { toast(ex.message, 'error'); }
    });
  } },
  duplicating && existing ? h('div', { class: 'alert', role: 'status' }, icon('copy'), h('div', null, h('strong', null, `Copied from “${existing.title}”`), h('p', null, 'Review the details, set a new apply-by date and publish.'))) : null,
  field('Job title', v.title), field('Description', v.description, { hint: 'Up to 5000 characters. Plain text with short bullet lists works best.' }),
  jdWriter({ getInput: () => ({ title: v.title.value.trim(), type: v.type.value, location: v.location.value.trim(), skills: [...skills.values()].map((x) => x.name) }),
    onResult: (r) => { v.description.value = [r.description, r.responsibilities.length ? `\nWhat you will do:\n${r.responsibilities.map((x) => `- ${x}`).join('\n')}` : '', r.requirements.length ? `\nWhat we look for:\n${r.requirements.map((x) => `- ${x}`).join('\n')}` : '', r.niceToHave.length ? `\nNice to have:\n${r.niceToHave.map((x) => `- ${x}`).join('\n')}` : ''].filter(Boolean).join('\n').slice(0, 5000); toast('Draft added. Edit it before publishing.', 'success'); } }),
  h('div', { class: 'form-grid' }, field('Type', v.type), field('Location', v.location), field('Compensation', v.comp), field('Apply by', v.deadline)),
  h('label', { class: 'check' }, v.remote, 'Remote friendly'),
  h('div', { class: 'stack stack--sm' }, h('h3', null, 'Required skills'), h('p', { class: 'hint muted' }, 'Weights drive the match score students and you see.'), skillList, h('div', { class: 'picker' }, search, list), h('div', { class: 'row' }, sugBtn), sugBox),
  h('div', { class: 'form-actions' }, btn, h('a', { class: 'btn btn--secondary', href: '#/employer/jobs' }, 'Cancel'), me.verification !== 'VERIFIED' ? h('span', { class: 'muted' }, 'Publishing unlocks after admin approval.') : null));
  return wrapPage(h('a', { class: 'crumb', href: '#/employer/jobs' }, icon('arrow-left'), 'My jobs'), pageHead(editing ? 'Edit job' : duplicating ? 'Duplicate job' : 'Post a job'), pendingBanner(me.verification), form);
}

// ---------------------------------------------------------------- Candidates
const STATUSES = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'];
const filterBar = (counts, status, pick) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' },
    h('button', { class: 'filter', 'aria-pressed': String(!status), onclick: () => pick('') }, `All (${total})`),
    ...STATUSES.map((s2) => h('button', { class: 'filter', 'aria-pressed': String(status === s2), onclick: () => pick(s2) }, `${STATUS_META[s2].label} (${counts[s2] || 0})`)));
};
export async function candidates({ params, query }) {
  let status = STATUSES.includes(query.status) ? query.status : '';
  let sort = query.sort === 'resume' ? 'resume' : query.sort === 'match' ? 'match' : 'smart';
  const bar = h('div', { class: 'row row--between' });
  const list = h('div', { class: 'stack' });
  const titleEl = h('p', { class: 'strong' });
  const selected = new Set();
  const pick = (s2) => { status = s2; selected.clear(); load(); };
  const sortBar = () => h('div', { class: 'segmented', role: 'group', 'aria-label': 'Sort' }, ...[['smart', 'AI rank'], ['match', 'Best match'], ['resume', 'Resume score']].map(([k, l]) => h('button', { 'aria-pressed': String(sort === k), onclick: () => { sort = k; load(); } }, l)));
  async function loadSmart(explain) {
    syncUrl();
    clear(list).append(loadingBlock(2));
    try {
      const d = explain ? await post(`/employer/jobs/${params.id}/ranking/explain`, {}) : await get(`/employer/jobs/${params.id}/ranking`);
      titleEl.textContent = d.job.title;
      const counts = Object.fromEntries(STATUSES.map((x) => [x, 0]));
      d.items.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
      clear(bar).append(filterBar(counts, status, pick), sortBar());
      const items = status ? d.items.filter((c) => c.status === status) : d.items;
      clear(list);
      if (!items.length) { list.append(empty('users', 'No candidates here yet', status ? 'No applications have this status.' : 'Applications will appear as soon as students apply.')); return; }
      const bulk = h('div', { class: 'row card card--flat bulkbar', style: { padding: '10px 14px' } });
      const paintBulk = () => {
        bulk.classList.toggle('is-active', selected.size > 0);
        if (!selected.size) { clear(bulk).append(h('span', { class: 'muted' }, 'Tick candidates to move or reject several at once.'), h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => { items.forEach((c) => selected.add(c.applicationId)); paintBulk(); list.querySelectorAll('input[type=checkbox]').forEach((i) => { i.checked = true; }); } }, 'Select all')); return; }
        clear(bulk).append(h('strong', null, `${selected.size} selected`),
          ...['SHORTLISTED', 'INTERVIEW', 'REJECTED'].map((s2) => h('button', { type: 'button', class: `btn btn--sm ${s2 === 'REJECTED' ? 'btn--danger' : 'btn--secondary'}`, disabled: selected.size ? null : true, onclick: async (ev) => {
            if (s2 === 'REJECTED' && !(await confirmDialog({ title: `Reject ${selected.size} candidate(s)?`, body: 'Students will see the new status.', confirmText: 'Reject', danger: true }))) return;
            busy(ev.currentTarget, async () => { try { const r = await post('/employer/applications/bulk-status', { ids: [...selected], status: s2 }); toast(`${r.changed} moved${r.failed ? `, ${r.failed} not allowed from their current stage` : ''}`, r.failed ? 'info' : 'success'); selected.clear(); await loadSmart(false); } catch (e) { toast(e.message, 'error'); } });
          } }, s2 === 'REJECTED' ? 'Reject' : `Move to ${STATUS_META[s2].label}`)),
          h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => { selected.clear(); paintBulk(); list.querySelectorAll('input[type=checkbox]').forEach((i) => { i.checked = false; }); } }, 'Clear'));
      };
      paintBulk();
      list.append(h('div', { class: 'row row--between' }, h('p', { class: 'muted' }, d.source === 'llm' ? `Explanations written by ${d.provider || 'your AI provider'} from the facts below. Names are never sent.` : (d.note ? 'AI explanation unavailable, showing rule-based reasons.' : 'Ranked by skill match, resume score, medals and resume wording. Reasons are rule-based.')),
        h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: (ev) => busy(ev.currentTarget, () => loadSmart(true)) }, icon('target'), 'Explain top with AI')), bulk);
      items.forEach((c, i) => list.append(h('div', { class: 'card cand' },
        h('input', { type: 'checkbox', 'aria-label': `Select ${c.name}`, checked: selected.has(c.applicationId) ? true : null, onchange: (e) => { e.target.checked ? selected.add(c.applicationId) : selected.delete(c.applicationId); paintBulk(); } }),
        h('div', { class: 'stack stack--sm' }, h('div', { class: 'row row--wrap' }, h('strong', null, `#${i + 1}`), h('a', { href: `#/employer/applications/${c.applicationId}` }, h('h3', null, c.name)), statusBadge(c.status), ratingTag(c.rating), c.hasNote ? h('span', { class: 'muted', title: 'You left a private note' }, icon('file')) : null),
          h('p', null, c.why),
          h('div', { class: 'chips' }, ...c.strengths.map((x) => skillChip(x, 'matched')), ...c.concerns.map((x) => skillChip(x, 'missing')))),
        h('div', { class: 'cand__scores' }, h('div', null, scoreRing(c.composite, { size: 'sm' }), 'Overall'), h('div', null, scoreRing(c.matchScore, { size: 'sm', accent: true }), 'Match')))));
    } catch (e) { clear(list).append(errorBox(e, () => loadSmart(false))); }
  }
  const syncUrl = () => {
    const q = new URLSearchParams(); if (status) q.set('status', status); if (sort !== 'smart') q.set('sort', sort);
    try { history.replaceState(null, '', `#/employer/jobs/${params.id}/candidates${q.toString() ? `?${q}` : ''}`); } catch { /* optional */ }
  };
  async function load() {
    syncUrl();
    if (sort === 'smart') return loadSmart(false);
    clear(list).append(loadingBlock(2));
    try {
      const d = await get(`/employer/jobs/${params.id}/candidates?sort=${sort}${status ? `&status=${status}` : ''}`);
      clear(bar).append(filterBar(d.counts, status, pick), sortBar());
      titleEl.textContent = d.job.title;
      clear(list);
      if (!d.items.length) { list.append(empty('users', 'No candidates here yet', status ? 'No applications have this status.' : 'Applications will appear as soon as students apply.')); return; }
      d.items.forEach((c) => list.append(h('a', { class: 'card card--hover cand', href: `#/employer/applications/${c.applicationId}` },
        h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials(c.student.name)),
        h('div', { class: 'stack stack--sm' }, h('div', { class: 'row row--wrap' }, h('h3', null, c.student.name), statusBadge(c.status), ratingTag(c.rating)),
          h('p', { class: 'muted' }, [c.student.degree, c.student.branch, c.student.college].filter(Boolean).join(' · ') || 'Profile incomplete'),
          h('div', { class: 'chips' }, c.topSkills.map((s) => skillChip(s, 'blue')))),
        h('div', { class: 'cand__scores' }, h('div', null, scoreRing(c.matchScore, { size: 'sm' }), 'Match'), h('div', null, c.resumeScore != null ? scoreRing(c.resumeScore, { size: 'sm', accent: true }) : h('span', { class: 'muted' }, '—'), 'Resume')))));
    } catch (e) { clear(list).append(errorBox(e, load)); }
  }
  await load();
  return wrapPage(h('a', { class: 'crumb', href: '#/employer/jobs' }, icon('arrow-left'), 'My jobs'), pageHead('Candidates', null, h('div', { class: 'row row--wrap' }, h('button', { class: 'btn btn--ghost btn--sm', onclick: (ev) => busy(ev.currentTarget, async () => { try { await downloadFile(`/employer/jobs/${params.id}/candidates.csv`, `candidates-job-${params.id}.csv`); } catch (e) { toast(e.message, 'error'); } }) }, icon('download'), 'Export CSV'), h('a', { class: 'btn btn--secondary btn--sm', href: `#/employer/jobs/${params.id}/board` }, icon('target'), 'Board view'))), titleEl, bar, list);
}


function interviewCard(a, reload) {
  const canSchedule = ['SHORTLISTED', 'INTERVIEW'].includes(a.status);
  const pad = (n) => String(n).padStart(2, '0');
  const soon = new Date(Date.now() + 36 * 3600000); soon.setMinutes(0, 0, 0);
  const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const when = input({ type: 'datetime-local', value: local(soon), min: local(new Date()), required: true });
  const dur = select([[30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1.5 hours'], [15, '15 minutes']], 30);
  const mode = select([['VIDEO', 'Video call'], ['PHONE', 'Phone call'], ['ONSITE', 'On site']], 'VIDEO');
  const where = input({ placeholder: 'https://meet.google.com/…', maxlength: '300' });
  const whereField = field('Meeting link', where);
  mode.onchange = () => { const m = mode.value; whereField.hidden = m === 'PHONE'; whereField.querySelector('label').textContent = m === 'VIDEO' ? 'Meeting link' : 'Address'; where.placeholder = m === 'VIDEO' ? 'https://meet.google.com/…' : 'Office address and floor'; };
  const note = textarea({ rows: '2', maxlength: '1000', placeholder: 'Anything the candidate should prepare or bring' });
  const btn = h('button', { class: 'btn btn--sm', type: 'submit', disabled: canSchedule ? null : true }, icon('clock'), 'Send invite');
  const form = h('form', { class: 'stack stack--sm', onsubmit: (e) => {
    e.preventDefault();
    if (!when.value) { toast('Pick a date and time', 'error'); return; }
    busy(btn, async () => {
      try { await post(`/employer/applications/${a.id}/interviews`, { startsAt: new Date(when.value).toISOString(), durationMin: Number(dur.value), mode: mode.value, location: where.value.trim(), note: note.value.trim() }); toast('Invite sent to the candidate', 'success'); await reload(); } catch (ex) { toast(ex.message, 'error'); }
    });
  } }, h('div', { class: 'form-grid' }, field('Date and time', when), field('Length', dur), field('Format', mode), whereField), field('Note (optional)', note), h('div', { class: 'row' }, btn, canSchedule ? null : h('span', { class: 'muted' }, 'Shortlist the candidate to schedule an interview.')));
  const rows = a.interviews.length ? a.interviews.map((it) => interviewRow(it, it.status === 'SCHEDULED' ? [h('button', { type: 'button', class: 'btn btn--danger btn--sm', onclick: async (ev) => {
    if (!(await confirmDialog({ title: 'Cancel this interview?', body: 'The candidate is notified.', confirmText: 'Cancel interview', danger: true }))) return;
    busy(ev.currentTarget, async () => { try { await post(`/employer/applications/${a.id}/interviews/${it.id}/cancel`); toast('Interview cancelled'); await reload(); } catch (ex) { toast(ex.message, 'error'); } });
  } }, 'Cancel')] : []))  : [h('p', { class: 'muted' }, 'No interviews yet.')];
  return h('div', { class: 'card stack' }, h('h3', null, 'Interviews'), ...rows, h('details', { class: 'fold', open: a.interviews.length ? null : true }, h('summary', null, 'Schedule an interview'), form));
}

function messagesCard(a) {
  let n = null; const count = h('span', { class: 'badge badge--neutral' }, '…');
  return h('div', { class: 'card stack' }, h('div', { class: 'row row--between' }, h('h3', null, 'Messages'), count), h('p', { class: 'muted' }, 'The candidate sees these in their Applications page and by email.'), messageThread(a.id, { onCount: (c) => { n = c; count.textContent = String(c); } }));
}

export async function candidate({ params }) {
  const host = h('div', { class: 'stack stack--lg' });
  async function load() {
    const a = await get(`/employer/applications/${params.id}`);
    clear(host);
    const actions = a.allowedTransitions.map((s) => h('button', { class: `btn ${s === 'REJECTED' ? 'btn--danger' : ''}`, onclick: async (ev) => {
      if (s === 'REJECTED' && !(await confirmDialog({ title: 'Reject this candidate?', body: 'The student will see the new status.', confirmText: 'Reject', danger: true }))) return;
      busy(ev.currentTarget, async () => { try { await patch(`/employer/applications/${a.id}/status`, { status: s }); toast(`Moved to ${STATUS_META[s].label}`, 'success'); await load(); } catch (e) { toast(e.message, 'error'); } });
    } }, s === 'REJECTED' ? 'Reject' : a.status === 'REJECTED' ? 'Reconsider: back to shortlist' : `Move to ${STATUS_META[s].label}`));
    const nb = a.neighbours;
    const mailTo = `mailto:${a.student.email}?subject=${encodeURIComponent(`Your application for ${a.job.title}`)}`;
    let rating = a.rating; const noteBox = textarea({ rows: '4', maxlength: '2000', placeholder: 'Private to your team. Students never see this.', 'aria-label': 'Private note' }, a.note);
    const saveNote = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: (ev) => busy(ev.currentTarget, async () => { try { await put(`/employer/applications/${a.id}/note`, { note: noteBox.value.trim(), rating }); toast('Note saved', 'success'); } catch (e) { toast(e.message, 'error'); } }) }, 'Save note');
    host.append(
      h('div', { class: 'row row--between row--wrap' },
        h('a', { class: 'crumb', href: `#/employer/jobs/${a.job.id}/candidates` }, icon('arrow-left'), `Candidates for ${a.job.title}`),
        h('div', { class: 'row pager', 'aria-label': 'Candidate navigation' }, h('span', { class: 'muted' }, `${nb.position} of ${nb.total}`),
          nb.prev ? h('a', { class: 'btn btn--ghost btn--sm', href: `#/employer/applications/${nb.prev}`, 'aria-label': 'Previous candidate' }, icon('arrow-left')) : h('span', { class: 'btn btn--ghost btn--sm is-disabled', 'aria-hidden': 'true' }, icon('arrow-left')),
          nb.next ? h('a', { class: 'btn btn--ghost btn--sm', href: `#/employer/applications/${nb.next}`, 'aria-label': 'Next candidate' }, h('span', { class: 'flip' }, icon('arrow-left'))) : h('span', { class: 'btn btn--ghost btn--sm is-disabled', 'aria-hidden': 'true' }, h('span', { class: 'flip' }, icon('arrow-left'))))),
      h('div', { class: 'card stack' },
        h('div', { class: 'row row--between' }, h('div', { class: 'row' }, h('div', { class: 'avatar' }, initials(a.student.name)), h('div', null, h('h1', { style: { fontSize: 'clamp(1.7rem, 6vw, 2.4rem)', overflowWrap: 'anywhere' } }, a.student.name), h('p', { class: 'muted' }, [a.student.degree, a.student.branch, a.student.college, a.student.graduationYear].filter(Boolean).join(' · ')))), statusBadge(a.status)),
        h('div', { class: 'job__meta' }, h('span', null, icon('pin'), a.student.location || 'Location not set'), h('a', { href: mailTo, title: 'Email this candidate' }, icon('mail'), a.student.email), h('span', null, icon('clock'), `Applied ${fmtDate(a.appliedAt)}`)),
        a.student.bio ? h('p', null, a.student.bio) : null,
        a.coverNote ? h('div', { class: 'alert' }, icon('info'), h('div', null, h('strong', null, 'Cover note'), h('p', { class: 'prose' }, a.coverNote))) : null,
        h('div', { class: 'row row--wrap actionbar' }, actions.length ? actions : h('span', { class: 'muted' }, 'This application is closed. No further status changes.'), h('a', { class: 'btn btn--secondary', href: mailTo }, icon('mail'), 'Email'))),
      h('div', { class: 'split' },
        h('div', { class: 'stack' },
          interviewCard(a, load), messagesCard(a),
          h('div', { class: 'card stack' }, h('h3', null, 'Resume analysis'), a.resume ? analysisView(a.resume.analysis) : h('p', { class: 'muted' }, 'No resume attached.')),
          a.resume ? h('div', { class: 'card stack' }, h('div', { class: 'row row--between' }, h('h3', null, 'Resume text'), a.resume.hasFile ? h('button', { class: 'btn btn--secondary btn--sm', onclick: () => openApplicationResume(a.id).catch((e) => toast(e.message, 'error')) }, icon('eye'), 'Open PDF') : null), h('div', { class: 'resume-text', tabindex: '0', 'aria-label': 'Extracted resume text' }, a.resume.text)) : null),
        h('aside', { class: 'stack' },
          h('div', { class: 'card stack stack--sm' }, h('h3', null, 'Your notes'), ratingInput(rating, (r) => { rating = r; }), noteBox, h('div', null, saveNote)),
          h('div', { class: 'card stack' }, h('div', { class: 'gap-grid' }, scoreRing(a.matchScore), h('div', null, h('h3', null, 'Match for this job'), h('p', { class: 'muted' }, 'Snapshot taken when they applied'))),
            h('div', null, h('h4', null, 'Has'), h('div', { class: 'chips', style: { marginTop: '8px' } }, a.gap.matched.length ? a.gap.matched.map((s) => skillChip(s.skill, 'matched', s.weight)) : h('span', { class: 'muted' }, 'None of the required skills'))),
            h('div', null, h('h4', null, 'Missing'), h('div', { class: 'chips', style: { marginTop: '8px' } }, a.gap.missing.length ? a.gap.missing.map((s) => skillChip(s.skill, 'missing', s.weight)) : h('span', { class: 'muted' }, 'Nothing missing')))),
          h('div', { class: 'card stack' }, h('h3', null, 'All skills'), h('div', { class: 'chips' }, a.student.skills.map((s) => skillChip(s, 'blue')))),
          h('div', { class: 'card stack' }, h('h3', null, 'History'), h('ol', { class: 'timeline' }, a.events.map((e) => h('li', { class: 'timeline__item' }, h('span', { class: 'timeline__dot timeline__dot--done' }, icon('check')), h('strong', null, STATUS_META[e.to]?.label || e.to), ' ', h('span', { class: 'muted' }, fmtDateTime(e.at)))))))));
  }
  await load();
  return h('div', { class: 'container page' }, host);
}

// ---------------------------------------------------------------- Company
export async function company() {
  const c = await get('/employers/me/company');
  const v = { name: input({ value: c.companyName, required: true }), website: input({ type: 'url', value: c.website, placeholder: 'https://' }), industry: input({ value: c.industry }), size: select([['', 'Select size'], ['1-10', '1–10'], ['11-50', '11–50'], ['51-200', '51–200'], ['201-1000', '201–1000'], ['1000+', '1000+']], c.size), location: input({ value: c.location }), about: textarea({ maxlength: '2000' }, c.description) };
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Save company');
  const form = h('form', { class: 'card stack', onsubmit: (e) => {
    e.preventDefault();
    busy(btn, async () => {
      try { await put('/employers/me/company', { companyName: v.name.value.trim(), website: v.website.value.trim(), industry: v.industry.value.trim(), size: v.size.value, description: v.about.value.trim(), location: v.location.value.trim() }); await reloadUser(); toast('Company saved', 'success'); } catch (ex) { toast(ex.message, 'error'); }
    });
  } }, h('div', { class: 'form-grid' }, field('Company name', v.name), field('Website', v.website), field('Industry', v.industry), field('Size', v.size), field('Location', v.location)), field('About', v.about), h('div', null, btn));
  return wrapPage(pageHead('Company', 'This is what students see on your job posts.', verifyBadge(c.verification)), pendingBanner(c.verification), form, await companyDnaCard(), await emailPrefsCard());
}

const FUNNEL = [['APPLIED', 'Applied'], ['SHORTLISTED', 'Shortlisted'], ['INTERVIEW', 'Interview'], ['OFFERED', 'Offered'], ['REJECTED', 'Rejected'], ['WITHDRAWN', 'Withdrawn']];

function applicantsChart(daily) {
  const max = Math.max(1, ...daily.map((x) => x.count));
  const total = daily.reduce((n, x) => n + x.count, 0);
  const fmt = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return h('div', { class: 'card' },
    h('h3', { class: 'card__title' }, 'New applicants', h('span', { class: 'muted' }, 'last 14 days')),
    h('p', { class: 'chart__total' }, String(total), h('small', null, total === 1 ? ' applicant' : ' applicants')),
    h('div', { class: 'chart', role: 'img', 'aria-label': `New applicants per day: ${daily.map((x) => `${fmt(x.date)} ${x.count}`).join(', ')}` },
      daily.map((x, i) => h('div', { class: 'chart__col', title: `${fmt(x.date)}: ${x.count}` },
        h('i', { class: `chart__bar${i === daily.length - 1 ? ' is-today' : ''}`, style: { '--h': `${Math.max(x.count ? 8 : 3, (x.count / max) * 100)}%` } })))),
    h('div', { class: 'chart__axis', 'aria-hidden': 'true' }, h('span', null, daily[0] ? fmt(daily[0].date) : ''), h('span', null, 'Today')));
}

function funnelChart(f) {
  const max = Math.max(1, ...FUNNEL.map(([k]) => f[k] || 0));
  return h('div', { class: 'card' },
    h('h3', { class: 'card__title' }, 'Pipeline by stage'),
    h('ul', { class: 'funnel' }, FUNNEL.map(([k, label]) => h('li', { 'data-st': k },
      h('span', { class: 'funnel__label' }, label),
      h('span', { class: 'funnel__track' }, h('i', { style: { '--w': `${((f[k] || 0) / max) * 100}%` } })),
      h('b', { class: 'funnel__n' }, String(f[k] || 0))))));
}
