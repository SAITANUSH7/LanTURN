import { get, post, put, patch, openPdf, session, reloadUser } from '../api.js';
import { h, clear, icon, scoreRing, skillChip, statusBadge, verifyBadge, fmtDate, fmtDateTime, empty, errorBox, loadingBlock, toast, confirmDialog, busy, field, input, select, textarea, TYPE_LABEL, STATUS_META, initials } from '../ui.js';
import { pageHead, wrapPage, analysisView } from './shared.js';

const pendingBanner = (v) => v === 'VERIFIED' ? null
  : h('div', { class: `alert ${v === 'REJECTED' ? 'alert--danger' : 'alert--warning'}`, role: 'status' }, icon(v === 'REJECTED' ? 'x' : 'clock'),
    h('div', null, h('strong', null, v === 'REJECTED' ? 'Your employer account was not approved.' : 'Your account is waiting for admin approval.'), h('p', null, 'You can set up your company profile now. Posting jobs unlocks once an admin approves your account.')));

// ---------------------------------------------------------------- Dashboard
export async function dashboard() {
  const [d, jobs] = await Promise.all([get('/employer/dashboard'), get('/employer/jobs')]);
  const stat = (label, value, cls = '') => h('div', { class: `stat ${cls}` }, h('div', { class: 'stat__label' }, label), h('div', { class: 'stat__value' }, value));
  return wrapPage(
    pageHead('Dashboard', 'Your hiring pipeline at a glance.', d.verification === 'VERIFIED' ? h('a', { class: 'btn btn--accent', href: '#/employer/jobs/new' }, icon('plus'), 'Post a job') : verifyBadge(d.verification)),
    pendingBanner(d.verification),
    h('div', { class: 'stats' }, stat('Open jobs', d.openJobs, 'stat--accent'), stat('Applicants', d.applicants), stat('Shortlisted', d.shortlisted), stat('Interviews', d.interviews), stat('Offers', d.offers)),
    h('section', { class: 'stack' }, h('div', { class: 'row row--between' }, h('h2', { class: 'section-title' }, 'Your jobs'), h('a', { href: '#/employer/jobs' }, 'Manage all')),
      jobs.items.length ? jobs.items.slice(0, 5).map(jobRow) : empty('briefcase', 'No jobs posted yet', d.verification === 'VERIFIED' ? 'Post your first role and start receiving matched candidates.' : 'Once approved, your postings appear here.', d.verification === 'VERIFIED' ? h('a', { class: 'btn', href: '#/employer/jobs/new' }, 'Post a job') : null)));
}

function jobRow(j, reload) {
  const actions = h('div', { class: 'row' },
    h('a', { class: 'btn btn--sm', href: `#/employer/jobs/${j.id}/candidates` }, icon('users'), `Candidates (${j.applicantCount})`),
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
export async function jobs() {
  const host = h('div', { class: 'stack' });
  const me = await get('/employer/dashboard');
  async function load() {
    try {
      const d = await get('/employer/jobs');
      clear(host);
      if (!d.items.length) host.append(empty('briefcase', 'No jobs yet', 'Post a role with the skills it needs. Candidates are ranked against them automatically.'));
      d.items.forEach((j) => host.append(jobRow(j, load)));
    } catch (e) { clear(host).append(errorBox(e, load)); }
  }
  await load();
  return wrapPage(pageHead('My jobs', 'Post roles and review who applied.', me.verification === 'VERIFIED' ? h('a', { class: 'btn btn--accent', href: '#/employer/jobs/new' }, icon('plus'), 'Post a job') : null), pendingBanner(me.verification), host);
}

// ---------------------------------------------------------------- Job form
export async function jobForm({ params, navigate }) {
  const editing = Boolean(params.id);
  const [me, existing] = await Promise.all([get('/employer/dashboard'), editing ? get(`/jobs/${params.id}`) : null]);
  const v = {
    title: input({ value: existing?.title || '', required: true, maxlength: '120' }),
    description: textarea({ rows: '7', maxlength: '5000', placeholder: 'What will this person do? What will they learn?' }, existing?.description || ''),
    type: select(Object.entries(TYPE_LABEL), existing?.type || 'INTERNSHIP'),
    location: input({ value: existing?.location || '', placeholder: 'City' }),
    comp: input({ value: existing?.compensation || '', placeholder: 'e.g. ₹25,000 / month' }),
    deadline: input({ type: 'date', value: existing?.deadline || '' }),
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
  const btn = h('button', { class: 'btn', type: 'submit', disabled: me.verification !== 'VERIFIED' ? true : null }, editing ? 'Save changes' : 'Publish job');
  const form = h('form', { class: 'card stack', onsubmit: (e) => {
    e.preventDefault();
    busy(btn, async () => {
      const body = { title: v.title.value.trim(), description: v.description.value.trim(), type: v.type.value, location: v.location.value.trim(), remote: v.remote.checked, compensation: v.comp.value.trim(), deadline: v.deadline.value || null, skills: [...skills.values()].map((s) => ({ skillId: s.id, weight: s.weight })) };
      try {
        if (editing) await put(`/employer/jobs/${params.id}`, body); else await post('/employer/jobs', body);
        toast(editing ? 'Job updated' : 'Job published', 'success');
        navigate('/employer/jobs');
      } catch (ex) { toast(ex.message, 'error'); }
    });
  } },
  field('Job title', v.title), field('Description', v.description),
  h('div', { class: 'form-grid' }, field('Type', v.type), field('Location', v.location), field('Compensation', v.comp), field('Apply by', v.deadline)),
  h('label', { class: 'check' }, v.remote, 'Remote friendly'),
  h('div', { class: 'stack stack--sm' }, h('h3', null, 'Required skills'), h('p', { class: 'hint muted' }, 'Weights drive the match score students and you see.'), skillList, h('div', { class: 'picker' }, search, list)),
  h('div', { class: 'form-actions' }, btn, h('a', { class: 'btn btn--secondary', href: '#/employer/jobs' }, 'Cancel')));
  return wrapPage(h('a', { class: 'crumb', href: '#/employer/jobs' }, icon('arrow-left'), 'My jobs'), pageHead(editing ? 'Edit job' : 'Post a job'), pendingBanner(me.verification), form);
}

// ---------------------------------------------------------------- Candidates
const STATUSES = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'REJECTED', 'WITHDRAWN'];
export async function candidates({ params, query }) {
  let status = query.status || '';
  let sort = query.sort === 'resume' ? 'resume' : 'match';
  const bar = h('div', { class: 'row row--between' });
  const list = h('div', { class: 'stack' });
  const titleEl = h('p', { class: 'strong' });
  async function load() {
    clear(list).append(loadingBlock(2));
    try {
      const d = await get(`/employer/jobs/${params.id}/candidates?sort=${sort}${status ? `&status=${status}` : ''}`);
      const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
      clear(bar).append(
        h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' },
          h('button', { class: 'filter', 'aria-pressed': String(!status), onclick: () => { status = ''; load(); } }, `All (${total})`),
          ...STATUSES.map((s) => h('button', { class: 'filter', 'aria-pressed': String(status === s), onclick: () => { status = s; load(); } }, `${STATUS_META[s].label} (${d.counts[s]})`))),
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Sort' }, h('button', { 'aria-pressed': String(sort === 'match'), onclick: () => { sort = 'match'; load(); } }, 'Best match'), h('button', { 'aria-pressed': String(sort === 'resume'), onclick: () => { sort = 'resume'; load(); } }, 'Resume score')));
      titleEl.textContent = d.job.title;
      clear(list);
      if (!d.items.length) { list.append(empty('users', 'No candidates here yet', status ? 'No applications have this status.' : 'Applications will appear as soon as students apply.')); return; }
      d.items.forEach((c) => list.append(h('a', { class: 'card card--hover cand', href: `#/employer/applications/${c.applicationId}` },
        h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials(c.student.name)),
        h('div', { class: 'stack stack--sm' }, h('div', { class: 'row' }, h('h3', null, c.student.name), statusBadge(c.status)),
          h('p', { class: 'muted' }, [c.student.degree, c.student.branch, c.student.college].filter(Boolean).join(' · ') || 'Profile incomplete'),
          h('div', { class: 'chips' }, c.topSkills.map((s) => skillChip(s, 'blue')))),
        h('div', { class: 'cand__scores' }, h('div', null, scoreRing(c.matchScore, { size: 'sm' }), 'Match'), h('div', null, c.resumeScore != null ? scoreRing(c.resumeScore, { size: 'sm', accent: true }) : h('span', { class: 'muted' }, '—'), 'Resume')))));
    } catch (e) { clear(list).append(errorBox(e, load)); }
  }
  await load();
  return wrapPage(h('a', { class: 'crumb', href: '#/employer/jobs' }, icon('arrow-left'), 'My jobs'), pageHead('Candidates', null), titleEl, bar, list);
}

export async function candidate({ params }) {
  const host = h('div', { class: 'stack stack--lg' });
  async function load() {
    const a = await get(`/employer/applications/${params.id}`);
    clear(host);
    const actions = a.allowedTransitions.map((s) => h('button', { class: `btn ${s === 'REJECTED' ? 'btn--danger' : ''}`, onclick: async (ev) => {
      if (s === 'REJECTED' && !(await confirmDialog({ title: 'Reject this candidate?', body: 'The student will see the new status.', confirmText: 'Reject', danger: true }))) return;
      busy(ev.currentTarget, async () => { try { await patch(`/employer/applications/${a.id}/status`, { status: s }); toast(`Moved to ${STATUS_META[s].label}`, 'success'); await load(); } catch (e) { toast(e.message, 'error'); } });
    } }, s === 'REJECTED' ? 'Reject' : `Move to ${STATUS_META[s].label}`));
    host.append(
      h('a', { class: 'crumb', href: `#/employer/jobs/${a.job.id}/candidates` }, icon('arrow-left'), `Candidates for ${a.job.title}`),
      h('div', { class: 'card stack' },
        h('div', { class: 'row row--between' }, h('div', { class: 'row' }, h('div', { class: 'avatar' }, initials(a.student.name)), h('div', null, h('h1', { style: { fontSize: '2.4rem' } }, a.student.name), h('p', { class: 'muted' }, [a.student.degree, a.student.branch, a.student.college, a.student.graduationYear].filter(Boolean).join(' · ')))), statusBadge(a.status)),
        h('div', { class: 'job__meta' }, h('span', null, icon('pin'), a.student.location || 'Location not set'), h('span', null, icon('file'), a.student.email), h('span', null, icon('clock'), `Applied ${fmtDate(a.appliedAt)}`)),
        a.student.bio ? h('p', null, a.student.bio) : null,
        a.coverNote ? h('div', { class: 'alert' }, icon('info'), h('div', null, h('strong', null, 'Cover note'), h('p', { class: 'prose' }, a.coverNote))) : null,
        h('div', { class: 'row' }, actions.length ? actions : h('span', { class: 'muted' }, 'This application is closed. No further status changes.'))),
      h('div', { class: 'split' },
        h('div', { class: 'stack' },
          h('div', { class: 'card stack' }, h('h3', null, 'Resume analysis'), a.resume ? analysisView(a.resume.analysis) : h('p', { class: 'muted' }, 'No resume attached.')),
          a.resume ? h('div', { class: 'card stack' }, h('div', { class: 'row row--between' }, h('h3', null, 'Resume text'), a.resume.hasFile ? h('button', { class: 'btn btn--secondary btn--sm', onclick: () => openPdf(a.resume.id).catch((e) => toast(e.message, 'error')) }, icon('eye'), 'Open PDF') : null), h('div', { class: 'resume-text', tabindex: '0', 'aria-label': 'Extracted resume text' }, a.resume.text)) : null),
        h('aside', { class: 'stack' },
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
  return wrapPage(pageHead('Company', 'This is what students see on your job posts.', verifyBadge(c.verification)), pendingBanner(c.verification), form);
}
