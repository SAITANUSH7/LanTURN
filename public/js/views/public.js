import { login as doLogin, register as doRegister } from '../api.js';
import { h, icon, field, input, busy, scoreRing, skillChip, toast, passwordField } from '../ui.js';

const TICK = ['Career intelligence system / 001', 'ランターン', 'Skills meet opportunity', '就職支援', 'Resume score · Skill gap · Roadmap', '次の進化', 'Batch 16'];
function ticker() {
  const items = [...TICK, ...TICK].map((t, i) => h('span', { class: /[ぁ-んァ-ン一-龥]/.test(t) ? 'kanji' : '' }, t));
  return h('div', { class: 'ticker', 'aria-hidden': 'true' }, h('div', { class: 'ticker__track' }, items, items.map((n) => n.cloneNode(true))));
}

const home = (u) => (u.role === 'STUDENT' ? '/student' : u.role === 'EMPLOYER' ? '/employer' : '/admin');

export function landing({ navigate, user }) {
  if (user) { navigate(home(user)); return h('div'); }
  const feature = (ic, title, text) => h('div', { class: 'card feature' }, h('div', { class: 'feature__icon' }, icon(ic)), h('h3', null, title), h('p', { class: 'muted' }, text));
  return h('div', null,
    ticker(),
    h('section', { class: 'hero' },
      h('span', { class: 'hero__kanji kanji', 'aria-hidden': 'true' }, '斬'),
      h('div', { class: 'container hero__in' },
      h('div', null,
        h('span', { class: 'eyebrow' }, 'Batch 16 · Career intelligence'),
        h('h1', null, h('span', { class: 'l1' }, 'Lan'), h('span', { class: 'l2' }, 'TURN')),
        h('p', { class: 'hero__lead' }, 'Your potential is the weapon. ', h('b', null, 'Analyse your resume, see your skill gaps, follow a roadmap'), ' and apply to jobs that actually fit.'),
        h('div', { class: 'row' },
          h('a', { class: 'btn btn--accent btn--lg', href: '#/register' }, 'I’m a student', icon('arrow-right')),
          h('a', { class: 'btn btn--secondary btn--lg', href: '#/register' }, 'I’m hiring'))),
      h('div', { class: 'hero__stage' },
        h('i', { class: 'liquid', 'aria-hidden': 'true' }),
        h('i', { class: 'liquid liquid--b', 'aria-hidden': 'true' }),
        h('div', { class: 'card hero__card', 'aria-label': 'Example of a resume analysis' },
        h('div', { class: 'card__title' }, h('h3', null, 'Resume analysis'), h('span', { class: 'badge badge--neutral' }, 'Example')),
        h('div', { class: 'gap-grid' },
          scoreRing(72),
          h('div', { class: 'stack stack--sm' },
            h('p', { class: 'strong' }, 'Match for Android Developer'),
            h('div', { class: 'chips' }, skillChip('Kotlin', 'matched', 3), skillChip('Android', 'matched', 3), skillChip('Jetpack Compose', 'missing', 3)))),
        h('div', { class: 'alert', style: { marginTop: '16px' } }, icon('route'), h('span', null, 'Next step: build a small Compose app with a remote API.')))))),
    h('section', { class: 'band' }, h('div', { class: 'container stack stack--lg' },
      h('div', null, h('span', { class: 'eyebrow' }, 'Four modules'), h('h2', null, 'Everything in one place')),
      h('div', { class: 'grid grid--4' },
        feature('user', 'Student module', 'Build a profile, explore jobs and track every application in one list.'),
        feature('building', 'Employer module', 'Post jobs with required skills and review ranked, matched candidates.'),
        feature('sparkle', 'AI guidance', 'Resume scoring, skill-gap calculation and personalised learning roadmaps.'),
        feature('shield', 'Core backend', 'Secure sign-in, application logic and a single shared data model.')))),
    h('section', { class: 'band band--ink' }, h('div', { class: 'container stack stack--lg' },
      h('div', null, h('span', { class: 'eyebrow' }, 'How it works'), h('h2', null, 'One loop, five steps')),
      h('ol', { class: 'loop' },
        [['Upload', 'Add your resume PDF and profile.'], ['Analyse', 'Get a score and the skills we found.'], ['Find gaps', 'Compare with a target role.'], ['Roadmap', 'Follow steps to close each gap.'], ['Match', 'Apply and track status.']]
          .map(([t, d]) => h('li', null, h('h3', null, t), h('p', null, d)))))),
    h('section', { class: 'band' }, h('div', { class: 'container' },
      h('div', { class: 'card card--blue row row--between' },
        h('div', null, h('h2', null, 'Ready to turn skills into offers?'), h('p', { class: 'muted' }, 'Create a free account in under a minute.')),
        h('a', { class: 'btn btn--accent btn--lg', href: '#/register' }, 'Get started', icon('arrow-right'))))),
    h('footer', { class: 'footer' }, h('div', { class: 'container row row--between' }, h('span', null, 'LanTURN · Batch 16 · A. Ganesh, Md. Noman, V. Sai Tanush'), h('span', null, h('a', { href: '/design-system.html' }, 'Design system'), ' · Skills meet opportunity.'))));
}

function authLayout(title, subtitle, form) {
  return h('div', { class: 'auth' },
    h('aside', { class: 'auth__side' },
      h('i', { class: 'liquid', 'aria-hidden': 'true' }),
      h('span', { class: 'kanji', 'aria-hidden': 'true' }, '転'),
      h('span', { class: 'eyebrow' }, 'Career intelligence / 001'),
      h('h1', null, 'Lan', h('span', null, 'TURN')),
      h('p', null, 'Lighting the path from skills to opportunity.'),
      h('ul', null, ['Resume score and skill gaps in seconds', 'Roadmaps built from your own profile', 'Ranked candidates for employers'].map((t) => h('li', null, icon('check'), t)))),
    h('section', { class: 'auth__form' }, h('div', { class: 'card stack' }, h('div', null, h('h2', null, title), h('p', { class: 'muted' }, subtitle)), form)));
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
