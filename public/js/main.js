import { restoreSession, session, logout, onSessionChange } from './api.js';
import { h, clear, icon, lantern, errorBox, loadingBlock } from './ui.js';
import * as pub from './views/public.js';
import * as stu from './views/student.js';
import * as emp from './views/employer.js';
import * as adm from './views/admin.js';
import * as ai from './views/ai.js';
import { t, LANGS, getLang, setLang } from './i18n.js';

const app = document.getElementById('app');

// [pattern, allowed roles (null = public), handler, title]
const ROUTES = [
  ['/', null, pub.landing, 'Home'],
  ['/login', null, pub.login, 'Sign in'],
  ['/register', null, pub.register, 'Create account'],
  ['/student', ['STUDENT'], stu.dashboard, 'Home'],
  ['/student/jobs', ['STUDENT'], stu.jobs, 'Jobs'],
  ['/student/jobs/:id', ['STUDENT'], stu.jobDetail, 'Job'],
  ['/student/applications', ['STUDENT'], stu.applications, 'Applications'],
  ['/student/resume', ['STUDENT'], stu.resume, 'Resume'],
  ['/student/career', ['STUDENT'], stu.career, 'Career'],
  ['/student/profile', ['STUDENT'], stu.profile, 'Profile'],
  ['/student/dna', ['STUDENT'], ai.careerDna, 'Career DNA'],
  ['/student/arena', ['STUDENT'], ai.arena, 'Skill Arena'],
  ['/student/coach', ['STUDENT'], ai.chat, 'Career Coach'],
  ['/notifications', ['STUDENT', 'EMPLOYER'], ai.notifications, 'Notifications'],
  ['/employer/assistant', ['EMPLOYER'], ai.chat, 'AI Assistant'],
  ['/employer/jobs/:id/board', ['EMPLOYER'], ai.board, 'Board'],
  ['/employer', ['EMPLOYER'], emp.dashboard, 'Dashboard'],
  ['/employer/jobs', ['EMPLOYER'], emp.jobs, 'My jobs'],
  ['/employer/jobs/new', ['EMPLOYER'], emp.jobForm, 'Post a job'],
  ['/employer/jobs/:id/edit', ['EMPLOYER'], emp.jobForm, 'Edit job'],
  ['/employer/jobs/:id/candidates', ['EMPLOYER'], emp.candidates, 'Candidates'],
  ['/employer/applications/:id', ['EMPLOYER'], emp.candidate, 'Candidate'],
  ['/employer/company', ['EMPLOYER'], emp.company, 'Company'],
  ['/admin', ['ADMIN'], adm.employers, 'Employers'],
].map(([p, roles, view, title]) => ({
  roles, view, title,
  keys: [...p.matchAll(/:(\w+)/g)].map((m) => m[1]),
  re: new RegExp(`^${p.replace(/:\w+/g, '([^/]+)')}$`),
}));

const NAV = {
  STUDENT: [['/student', 'Home', 'home'], ['/student/jobs', 'Jobs', 'briefcase'], ['/student/applications', 'Applications', 'clock'], ['/student/resume', 'Resume', 'file'], ['/student/career', 'Career', 'route'], ['/student/dna', 'DNA', 'sparkle'], ['/student/arena', 'Arena', 'bolt'], ['/student/coach', 'Coach', 'users'], ['/student/profile', 'Profile', 'user']],
  EMPLOYER: [['/employer', 'Dashboard', 'chart'], ['/employer/jobs', 'Jobs', 'briefcase'], ['/employer/assistant', 'Assistant', 'sparkle'], ['/employer/company', 'Company', 'building']],
  ADMIN: [['/admin', 'Employers', 'shield']],
};
export const homeFor = (role) => (role === 'STUDENT' ? '/student' : role === 'EMPLOYER' ? '/employer' : role === 'ADMIN' ? '/admin' : '/');
export const navigate = (path) => { if (location.hash.slice(1) === path) render(); else location.hash = path; };

let leave = [];
const currentPath = () => (location.hash.slice(1).split('?')[0] || '/');
const parseQuery = () => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));

function langPicker() {
  const sel = h('select', { class: 'lang', 'aria-label': 'Language', onchange: (e) => { setLang(e.target.value); render(); } }, LANGS.map(([v, l]) => h('option', { value: v, selected: v === getLang() ? true : null }, l)));
  return sel;
}

function shell() {
  const user = session.user;
  const links = user ? NAV[user.role] || [] : [];
  const path = currentPath();
  const active = (to) => (to === path || (to !== homeFor(user?.role) && path.startsWith(`${to}/`)) ? 'page' : null);
  const bar = h('header', { class: 'topbar' },
    h('div', { class: 'container topbar__in' },
      h('a', { class: 'brand', href: `#${user ? homeFor(user.role) : '/'}`, 'aria-label': 'LanTURN home' }, lantern(), h('span', null, 'Lan', h('b', null, 'TURN'))),
      user ? h('nav', { class: 'nav', 'aria-label': 'Main' }, links.map(([to, label, ic]) => h('a', { href: `#${to}`, 'aria-current': active(to) }, icon(ic), t(label)))) : h('div', { class: 'nav' }),
      user
        ? h('div', { class: 'topbar__user' },
          langPicker(), user.role !== 'ADMIN' ? ai.bell() : null,
          h('div', { class: 'topbar__who' }, h('strong', null, user.name || user.email), h('small', null, user.role.toLowerCase())),
          h('button', { class: 'btn btn--secondary btn--sm', onclick: async () => { await logout(); navigate('/'); } }, icon('logout'), t('Sign out')))
        : h('div', { class: 'topbar__user' }, langPicker(),
          h('a', { class: 'btn btn--secondary btn--sm', href: '#/login' }, t('Sign in')),
          h('a', { class: 'btn btn--accent btn--sm', href: '#/register' }, t('Get started')))));
  return h('div', null, bar, h('main', { id: 'main', tabindex: '-1' }));
}

let renderId = 0;
async function render() {
  const id = ++renderId;
  leave.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  leave = [];
  const path = currentPath();
  const route = ROUTES.find((r) => r.re.test(path));
  const user = session.user;

  if (!route) { location.hash = '#/'; return; }
  if (route.roles && !user) { location.hash = '#/login'; return; }
  if (route.roles && !route.roles.includes(user.role)) { location.hash = `#${homeFor(user.role)}`; return; }
  if (!route.roles && user && (path === '/login' || path === '/register')) { location.hash = `#${homeFor(user.role)}`; return; }

  const params = {};
  const m = path.match(route.re);
  route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });

  clear(app).append(shell());
  const main = document.getElementById('main');
  document.title = `${route.title} · LanTURN`;
  main.append(h('div', { class: 'container page' }, loadingBlock()));
  if (user && user.role !== 'ADMIN') ai.refreshBell();
  const ctx = { params, query: parseQuery(), navigate, onLeave: (fn) => leave.push(fn), user };
  try {
    const node = await route.view(ctx);
    if (id !== renderId) return;
    clear(main).append(node);
    node.classList?.add('view-in');
  } catch (e) {
    if (id !== renderId) return;
    if (e.status === 401) { location.hash = '#/login'; return; }
    clear(main).append(h('div', { class: 'container page' }, errorBox(e, render)));
  }
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

onSessionChange(() => { /* shell is rebuilt on every render */ });
window.addEventListener('hashchange', render);
// Liquid-glass specular highlight follows the pointer over any card.
document.addEventListener('pointermove', (e) => {
  const c = e.target instanceof Element ? e.target.closest('.card') : null;
  if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', `${e.clientX - r.left}px`);
  c.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

(async () => {
  clear(app).append(h('div', { class: 'container page' }, loadingBlock(2)));
  await restoreSession();
  await render();
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA is optional */ }); });
}
