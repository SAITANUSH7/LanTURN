import { api, get, post, put, del, openPdf, session, reloadUser } from '../api.js';
import { h, clear, icon, scoreRing, skillChip, meter, statusBadge, fmtDate, fmtDateTime, empty, errorBox, loadingBlock, toast, confirmDialog, busy, field, input, select, textarea, TYPE_LABEL, STATUS_META, weightDots } from '../ui.js';
import { todayCard } from './studentTools.js';
import { pageHead, wrapPage, jobCard, analysisView, roadmapView, emailPrefsCard, interviewRow, messageThread } from './shared.js';
import { jobTools } from './ai.js';

const TERMINAL = ['OFFERED', 'REJECTED', 'WITHDRAWN'];

// First-run checklist: disappears once every step is done.
function onboarding(done) {
  const steps = [
    ['resume', 'Upload your resume', 'Get a score and let us find your skills.', '#/student/resume', 'file'],
    ['road', 'Pick a career direction', 'See your skill gaps and a step-by-step plan.', '#/student/career', 'route'],
    ['applied', 'Apply to your first job', 'Matched jobs show exactly which skills fit.', '#/student/jobs', 'briefcase'],
  ];
  const n = steps.filter(([k]) => done[k]).length;
  if (n === steps.length) return null;
  const next = steps.find(([k]) => !done[k]);
  return h('section', { class: 'card ob', 'aria-label': 'Getting started' },
    h('div', { class: 'row row--between' }, h('h2', { class: 'section-title' }, 'Get started'), h('span', { class: 'muted' }, `${n} of ${steps.length} done`)),
    h('div', { class: 'meter__track ob__bar', role: 'progressbar', 'aria-label': 'Getting started progress', 'aria-valuemin': '0', 'aria-valuemax': String(steps.length), 'aria-valuenow': String(n) }, h('i', { class: 'meter__fill', style: { width: `${(n / steps.length) * 100}%` } })),
    h('ol', { class: 'ob__list' }, steps.map(([k, title, text, href, ic]) => h('li', { class: `ob__step${done[k] ? ' is-done' : ''}${next[0] === k ? ' is-next' : ''}` },
      h('span', { class: 'ob__mark', 'aria-hidden': 'true' }, done[k] ? icon('check') : icon(ic)),
      h('div', null, h('strong', null, title), h('p', { class: 'muted' }, text)),
      done[k] ? h('span', { class: 'badge badge--success' }, 'Done') : h('a', { class: `btn btn--sm${next[0] === k ? ' btn--accent' : ' btn--secondary'}`, href }, next[0] === k ? 'Start' : 'Open')))));
}

// ---------------------------------------------------------------- Dashboard
export async function dashboard({ user }) {
  const [resumes, rec, apps, skills, road, today] = await Promise.all([
    get('/resumes'), get('/jobs/recommended'), get('/applications'), get('/students/me/skills'), get('/career/roadmaps/latest'), todayCard(),
  ]);
  const latest = resumes.items[0]?.analysis;
  const active = apps.items.filter((a) => !TERMINAL.includes(a.status)).length;
  // A dashboard number is a question ("where do I stand?") with a destination ("fix it here"). These are links.
  const stat = (label, value, href, hint, cls = '') => h('a', { class: `stat stat--link ${cls}`, href },
    h('div', { class: 'stat__label' }, label), h('div', { class: 'stat__value' }, value),
    h('span', { class: 'stat__hint' }, hint), h('span', { class: 'stat__go', 'aria-hidden': 'true' }, icon('arrow-right')));
  return wrapPage(
    pageHead(`Hi, ${(user.name || 'there').split(' ')[0]}`, 'Here is where you stand today.', h('a', { class: 'btn btn--accent', href: '#/student/jobs' }, 'Browse jobs', icon('arrow-right'))),
    today,
    onboarding({ resume: resumes.items.length > 0, road: !!road, applied: apps.items.length > 0 }),
    h('div', { class: 'stats' },
      stat('Resume score', latest?.overallScore ?? '—', '#/student/resume',
        latest ? (latest.missing?.length ? `${latest.missing.length} gap${latest.missing.length === 1 ? '' : 's'} to close` : 'looking strong') : 'upload one to get scored',
        latest ? 'stat--accent' : ''),
      stat('Skills on profile', skills.items.length, '#/student/profile', 'shown to employers on your matches'),
      stat('Active applications', active, '#/student/applications', `${apps.items.length} sent in total`),
      stat('Jobs matched for you', rec.items.length, '#/student/jobs', 'scored against your resume')),
    h('div', { class: 'split' },
      h('section', { class: 'stack' },
        h('div', { class: 'row row--between' }, h('h2', { class: 'section-title' }, 'Recommended for you'), h('a', { href: '#/student/jobs' }, 'See all jobs')),
        rec.items.length ? rec.items.slice(0, 5).map((j) => jobCard(j, `#/student/jobs/${j.id}`)) : empty('briefcase', 'No open jobs yet', 'Check back soon. New roles appear as employers post them.')),
      h('aside', { class: 'stack' },
        h('div', { class: 'card' }, h('h3', { class: 'card__title' }, 'Career roadmap'),
          road ? h('div', { class: 'stack stack--sm' }, h('p', { class: 'strong' }, road.plan.headline), h('p', { class: 'muted' }, `${road.plan.steps.length} steps · ${road.plan.totalWeeks} weeks`), h('a', { class: 'btn btn--sm btn--secondary', href: '#/student/career' }, 'Open roadmap'))
            : h('div', { class: 'stack stack--sm' }, h('p', { class: 'muted' }, 'Pick a target role to see your skill gaps and a step-by-step plan.'), h('a', { class: 'btn btn--sm', href: '#/student/career' }, icon('route'), 'Plan my path'))),
        h('div', { class: 'card' }, h('h3', { class: 'card__title' }, 'Recent applications'),
          apps.items.length ? h('ul', { class: 'stack stack--sm' }, apps.items.slice(0, 4).map((a) => h('li', { class: 'row row--between' }, h('span', { class: 'strong' }, a.job.title), statusBadge(a.status)))) : h('p', { class: 'muted' }, 'You have not applied yet.')))));
}

// ---------------------------------------------------------------- Jobs
export async function jobs({ query }) {
  const f = { q: query.q || '', type: query.type || '', location: query.location || '', remote: query.remote === 'true', page: Number(query.page) || 1 };
  const results = h('div', { class: 'stack' });
  const qEl = input({ type: 'search', placeholder: 'Title, company or keyword', value: f.q, 'aria-label': 'Search jobs by title, company or keyword' });
  const typeEl = select([['', 'Any type'], ...Object.entries(TYPE_LABEL)], f.type, { 'aria-label': 'Job type' });
  const locEl = input({ placeholder: 'City', value: f.location, 'aria-label': 'Filter by city' });
  const remoteEl = h('input', { type: 'checkbox', checked: f.remote ? true : null });

  const syncUrl = () => {
    const q = new URLSearchParams();
    if (f.q) q.set('q', f.q); if (f.type) q.set('type', f.type); if (f.location) q.set('location', f.location); if (f.remote) q.set('remote', 'true'); if (f.page > 1) q.set('page', String(f.page));
    try { history.replaceState(null, '', `#/student/jobs${q.toString() ? `?${q}` : ''}`); } catch { /* optional */ }
  };
  const activeBar = h('div', { class: 'filbar__active', hidden: true, 'aria-live': 'polite' });
  // Filters stay visible as removable chips, so the result count is never "0 jobs" for an invisible reason.
  const paintActive = () => {
    clear(activeBar);
    const on = [];
    if (f.q) on.push(['q', `\u201c${f.q}\u201d`]);
    if (f.type) on.push(['type', TYPE_LABEL[f.type] || f.type]);
    if (f.location) on.push(['location', f.location]);
    if (f.remote) on.push(['remote', 'Remote']);
    activeBar.hidden = !on.length;
    if (!on.length) return;
    activeBar.append(h('span', { class: 'filbar__active-label' }, 'Filtered by'));
    for (const [k, label] of on) {
      activeBar.append(h('button', { type: 'button', class: 'chip chip--x', 'aria-label': `Remove filter ${label}`, onclick: () => {
        if (k === 'q') { f.q = ''; qEl.value = ''; } else if (k === 'type') { f.type = ''; typeEl.value = ''; }
        else if (k === 'location') { f.location = ''; locEl.value = ''; } else { f.remote = false; remoteEl.checked = false; }
        f.page = 1; load();
      } }, label, icon('x')));
    }
    activeBar.append(h('button', { type: 'button', class: 'filbar__clear', onclick: () => {
      Object.assign(f, { q: '', type: '', location: '', remote: false, page: 1 });
      qEl.value = ''; typeEl.value = ''; locEl.value = ''; remoteEl.checked = false; load();
    } }, 'Clear all'));
  };
  async function load() {
    syncUrl();
    paintActive();
    clear(results).append(loadingBlock(3));
    const p = new URLSearchParams({ page: f.page, pageSize: 10 });
    if (f.q) p.set('q', f.q);
    if (f.type) p.set('type', f.type);
    if (f.location) p.set('location', f.location);
    if (f.remote) p.set('remote', 'true');
    try {
      const d = await get(`/jobs?${p}`);
      clear(results);
      if (!d.items.length) { results.append(empty('search', 'No jobs match these filters', 'Try removing a filter or searching a broader keyword.')); return; }
      results.append(h('p', { class: 'muted', 'aria-live': 'polite' }, `${d.total} job${d.total === 1 ? '' : 's'} found`), ...d.items.map((j) => jobCard(j, `#/student/jobs/${j.id}`)));
      const pages = Math.ceil(d.total / d.pageSize);
      if (pages > 1) results.append(h('div', { class: 'row row--between' },
        h('button', { class: 'btn btn--secondary btn--sm', disabled: f.page <= 1, onclick: () => { f.page--; load(); } }, icon('arrow-left'), 'Previous'),
        h('span', { class: 'muted' }, `Page ${d.page} of ${pages}`),
        h('button', { class: 'btn btn--secondary btn--sm', disabled: f.page >= pages, onclick: () => { f.page++; load(); } }, 'Next', icon('arrow-right'))));
    } catch (e) { clear(results).append(errorBox(e, load)); }
  }
  // Four stacked label+field pairs made the filter a form to fill in. It is a toolbar: type, narrow, go.
  const acts = h('div', { class: 'filbar__acts' },
    h('label', { class: 'filbar__check' }, remoteEl, h('span', null, 'Remote only')),
    h('button', { class: 'btn', type: 'submit' }, 'Search'));
  const form = h('form', { class: 'filbar', role: 'search', 'aria-label': 'Filter jobs', onsubmit: (e) => { e.preventDefault(); Object.assign(f, { q: qEl.value.trim(), type: typeEl.value, location: locEl.value.trim(), remote: remoteEl.checked, page: 1 }); load(); } },
    h('div', { class: 'filbar__q' }, icon('search'), qEl), typeEl, locEl, acts);
  // Saved searches: the filters you always type again, plus an alert when a job finally matches.
  const savedBar = h('section', { class: 'saved', hidden: true, 'aria-label': 'Saved searches' }, h('div', { class: 'chips' }));
  async function loadSaved() {
    try {
      const d = await get('/student/saved-searches');
      const chips = savedBar.querySelector('.chips');
      clear(chips);
      savedBar.hidden = !d.items.length;
      if (!d.items.length) return;
      chips.append(h('span', { class: 'saved__label' }, icon('star'), 'Saved searches'));
      for (const sv of d.items) {
        chips.append(h('span', { class: 'chip chip--saved' },
          h('button', {
            type: 'button', class: 'chip__go', title: `Apply "${sv.label}"`,
            onclick: () => {
              Object.assign(f, { q: sv.q, type: sv.type, location: sv.location, remote: sv.remote, page: 1 });
              qEl.value = sv.q; typeEl.value = sv.type; locEl.value = sv.location; remoteEl.checked = sv.remote;
              load();
            },
          }, `${sv.label} · ${sv.matches}`),
          h('button', {
            type: 'button', class: 'chip__x', 'aria-label': `Delete saved search ${sv.label}`,
            onclick: async () => { try { await del(`/student/saved-searches/${sv.id}`); await loadSaved(); toast('Saved search removed'); } catch (e) { toast(e.message, 'error'); } },
          }, '×')));
      }
    } catch { /* the panel is a convenience, never a blocker */ }
  }
  const saveBtn = h('button', {
    type: 'button', class: 'btn btn--secondary',
    onclick: (ev) => busy(ev.currentTarget, async () => {
      const filters = { q: qEl.value.trim(), type: typeEl.value, location: locEl.value.trim(), remote: remoteEl.checked, minMatch: 70 };
      if (!filters.q && !filters.type && !filters.location && !filters.remote) { toast('Add a filter first - an empty search would match every job', 'error'); return; }
      try {
        const r = await post('/student/saved-searches', filters);
        toast(r.duplicate ? 'That search is already saved' : 'Saved - we will alert you when a job matches', 'success');
        await loadSaved();
      } catch (e) { toast(e.message, 'error'); }
    }),
  }, icon('star'), 'Save search');
  acts.append(saveBtn);
  await loadSaved();
  load();
  return wrapPage(pageHead('Jobs', 'Every card shows how well your skills match.'), form, activeBar, savedBar, results, liveJobs(() => qEl.value.trim() || f.q, () => locEl.value.trim()));
}

export async function jobDetail({ params }) {
  const [job, resumes] = await Promise.all([get(`/jobs/${params.id}`), get('/resumes')]);
  const mb = job.matchBreakdown;
  const resumeSel = select(resumes.items.map((r) => [r.id, `${r.filename}${r.analysis?.overallScore != null ? ` · score ${r.analysis.overallScore}` : ''}`]), resumes.items[0]?.id);
  const note = textarea({ rows: '4', maxlength: '1500', placeholder: 'Optional: why are you a good fit?' });
  const applyBtn = h('button', { class: 'btn btn--accent btn--block', type: 'button' }, 'Apply now');
  applyBtn.onclick = () => busy(applyBtn, async () => {
    try {
      await post(`/jobs/${job.id}/apply`, { resumeId: Number(resumeSel.value), coverNote: note.value.trim() });
      toast('Application sent!', 'success');
      location.hash = '#/student/applications';
    } catch (e) { toast(e.message, 'error'); }
  });
  const applyCard = job.application
    ? h('div', { class: 'card stack stack--sm' }, h('h3', null, 'Your application'), statusBadge(job.application.status), h('a', { class: 'btn btn--secondary btn--sm', href: '#/student/applications' }, 'Track status'))
    : !resumes.items.length
      ? h('div', { class: 'card stack stack--sm' }, h('h3', null, 'Apply'), h('p', { class: 'muted' }, 'Upload a resume first so the employer can review it.'), h('a', { class: 'btn', href: '#/student/resume' }, icon('upload'), 'Upload resume'))
      : h('div', { class: 'card stack' }, h('h3', null, 'Apply'), field('Resume', resumeSel), field('Cover note', note), applyBtn);
  return wrapPage(
    h('a', { class: 'crumb', href: '#/student/jobs' }, icon('arrow-left'), 'All jobs'),
    h('div', { class: 'split' },
      h('div', { class: 'stack' },
        h('div', { class: 'card stack' },
          h('div', null, h('h1', { style: { fontSize: 'clamp(2rem,4vw,3rem)' } }, job.title), h('div', { class: 'job__meta', style: { marginTop: '10px' } },
            h('span', null, icon('building'), job.company.name), h('span', null, icon('briefcase'), TYPE_LABEL[job.type]), h('span', null, icon('pin'), job.remote ? 'Remote' : job.location || 'Flexible'), job.deadline ? h('span', null, icon('clock'), `Apply by ${fmtDate(job.deadline)}`) : null, job.compensation ? h('span', null, icon('chart'), job.compensation) : null)),
          h('p', { class: 'prose' }, job.description)),
        h('div', { class: 'card stack' }, h('h3', null, 'Required skills'),
          h('div', { class: 'chips' }, mb.matched.map((s) => skillChip(s.skill, 'matched', s.weight)), mb.missing.map((s) => skillChip(s.skill, 'missing', s.weight))),
          h('p', { class: 'hint muted' }, '✓ you have it · dashed = missing. Dots show importance.'),
          mb.missing.length ? h('a', { class: 'btn btn--secondary btn--sm', href: `#/student/career?jobId=${job.id}` }, icon('route'), 'Build a roadmap for this job') : null)),
      h('aside', { class: 'stack' },
        h('div', { class: 'card stack' }, h('div', { class: 'gap-grid' }, scoreRing(mb.score), h('div', null, h('h3', null, 'Your match'), h('p', { class: 'muted' }, 'Skills 80% · preferences 10% · freshness 10%'))),
          meter('Skill match', mb.skillMatch, 100), meter('Preferences', mb.prefMatch, 100), meter('Freshness', mb.freshness, 100)),
        applyCard, jobTools(job.id))));
}

// ---------------------------------------------------------------- Applications
const APP_FILTERS = [['', 'All'], ['active', 'Active'], ['OFFERED', 'Offered'], ['closed', 'Closed']];
const appMatches = (f, a) => !f || (f === 'active' ? !TERMINAL.includes(a.status) : f === 'closed' ? ['REJECTED', 'WITHDRAWN'].includes(a.status) : a.status === f);

export async function applications({ onLeave, query = {} }) {
  let filter = APP_FILTERS.some(([k]) => k === query.status) ? query.status || '' : '';
  const filters = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter applications' });
  let all = [];
  const list = h('div', { class: 'stack' });
  const stamp = h('span', { class: 'muted', 'aria-live': 'polite' });
  function paint() {
    clear(list);
    clear(filters).append(...APP_FILTERS.map(([k, label]) => h('button', { type: 'button', class: 'filter', 'aria-pressed': String(filter === k), onclick: () => { filter = k; try { history.replaceState(null, '', `#/student/applications${k ? `?status=${k}` : ''}`); } catch { /* optional */ } paint(); } }, `${label} (${all.filter((a) => appMatches(k, a)).length})`)));
    const shown = all.filter((a) => appMatches(filter, a));
    if (!all.length) list.append(empty('clock', 'No applications yet', 'Apply to a job and its status will show up here.', h('a', { class: 'btn', href: '#/student/jobs' }, 'Find jobs')));
    else if (!shown.length) list.append(empty('search', 'Nothing in this view', 'Try another filter.'));
    else shown.forEach((a) => list.append(appCard(a, () => load(true))));
  }
  async function load(quiet) {
    try {
      const d = await get('/applications');
      all = d.items;
      if (quiet && (list.querySelector('details[open]') || list.contains(document.activeElement))) { stamp.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; return; } // do not wipe an open thread or a half-written reply
      paint();
      stamp.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · refreshes every 30 s`;
    } catch (e) { if (!quiet) clear(list).append(errorBox(e, () => load())); }
  }
  await load();
  const t = setInterval(() => load(true), 30000);
  onLeave(() => clearInterval(t));
  return wrapPage(pageHead('Applications', 'Track every application from applied to offer.', h('button', { class: 'btn btn--secondary btn--sm', onclick: () => load() }, icon('refresh'), 'Refresh')), stamp, filters, list);
}

function appCard(a, reload) {
  const withdraw = h('button', { class: 'btn btn--danger btn--sm', onclick: async () => {
    if (!(await confirmDialog({ title: 'Withdraw application?', body: `You will no longer be considered for ${a.job.title}.`, confirmText: 'Withdraw', danger: true }))) return;
    try { await post(`/applications/${a.id}/withdraw`); toast('Application withdrawn'); reload(); } catch (e) { toast(e.message, 'error'); }
  } }, 'Withdraw');
  return h('div', { class: 'card stack' },
    h('div', { class: 'row row--between' },
      h('div', null, h('h3', null, a.job.title), h('p', { class: 'muted' }, `${a.job.company} · applied ${fmtDate(a.createdAt)}`), a.employerReply ? h('p', { class: 'muted reply-hint' }, icon('clock'), a.employerReply) : null),
      h('div', { class: 'row' }, h('div', { class: 'job__score' }, scoreRing(a.matchScore, { size: 'sm' }), 'match'), statusBadge(a.status))),
    h('ol', { class: 'timeline', 'aria-label': 'Status history' }, a.events.map((e, i) => h('li', { class: 'timeline__item' },
      h('span', { class: `timeline__dot ${i < a.events.length - 1 ? 'timeline__dot--done' : ''}` }, icon(i < a.events.length - 1 ? 'check' : 'clock')),
      h('strong', null, STATUS_META[e.to]?.label || e.to), ' ', h('span', { class: 'muted' }, fmtDateTime(e.at))))),
    a.interviews?.some((x) => x.status === 'SCHEDULED') ? h('div', { class: 'stack stack--sm' }, h('h4', null, 'Interview'), ...a.interviews.filter((x) => x.status === 'SCHEDULED').map((x) => interviewRow(x))) : null,
    a.status !== 'WITHDRAWN' ? h('details', { class: 'fold', ontoggle: (e) => { if (e.target.open && !e.target.dataset.loaded) { e.target.dataset.loaded = '1'; e.target.append(messageThread(a.id)); } } }, h('summary', null, a.messageCount ? `Messages (${a.messageCount})` : 'Messages')) : null,
    !TERMINAL.includes(a.status) ? h('div', null, withdraw) : null);
}

// ---------------------------------------------------------------- Resume
export async function resume() {
  const host = h('div', { class: 'stack stack--lg' });
  const needsConsent = !session.user.consentAt;
  const file = h('input', { type: 'file', accept: 'application/pdf,.pdf,image/png,image/jpeg,image/webp' });
  const fileName = h('span', { class: 'strong' }, 'Choose a PDF or photo (max 4 MB)');
  const consent = h('input', { type: 'checkbox' });
  const uploadBtn = h('button', { class: 'btn', type: 'button', disabled: true }, icon('upload'), 'Upload and analyse');
  const drop = h('label', { class: 'dropzone' }, icon('upload'), fileName, h('p', { class: 'muted' }, 'PDF, or a PNG, JPG or WebP photo. Scans and photos are read by the AI vision model.'), file);
  file.onchange = () => { fileName.textContent = file.files[0]?.name || 'Choose a PDF or photo (max 4 MB)'; uploadBtn.disabled = !file.files[0]; };
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) { file.files = e.dataTransfer.files; file.onchange(); } });
  uploadBtn.onclick = () => busy(uploadBtn, async () => {
    if (needsConsent && !consent.checked) { toast('Please tick the consent box first.', 'error'); return; }
    const fd = new FormData();
    fd.append('file', file.files[0]);
    if (consent.checked) fd.append('consent', 'true');
    try {
      const res = await api('POST', '/resumes', { form: fd });
      toast('Resume analysed. Setting up your profile…', 'success');
      await reloadUser();
      file.value = ''; fileName.textContent = 'Choose a PDF or photo (max 4 MB)';
      if (res?.setup) { location.hash = '/student/setup'; return; }
      await refresh();
    } catch (e) { toast(e.message, 'error'); }
  });

  async function refresh() {
    try {
      const d = await get('/resumes');
      clear(host);
      host.append(h('div', { class: 'card stack' }, h('h3', null, 'Upload a resume'), drop,
        needsConsent && !session.user.consentAt ? h('label', { class: 'check' }, consent, h('span', null, 'I agree that my resume text is processed by LanTURN’s analysis engine (and a language model, if the administrator has enabled one) to score it and suggest improvements. I can delete it any time.')) : null,
        h('div', null, uploadBtn)));
      if (!d.items.length) host.append(empty('file', 'No resumes yet', 'Upload your first resume to see your score and recognised skills.'));
      d.items.forEach((r) => host.append(resumeCard(r, refresh)));
    } catch (e) { clear(host).append(errorBox(e, refresh)); }
  }
  await refresh();
  return wrapPage(pageHead('Resume', 'Get a score, the skills we found and what to improve first.'), host);
}

function resumeCard(r, refresh) {
  const reBtn = h('button', { class: 'btn btn--secondary btn--sm' }, icon('refresh'), 'Re-analyse');
  reBtn.onclick = () => busy(reBtn, async () => { try { await post(`/resumes/${r.id}/analyze`); toast('Analysis updated', 'success'); await refresh(); } catch (e) { toast(e.message, 'error'); } });
  return h('div', { class: 'card stack' },
    h('div', { class: 'row row--between' },
      h('div', null, h('h3', null, r.filename), h('p', { class: 'muted' }, `${(r.sizeBytes / 1024).toFixed(0)} KB · ${r.pageCount} page${r.pageCount > 1 ? 's' : ''} · ${fmtDate(r.createdAt)}`)),
      h('div', { class: 'row' },
        r.hasFile ? h('button', { class: 'btn btn--secondary btn--sm', onclick: () => openPdf(r.id).catch((e) => toast(e.message, 'error')) }, icon('eye'), 'View PDF') : null,
        reBtn,
        h('button', { class: 'btn btn--danger btn--sm', onclick: async () => {
          if (!(await confirmDialog({ title: 'Delete this resume?', body: 'The file, its text and its analyses are removed permanently. Applications that used it keep their status.', confirmText: 'Delete', danger: true }))) return;
          try { await del(`/resumes/${r.id}`); toast('Resume deleted'); refresh(); } catch (e) { toast(e.message, 'error'); }
        } }, icon('trash'), 'Delete'))),
    analysisView(r.analysis));
}

// ---------------------------------------------------------------- Career
export async function career({ query }) {
  const [roles, latest] = await Promise.all([get('/roles'), get('/career/roadmaps/latest')]);
  const out = h('div', { class: 'stack stack--lg' });
  const roleSel = select([['', 'Choose a target role…'], ...roles.items.map((r) => [r.id, r.title])], '');
  const jobId = Number(query.jobId) || null;
  const body = () => (jobId ? { jobId } : { roleId: Number(roleSel.value) });

  function gapCard(g) {
    const planBtn = h('button', { class: 'btn btn--accent', type: 'button' }, icon('sparkle'), 'Generate my roadmap');
    planBtn.onclick = () => busy(planBtn, async () => {
      try { const r = await post('/career/roadmaps', body()); showRoadmap(r); toast('Roadmap ready', 'success'); } catch (e) { toast(e.message, 'error'); }
    });
    return h('div', { class: 'card stack' },
      h('div', { class: 'gap-grid' }, scoreRing(g.matchPercent, { accent: true }), h('div', null, h('h2', { style: { fontSize: '1.8rem' } }, g.target.title), h('p', { class: 'muted' }, `Weighted skill match based on the ${g.studentSkillCount} skills on your profile.`))),
      h('div', { class: 'gap-cols' },
        h('div', null, h('h4', null, 'You have'), h('p', { class: 'chips-legend' }, 'Each dot is how heavily this job weights the skill. Three dots means it matters most.'), h('div', { class: 'chips' }, g.matched.length ? g.matched.map((s) => skillChip(s.skill, 'matched', s.weight)) : h('span', { class: 'muted' }, 'Nothing yet. Add skills in your profile or upload a resume.'))),
        h('div', null, h('h4', null, 'Still missing'), h('p', { class: 'chips-legend' }, 'Ordered by how much the job weights them.'), h('div', { class: 'chips' }, g.missing.length ? g.missing.map((s) => skillChip(s.skill, 'missing', s.weight)) : h('span', { class: 'muted' }, 'No gaps. You cover every listed skill.')))),
      g.missing.length ? h('div', null, planBtn) : null);
  }
  const roadHost = h('div');
  function showRoadmap(r) { clear(roadHost).append(h('h2', { class: 'section-title', style: { marginBottom: '12px' } }, 'Your roadmap'), roadmapView(r)); roadHost.scrollIntoView({ behavior: 'smooth' }); }

  const gapHost = h('div');
  async function analyse() {
    if (!jobId && !roleSel.value) { toast('Pick a role first', 'error'); return; }
    clear(gapHost).append(loadingBlock(1));
    try { clear(gapHost).append(gapCard(await post('/career/skill-gap', body()))); } catch (e) { clear(gapHost).append(errorBox(e, analyse)); }
  }
  const goBtn = h('button', { class: 'btn', type: 'button', onclick: analyse }, icon('target'), 'Analyse my gap');
  out.append(
    h('div', { class: 'card prompt' },
      h('div', { class: 'prompt__copy' },
        h('h3', null, jobId ? 'Gap analysis for this job' : 'Where do you stand against a role?'),
        h('p', { class: 'muted' }, jobId
          ? 'We compare the skills this job weights against what is on your profile right now.'
          : 'Pick a target role to see the skills you already have, the ones you are missing, and the plan that closes the gap.')),
      h('div', { class: 'prompt__act' }, jobId ? null : roleSel, goBtn)),
    gapHost, roadHost);
  if (jobId) analyse();
  else if (latest) { roadHost.append(h('h2', { class: 'section-title', style: { marginBottom: '12px' } }, 'Your latest roadmap'), roadmapView(latest)); }
  return wrapPage(pageHead('Career', 'Compare your skills with a role, then follow a plan to close the gap.'), out);
}

// ---------------------------------------------------------------- Profile
export async function profile() {
  const [p, sk] = await Promise.all([get('/students/me/profile'), get('/students/me/skills')]);
  const v = {
    fullName: input({ value: p.fullName, required: true }), college: input({ value: p.college }), degree: input({ value: p.degree, placeholder: 'B.Tech' }),
    branch: input({ value: p.branch, placeholder: 'CSE (AI)' }), year: input({ type: 'number', value: p.graduationYear ?? '', min: '2000', max: '2100' }),
    location: input({ value: p.location }), bio: textarea({ maxlength: '1000', placeholder: 'A short intro for employers' }, p.bio),
    locs: input({ value: p.preferredLocations.join(', '), placeholder: 'Hyderabad, Remote' }),
  };
  const types = new Set(p.preferredTypes);
  const typeBoxes = Object.entries(TYPE_LABEL).map(([k, l]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: types.has(k) ? true : null, onchange: (e) => (e.target.checked ? types.add(k) : types.delete(k)) }), l));
  const saveBtn = h('button', { class: 'btn', type: 'submit' }, 'Save profile');
  const profileForm = h('form', { class: 'card stack', onsubmit: (e) => {
    e.preventDefault();
    busy(saveBtn, async () => {
      try {
        await put('/students/me/profile', { fullName: v.fullName.value.trim(), college: v.college.value.trim(), degree: v.degree.value.trim(), branch: v.branch.value.trim(), graduationYear: v.year.value ? Number(v.year.value) : null, location: v.location.value.trim(), bio: v.bio.value.trim(), preferredTypes: [...types], preferredLocations: v.locs.value.split(',').map((s) => s.trim()).filter(Boolean) });
        await reloadUser(); toast('Profile saved', 'success');
      } catch (ex) { toast(ex.message, 'error'); }
    });
  } },
  h('h3', null, 'About you'),
  h('div', { class: 'form-grid' }, field('Full name', v.fullName), field('College', v.college), field('Degree', v.degree), field('Branch', v.branch), field('Graduation year', v.year), field('Location', v.location)),
  field('Bio', v.bio),
  h('h3', null, 'Job preferences'),
  h('div', { class: 'row' }, typeBoxes),
  field('Preferred locations', v.locs, { hint: 'Comma separated. Remote jobs always count as a location match.' }),
  h('div', null, saveBtn));

  // Skills editor
  const mine = new Map(sk.items.map((s) => [s.id, s]));
  const chips = h('div', { class: 'chips' });
  const paint = () => {
    clear(chips);
    if (!mine.size) chips.append(h('span', { class: 'muted' }, 'No skills yet. Search below or upload a resume.'));
    [...mine.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((s) => chips.append(h('span', { class: 'chip chip--blue' }, s.name, s.source === 'RESUME' ? h('small', { title: 'Found in your resume' }, '· resume') : null,
      h('button', { type: 'button', 'aria-label': `Remove ${s.name}`, onclick: () => { mine.delete(s.id); paint(); } }, icon('x')))));
  };
  paint();
  const search = input({ type: 'search', placeholder: 'Search skills, e.g. Kotlin, SQL, Docker', autocomplete: 'off', 'aria-label': 'Search skills' });
  const list = h('div', { class: 'picker__list', hidden: true });
  let timer;
  search.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = search.value.trim();
      if (!q) { list.hidden = true; return; }
      const d = await get(`/skills?q=${encodeURIComponent(q)}`);
      clear(list);
      d.items.filter((s) => !mine.has(s.id)).forEach((s) => list.append(h('button', { type: 'button', onclick: () => { mine.set(s.id, { ...s, source: 'MANUAL' }); paint(); search.value = ''; list.hidden = true; } }, s.name, h('small', null, s.category))));
      list.hidden = !list.childNodes.length;
    }, 180);
  };
  const skillBtn = h('button', { class: 'btn', type: 'button' }, 'Save skills');
  skillBtn.onclick = () => busy(skillBtn, async () => { try { await put('/students/me/skills', { skillIds: [...mine.keys()] }); toast('Skills saved', 'success'); } catch (e) { toast(e.message, 'error'); } });
  const skillCard = h('div', { class: 'card stack' }, h('h3', null, 'Your skills'), chips, h('div', { class: 'picker' }, search, list), h('div', null, skillBtn));
  return wrapPage(pageHead('Profile', 'Employers and the matching engine use this to find your best fit.'), h('div', { class: 'grid grid--2', style: { alignItems: 'start' } }, profileForm, skillCard), await emailPrefsCard());
}

// Live job boards (Adzuna / Jooble when the administrator set a key); otherwise campus postings.
function liveJobs(getQ, getLoc) {
  const out = h('div', { class: 'stack' });
  const q = input({ type: 'search', placeholder: 'e.g. react developer', 'aria-label': 'Live job search keywords' });
  const btn = h('button', { class: 'btn btn--secondary', type: 'button' }, icon('search'), 'Search live job boards');
  btn.onclick = () => busy(btn, async () => {
    const keywords = (q.value || getQ()).trim();
    if (!keywords) { toast('Type a keyword first.', 'error'); return; }
    clear(out).append(loadingBlock(2));
    try {
      const d = await post('/jobs/external-search', { keywords, location: getLoc() });
      clear(out);
      out.append(h('p', { class: 'muted', 'aria-live': 'polite' }, d.source === 'campus' ? 'No live job board is connected yet, so these are campus postings.' : `${d.totalCount} result${d.totalCount === 1 ? '' : 's'} from ${d.source === 'adzuna' ? 'Adzuna' : 'Jooble'}. Opens on the employer site.`));
      if (!d.jobs.length) out.append(empty('search', 'Nothing found', 'Try a broader keyword.'));
      for (const j of d.jobs) out.append(h('a', { class: 'card card--link stack stack--sm', href: j.link, ...(j.link.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
        h('strong', null, j.title), h('span', { class: 'muted' }, [j.company, j.location, j.salary].filter(Boolean).join(' · ')), h('p', { class: 'muted' }, j.snippet)));
    } catch (e) { clear(out).append(errorBox(e, () => btn.click())); }
  });
  return h('section', { class: 'card stack' }, h('h3', null, 'Search beyond campus'), h('p', { class: 'muted' }, 'Look up live openings on public job boards.'), h('div', { class: 'row' }, q, btn), out);
}
