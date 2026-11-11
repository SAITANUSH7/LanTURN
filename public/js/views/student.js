import { api, get, post, put, del, openPdf, session, reloadUser } from '../api.js';
import { h, clear, icon, scoreRing, skillChip, meter, statusBadge, fmtDate, fmtDateTime, empty, errorBox, loadingBlock, toast, confirmDialog, busy, field, input, select, textarea, TYPE_LABEL, STATUS_META, weightDots } from '../ui.js';
import { pageHead, wrapPage, jobCard, analysisView, roadmapView } from './shared.js';
import { jobTools } from './ai.js';

const TERMINAL = ['OFFERED', 'REJECTED', 'WITHDRAWN'];

// ---------------------------------------------------------------- Dashboard
export async function dashboard({ user }) {
  const [resumes, rec, apps, skills, road] = await Promise.all([
    get('/resumes'), get('/jobs/recommended'), get('/applications'), get('/students/me/skills'), get('/career/roadmaps/latest'),
  ]);
  const latest = resumes.items[0]?.analysis;
  const active = apps.items.filter((a) => !TERMINAL.includes(a.status)).length;
  const stat = (label, value, cls = '') => h('div', { class: `stat ${cls}` }, h('div', { class: 'stat__label' }, label), h('div', { class: 'stat__value' }, value));
  return wrapPage(
    pageHead(`Hi, ${(user.name || 'there').split(' ')[0]}`, 'Here is where you stand today.', h('a', { class: 'btn btn--accent', href: '#/student/jobs' }, 'Browse jobs', icon('arrow-right'))),
    h('div', { class: 'stats' },
      stat('Resume score', latest?.overallScore ?? '—', 'stat--accent'), stat('Skills on profile', skills.items.length), stat('Active applications', active), stat('Jobs matched for you', rec.items.length)),
    !resumes.items.length
      ? h('div', { class: 'card card--accent row row--between' }, h('div', null, h('h3', null, 'Start with your resume'), h('p', null, 'Upload a PDF to get a score, your skills and better job matches.')), h('a', { class: 'btn', href: '#/student/resume' }, icon('upload'), 'Upload resume'))
      : null,
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
  const qEl = input({ type: 'search', placeholder: 'Title, company or keyword', value: f.q });
  const typeEl = select([['', 'Any type'], ...Object.entries(TYPE_LABEL)], f.type);
  const locEl = input({ placeholder: 'City', value: f.location });
  const remoteEl = h('input', { type: 'checkbox', checked: f.remote ? true : null });

  async function load() {
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
  const form = h('form', { class: 'card', onsubmit: (e) => { e.preventDefault(); Object.assign(f, { q: qEl.value.trim(), type: typeEl.value, location: locEl.value.trim(), remote: remoteEl.checked, page: 1 }); load(); } },
    h('div', { class: 'form-grid' }, field('Search', qEl), field('Type', typeEl), field('Location', locEl),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Work mode'), h('label', { class: 'check', style: { minHeight: '46px', alignItems: 'center' } }, remoteEl, 'Remote only'))),
    h('div', { class: 'form-actions', style: { marginTop: '16px' } }, h('button', { class: 'btn', type: 'submit' }, icon('search'), 'Search')));
  load();
  return wrapPage(pageHead('Jobs', 'Every card shows how well your skills match.'), form, results);
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
export async function applications({ onLeave }) {
  const list = h('div', { class: 'stack' });
  const stamp = h('span', { class: 'muted', 'aria-live': 'polite' });
  async function load(quiet) {
    try {
      const d = await get('/applications');
      clear(list);
      if (!d.items.length) list.append(empty('clock', 'No applications yet', 'Apply to a job and its status will show up here.', h('a', { class: 'btn', href: '#/student/jobs' }, 'Find jobs')));
      d.items.forEach((a) => list.append(appCard(a, () => load(true))));
      stamp.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · refreshes every 30 s`;
    } catch (e) { if (!quiet) clear(list).append(errorBox(e, () => load())); }
  }
  await load();
  const t = setInterval(() => load(true), 30000);
  onLeave(() => clearInterval(t));
  return wrapPage(pageHead('Applications', 'Track every application from applied to offer.', h('button', { class: 'btn btn--secondary btn--sm', onclick: () => load() }, icon('refresh'), 'Refresh')), stamp, list);
}

function appCard(a, reload) {
  const withdraw = h('button', { class: 'btn btn--danger btn--sm', onclick: async () => {
    if (!(await confirmDialog({ title: 'Withdraw application?', body: `You will no longer be considered for ${a.job.title}.`, confirmText: 'Withdraw', danger: true }))) return;
    try { await post(`/applications/${a.id}/withdraw`); toast('Application withdrawn'); reload(); } catch (e) { toast(e.message, 'error'); }
  } }, 'Withdraw');
  return h('div', { class: 'card stack' },
    h('div', { class: 'row row--between' },
      h('div', null, h('h3', null, a.job.title), h('p', { class: 'muted' }, `${a.job.company} · applied ${fmtDate(a.createdAt)}`)),
      h('div', { class: 'row' }, h('div', { class: 'job__score' }, scoreRing(a.matchScore, { size: 'sm' }), 'match'), statusBadge(a.status))),
    h('ol', { class: 'timeline', 'aria-label': 'Status history' }, a.events.map((e, i) => h('li', { class: 'timeline__item' },
      h('span', { class: `timeline__dot ${i < a.events.length - 1 ? 'timeline__dot--done' : ''}` }, icon(i < a.events.length - 1 ? 'check' : 'clock')),
      h('strong', null, STATUS_META[e.to]?.label || e.to), ' ', h('span', { class: 'muted' }, fmtDateTime(e.at))))),
    !TERMINAL.includes(a.status) ? h('div', null, withdraw) : null);
}

// ---------------------------------------------------------------- Resume
export async function resume() {
  const host = h('div', { class: 'stack stack--lg' });
  const needsConsent = !session.user.consentAt;
  const file = h('input', { type: 'file', accept: 'application/pdf,.pdf' });
  const fileName = h('span', { class: 'strong' }, 'Choose a PDF (max 4 MB)');
  const consent = h('input', { type: 'checkbox' });
  const uploadBtn = h('button', { class: 'btn', type: 'button', disabled: true }, icon('upload'), 'Upload and analyse');
  const drop = h('label', { class: 'dropzone' }, icon('upload'), fileName, h('p', { class: 'muted' }, 'Text-based PDFs only. Scans and images cannot be read.'), file);
  file.onchange = () => { fileName.textContent = file.files[0]?.name || 'Choose a PDF (max 4 MB)'; uploadBtn.disabled = !file.files[0]; };
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) { file.files = e.dataTransfer.files; file.onchange(); } });
  uploadBtn.onclick = () => busy(uploadBtn, async () => {
    if (needsConsent && !consent.checked) { toast('Please tick the consent box first.', 'error'); return; }
    const fd = new FormData();
    fd.append('file', file.files[0]);
    if (consent.checked) fd.append('consent', 'true');
    try {
      await api('POST', '/resumes', { form: fd });
      toast('Resume analysed', 'success');
      await reloadUser();
      file.value = ''; fileName.textContent = 'Choose a PDF (max 4 MB)';
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
      h('div', null, h('h4', null, 'You have'), h('div', { class: 'chips', style: { marginTop: '8px' } }, g.matched.length ? g.matched.map((s) => skillChip(s.skill, 'matched', s.weight)) : h('span', { class: 'muted' }, 'Nothing yet. Add skills in your profile or upload a resume.'))),
      h('div', null, h('h4', null, 'Still missing (most important first)'), h('div', { class: 'chips', style: { marginTop: '8px' } }, g.missing.length ? g.missing.map((s) => skillChip(s.skill, 'missing', s.weight)) : h('span', { class: 'muted' }, 'No gaps. You cover every listed skill.'))),
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
    h('div', { class: 'card stack' }, jobId ? h('p', null, 'Analysing the requirements of a specific job.') : field('Target role', roleSel), h('div', null, goBtn)),
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
  return wrapPage(pageHead('Profile', 'Employers and the matching engine use this to find your best fit.'), h('div', { class: 'grid grid--2', style: { alignItems: 'start' } }, profileForm, skillCard));
}
