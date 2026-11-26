import { login as doLogin, register as doRegister, joinTeam, get } from '../api.js';
import { h, icon, field, input, busy, skillChip, toast, passwordField, lantern } from '../ui.js';

const home = (u) => (u.role === 'STUDENT' ? '/student' : u.role === 'EMPLOYER' ? '/employer' : '/admin');

const bar = (n, on, c) => h('i', { class: `bar${on ? ' on' : ''}`, style: { '--h': `${n}%`, '--k': c } });

export function landing({ navigate, user }) {
  if (user) { navigate(home(user)); return h('div'); }
  const cell = (cls, k, ic, tag, title, text, viz) => h('article', { class: `bento__c ${cls}`, style: { '--k': k } },
    h('span', { class: 'bento__tag' }, icon(ic), tag), h('h3', null, title), h('p', null, text), viz);
  const dot = (c, txt, on) => h('span', { class: on ? 'on' : '', style: { '--d': c } }, txt);
  const bullets = (items) => h('ul', null, items.map((x) => h('li', null, icon('check'), x)));
  return h('div', { class: 'lp' },
    h('section', { class: 'lp-hero' }, h('div', { class: 'container' },
      h('span', { class: 'eyebrow' }, 'Career intelligence for students and employers'),
      h('h1', null, 'Turn your skills into offers'),
      h('p', { class: 'lp-hero__lead' }, 'Upload a resume and LanTURN scores it, finds your skill gaps, builds a roadmap you can follow, and matches you to jobs that actually fit. Employers get ranked candidates with the reasons why.'),
      h('div', { class: 'lp-cta' },
        h('a', { class: 'btn btn--lg', href: '#/register' }, 'Get started free', icon('arrow-right')),
        h('a', { class: 'btn btn--secondary btn--lg', href: '#/login' }, 'Sign in')),
      h('p', { class: 'lp-note' }, 'Free for students. Employer accounts are reviewed before posting.'),
      h('div', { class: 'lp-window', 'aria-label': 'Preview of the LanTURN dashboard' },
        h('div', { class: 'lp-window__bar', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('span', null, 'lanturn / home')),
        h('div', { class: 'lp-window__body' },
          h('div', { class: 'lp-side', 'aria-hidden': 'true' }, dot('#60a5fa', 'Home', true), dot('#22d3ee', 'Jobs'), dot('#f5b544', 'Applications'), dot('#a78bfa', 'Resume'), dot('#8da2fb', 'Roadmap'), dot('#fb923c', 'Arena'), dot('#818cf8', 'Coach')),
          h('div', { class: 'lp-main' },
            h('div', { class: 'lp-tile' }, h('small', null, 'Resume score'), h('b', null, '82'), h('div', { class: 'lp-bar' }, h('i', { style: { '--w': '82%' } }))),
            h('div', { class: 'lp-tile' }, h('small', null, 'Roadmap progress'), h('b', null, '7 of 25'), h('div', { class: 'lp-bar' }, h('i', { style: { '--w': '28%' } }))),
            h('div', { class: 'lp-tile' }, h('small', null, 'Day streak'), h('b', null, '12'), h('div', { class: 'lp-bar' }, h('i', { style: { '--w': '60%' } }))),
            h('div', { class: 'lp-tile lp-tile--wide' }, h('small', null, 'Matched for you'),
              h('div', { class: 'lp-row' }, h('span', null, 'Android Developer'), h('span', null, h('em', null, 'Kotlin, Compose  '), skillChip('92%', 'matched', 0))),
              h('div', { class: 'lp-row' }, h('span', null, 'Backend Engineer'), h('span', null, h('em', null, 'Node, SQL  '), skillChip('78%', 'matched', 0))),
              h('div', { class: 'lp-row' }, h('span', null, 'ML Intern'), h('span', null, h('em', null, 'Python  '), skillChip('64%', 'missing', 0)))),
            h('div', { class: 'lp-tile' }, h('small', null, 'Next step'), h('p', { style: { marginTop: '8px', fontWeight: '600' } }, 'Build a small Compose app with a remote API'), h('p', { class: 'muted', style: { fontSize: '0.875rem', marginTop: '6px' } }, 'Closes 2 skill gaps'))))))),
    h('div', { class: 'container' }, h('div', { class: 'lp-logos', 'aria-label': 'What is inside' },
      [['sparkle', 'Resume analysis'], ['route', 'Roadmaps'], ['briefcase', 'Job matching'], ['bolt', 'Skill arena'], ['users', 'Mock interviews'], ['chart', 'Candidate ranking']].map(([i, t]) => h('span', null, icon(i), t)))),
    h('section', { class: 'lp-sec' }, h('div', { class: 'container' },
      h('div', { class: 'lp-sec__head' }, h('span', { class: 'eyebrow' }, 'Platform'), h('h2', null, 'Everything between “I have a degree” and “I have an offer”'), h('p', null, 'One workspace for the whole placement journey, with scoring you can inspect instead of a black box.')),
      h('div', { class: 'bento' },
        cell('bento__c--x', '#a78bfa', 'file', 'Resume intelligence', 'A score that explains itself', 'Section-by-section feedback, the skills we found, and what a recruiter would flag. Rules, a trained model and an LLM are combined and checked against each other.',
          h('div', { class: 'bento__viz bento__viz--h' }, [38, 52, 44, 66, 58, 74, 82, 70, 88].map((n, i) => bar(n, i > 5, '#a78bfa')))),
        cell('', '#22d3ee', 'briefcase', 'Job matching', 'Matches with reasons', 'Every job shows which of your skills match and which are missing.', h('div', { class: 'bento__viz chips' }, skillChip('React', 'matched', 0), skillChip('SQL', 'matched', 0), skillChip('Docker', 'missing', 0))),
        cell('', '#8da2fb', 'route', 'Roadmaps', 'A plan you can finish', 'Stages, topics and guides. Tick things off and watch the path fill in.', h('div', { class: 'bento__viz bento__viz--h' }, [30, 45, 60, 75, 90].map((n, i) => bar(n, i < 3, '#8da2fb')))),
        cell('', '#fb923c', 'bolt', 'Skill arena', 'Practise, then prove it', 'Short challenges and timed mock interviews that feed a daily streak.', h('div', { class: 'bento__viz bento__viz--h' }, [50, 80, 35, 90, 60, 70].map((n, i) => bar(n, i % 2 === 0, '#fb923c')))),
        cell('', '#818cf8', 'users', 'AI coach', 'Ask anything about your path', 'A coach that knows your resume, target role and gaps.', null),
        cell('bento__c--w', '#f5b544', 'building', 'For employers', 'Ranked candidates, with the why', 'Post a role with required skills and review applicants sorted by fit, with an explanation for each, bulk status updates and strong-match alerts.', null),
        cell('bento__c--w', '#60a5fa', 'shield', 'Built carefully', 'Secure by default, works offline', 'Hardened sign-in, audit-friendly data model, backups, monitoring hooks, and an installable app that still opens without a connection.', null)))),
    h('section', { class: 'lp-sec' }, h('div', { class: 'container' },
      h('div', { class: 'lp-sec__head' }, h('span', { class: 'eyebrow' }, 'How it works'), h('h2', null, 'One loop, four steps')),
      h('div', { class: 'steps4' }, [['Upload', 'Add your resume PDF. We read it and fill your profile.'], ['Analyse', 'Get a score, the skills we found and the gaps to a target role.'], ['Follow the roadmap', 'Work through stages and guides built from your own profile.'], ['Apply', 'Apply to matched jobs and track every application.']]
        .map(([t, d], i) => h('div', null, h('b', null, String(i + 1)), h('h3', null, t), h('p', null, d)))))),
    h('section', { class: 'lp-sec' }, h('div', { class: 'container duo' },
      h('div', { class: 'duo__c' }, h('span', { class: 'eyebrow' }, 'Students'), h('h3', null, 'Know where you stand, and what to do next'),
        bullets(['Resume score and skill-gap report', 'Roadmaps with step-by-step guides', 'Resume builder and mock interviews', 'Applications tracked in one place']), h('a', { class: 'btn', href: '#/register' }, 'Create student account', icon('arrow-right'))),
      h('div', { class: 'duo__c' }, h('span', { class: 'eyebrow' }, 'Employers'), h('h3', null, 'Spend your time on the best candidates'),
        bullets(['Candidates ranked by fit, with reasons', 'Kanban board and bulk status updates', 'Skill suggestions for new job posts', 'Alerts when a strong applicant arrives']), h('a', { class: 'btn btn--secondary', href: '#/register' }, 'Create employer account', icon('arrow-right'))))),
    h('section', { class: 'lp-sec' }, h('div', { class: 'container' },
      h('div', { class: 'lp-final' }, h('h2', null, 'Ready to turn skills into offers?'), h('p', null, 'Create a free account in under a minute.'),
        h('div', { class: 'lp-cta' }, h('a', { class: 'btn btn--lg', href: '#/register' }, 'Get started', icon('arrow-right')), h('a', { class: 'btn btn--secondary btn--lg', href: '#/login' }, 'Sign in'))))),
    h('footer', { class: 'footer' }, h('div', { class: 'container footer__in' },
      h('div', null, h('p', { class: 'strong' }, 'LanTURN'), h('p', null, 'Batch 16 · A. Ganesh, Md. Noman, V. Sai Tanush')),
      h('div', { class: 'footer__cols' }, h('div', null, h('b', null, 'Product'), h('a', { href: '#/register' }, 'Get started'), h('a', { href: '#/login' }, 'Sign in')), h('div', null, h('b', null, 'Resources'), h('a', { href: '/design-system.html' }, 'Design system'), h('a', { href: '/api/health' }, 'Status'))))));
}

function authLayout(title, subtitle, form) {
  const pt = (b, t) => h('li', null, icon('check'), h('div', null, h('b', null, b), t));
  // The right-hand panel used to be three bullets in a very large empty box. It now carries the platform's real,
  // live numbers (the same public endpoint the landing page reads) so the space says something true instead of lorem.
  const pulse = h('div', { class: 'auth2__pulse', hidden: true, 'aria-label': 'Platform activity' });
  get('/platform/stats').then((s) => {
    const cell = (n, label) => h('div', null, h('b', null, Number(n || 0).toLocaleString()), h('span', null, label));
    pulse.append(cell(s.studentsCount, 'students'), cell(s.employersCount, 'employers'), cell(s.openJobsCount, 'open roles'));
    pulse.hidden = false;
  }).catch(() => { /* the panel works without numbers */ });

  return h('div', { class: 'auth2' },
    h('section', { class: 'auth2__form' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'LanTURN home' }, lantern(), h('span', null, 'Lan', h('b', null, 'TURN'))),
      h('div', { class: 'auth2__box' }, h('div', null, h('h1', null, title), h('p', null, subtitle)), form)),
    h('aside', { class: 'auth2__side', 'aria-hidden': 'true' },
      h('h2', null, 'From skills to opportunity, with a plan.'),
      h('ul', { class: 'auth2__list' }, pt('Resume score in seconds', 'Know exactly what to fix before you apply.'), pt('Roadmaps from your own profile', 'Stages, topics and guides you can finish.'), pt('Ranked candidates for employers', 'Every ranking comes with the reason.')),
      pulse,
      h('p', { class: 'auth2__foot' }, icon('shield'), 'Free for students. Employer accounts are reviewed before they can post.')));
}

export function login({ navigate }) {
  const email = input({ type: 'email', required: true, autocomplete: 'email', placeholder: 'you@college.edu' });
  const pw = input({ type: 'password', required: true, autocomplete: 'current-password' });
  const err = h('div', { role: 'alert' });
  const btn = h('button', { class: 'btn btn--block', type: 'submit' }, 'Sign in');
  const form = h('form', {
    class: 'stack', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.replaceChildren();
      try {
        const u = await busy(btn, () => doLogin(email.value.trim(), pw.value));
        navigate(home(u));
      } catch (ex) { err.append(h('div', { class: 'alert alert--danger' }, icon('warn'), ex.message)); }
    },
  }, field('Email', email), passwordField('Password', pw), err, btn, h('p', { class: 'muted' }, 'New here? ', h('a', { href: '#/register' }, 'Create an account')));
  return authLayout('Welcome back', 'Sign in to continue.', form);
}

export function register({ navigate }) {
  let role = 'STUDENT';
  const name = input({ required: true, autocomplete: 'name' });
  const email = input({ type: 'email', required: true, autocomplete: 'email' });
  const pw = input({ type: 'password', required: true, minlength: '8', autocomplete: 'new-password' });
  const nameField = h('div');
  const err = h('div', { role: 'alert' });
  const btn = h('button', { class: 'btn btn--block', type: 'submit' }, 'Create account');
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'I am a' });
  const paint = () => {
    seg.replaceChildren(...[['STUDENT', 'Student'], ['EMPLOYER', 'Employer']].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(role === v), onclick: () => { role = v; paint(); } }, l)));
    nameField.replaceChildren(field(role === 'STUDENT' ? 'Full name' : 'Company name', name));
    pw.parentElement;
  };
  paint();
  const note = h('p', { class: 'hint muted' }, 'Employer accounts are reviewed by an admin before you can post jobs.');
  const form = h('form', {
    class: 'stack', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.replaceChildren();
      const body = { email: email.value.trim(), password: pw.value, role, ...(role === 'STUDENT' ? { fullName: name.value.trim() } : { companyName: name.value.trim() }) };
      try {
        const u = await busy(btn, () => doRegister(body));
        toast(role === 'EMPLOYER' ? 'Account created. An admin will approve it shortly.' : 'Welcome to LanTURN!', 'success');
        navigate(home(u));
      } catch (ex) { err.append(h('div', { class: 'alert alert--danger' }, icon('warn'), ex.message)); }
    },
  }, h('div', { class: 'field' }, h('span', { class: 'label' }, 'I am a'), seg), nameField, field('Email', email), passwordField('Password', pw, { hint: 'At least 8 characters.' }), note, err, btn, h('p', { class: 'muted' }, 'Already registered? ', h('a', { href: '#/login' }, 'Sign in')));
  return authLayout('Create your account', 'Free for students and employers.', form);
}

/** Landing page for a hiring-team invitation link: #/join?token=... */
export async function join({ navigate, query = {} }) {
  const token = query.token || '';
  let inv = null;
  try { inv = await get(`/auth/invite/${encodeURIComponent(token)}`); } catch {
    return authLayout('Invitation not valid', 'This link is invalid, already used or expired.', h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Ask the account owner to send you a new invitation.'), h('a', { class: 'btn btn--block', href: '#/login' }, 'Go to sign in')));
  }
  const name = input({ required: true, autocomplete: 'name', value: inv.name || '' });
  const pw = input({ type: 'password', required: true, minlength: '8', autocomplete: 'new-password' });
  const err = h('div', { role: 'alert' });
  const btn = h('button', { class: 'btn btn--block', type: 'submit' }, 'Join the team');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.replaceChildren();
    if (!name.value.trim()) { err.append(h('div', { class: 'alert alert--danger' }, icon('warn'), 'Enter your name.')); return; }
    try { const u = await busy(btn, () => joinTeam({ token, name: name.value.trim(), password: pw.value })); toast(`Welcome to ${inv.company}`, 'success'); navigate(home(u)); } catch (ex) { err.append(h('div', { class: 'alert alert--danger' }, icon('warn'), ex.message)); }
  } }, field('Email', input({ value: inv.email, readonly: true, 'aria-readonly': 'true' })), field('Your name', name), passwordField('Choose a password', pw, { hint: 'At least 8 characters.' }), err, btn);
  return authLayout(`Join ${inv.company}`, 'You were invited to the hiring team. You will see the same jobs and candidates as your colleagues.', form);
}
