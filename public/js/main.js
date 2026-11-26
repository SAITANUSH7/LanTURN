import { restoreSession, session, logout, onSessionChange, post, get } from './api.js';
import { h, clear, icon, lantern, errorBox, loadingBlock, pageSkeleton, toast, langPicker } from './ui.js';
import * as pub from './views/public.js';
import * as stu from './views/student.js';
import * as emp from './views/employer.js';
import * as adm from './views/admin.js';
import * as stt from './views/studentTools.js';
import { careerMap } from './views/careermap.js';
import { setupPage } from './views/setup.js';
import { roadmapPage } from './views/roadmap.js';
import * as ai from './views/ai.js';
import { inbox } from './views/messages.js';
import './fx.js';
import { t } from './i18n.js';

const app = document.getElementById('app');

// Theme: dark by default, light on request; remembers the choice and follows the OS until one is made.
const readTheme = () => { try { return localStorage.getItem('lanturn-theme'); } catch { return null; } };
const currentTheme = () => readTheme() || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
const applyTheme = (th) => { document.documentElement.dataset.theme = th; document.querySelector('meta[name=theme-color]')?.setAttribute('content', th === 'light' ? '#fafafa' : '#09090b'); };
applyTheme(currentTheme());
function themeToggle() {
  const light = document.documentElement.dataset.theme === 'light';
  return h('button', { class: 'iconbtn', type: 'button', 'aria-label': light ? 'Switch to dark theme' : 'Switch to light theme', title: light ? 'Dark theme' : 'Light theme',
    onclick: () => { const next = light ? 'dark' : 'light'; try { localStorage.setItem('lanturn-theme', next); } catch { /* optional */ } applyTheme(next); render(); } }, icon(light ? 'moon' : 'sun'));
}

// [pattern, allowed roles (null = public), handler, title]
const ROUTES = [
  ['/', null, pub.landing, 'Home'],
  ['/login', null, pub.login, 'Sign in'],
  ['/register', null, pub.register, 'Create account'],
  ['/join', null, pub.join, 'Join your team'],
  ['/student', ['STUDENT'], stu.dashboard, 'Home'],
  ['/student/builder', ['STUDENT'], stt.resumeBuilder, 'Resume builder'],
  ['/student/jobs', ['STUDENT'], stu.jobs, 'Jobs'],
  ['/student/jobs/:id', ['STUDENT'], stu.jobDetail, 'Job'],
  ['/student/applications', ['STUDENT'], stu.applications, 'Applications'],
  ['/student/messages', ['STUDENT'], inbox, 'Messages'],
  ['/student/resume', ['STUDENT'], stu.resume, 'Resume'],
  ['/student/career', ['STUDENT'], stu.career, 'Career'],
  ['/student/profile', ['STUDENT'], stu.profile, 'Profile'],
  ['/student/map', ['STUDENT'], careerMap, 'Career Map'],
  ['/student/setup', ['STUDENT'], setupPage, 'Auto-setup'],
  ['/student/roadmap', ['STUDENT'], roadmapPage, 'Roadmap'],
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
  ['/employer/messages', ['EMPLOYER'], inbox, 'Messages'],
  ['/employer/company', ['EMPLOYER'], emp.company, 'Company'],
  ['/employer/team', ['EMPLOYER'], emp.team, 'Team'],
  ['/admin', ['ADMIN'], adm.employers, 'Employers'],
  ['/admin/ai', ['ADMIN'], adm.aiSettings, 'AI providers'],
  ['/admin/system', ['ADMIN'], adm.system, 'System'],
].map(([p, roles, view, title]) => ({
  roles, view, title,
  keys: [...p.matchAll(/:(\w+)/g)].map((m) => m[1]),
  re: new RegExp(`^${p.replace(/:\w+/g, '([^/]+)')}$`),
}));

const NAV = {
  STUDENT: [
    ['Overview', [['/student', 'Home', 'home']]],
    ['Opportunities', [['/student/jobs', 'Jobs', 'briefcase'], ['/student/applications', 'Applications', 'clock'], ['/student/messages', 'Messages', 'mail']]],
    ['Documents', [['/student/resume', 'Resume', 'file'], ['/student/builder', 'Builder', 'file']]],
    ['Grow', [['/student/roadmap', 'Roadmap', 'route'], ['/student/career', 'Career', 'route'], ['/student/dna', 'DNA', 'sparkle'], ['/student/arena', 'Arena', 'bolt'], ['/student/coach', 'Coach', 'users']]],
    ['Account', [['/student/profile', 'Profile', 'user']]],
  ],
  EMPLOYER: [['Hiring', [['/employer', 'Dashboard', 'chart'], ['/employer/jobs', 'Jobs', 'briefcase'], ['/employer/messages', 'Messages', 'mail'], ['/employer/team', 'Team', 'users'], ['/employer/assistant', 'Assistant', 'sparkle'], ['/employer/company', 'Company', 'building']]]],
  ADMIN: [['Administration', [['/admin', 'Employers', 'shield'], ['/admin/ai', 'AI providers', 'sparkle'], ['/admin/system', 'System', 'chart']]]],
};
export const homeFor = (role) => (role === 'STUDENT' ? '/student' : role === 'EMPLOYER' ? '/employer' : role === 'ADMIN' ? '/admin' : '/');
export const navigate = (path) => { if (location.hash.slice(1) === path) render(); else location.hash = path; };

let leave = [];
const currentPath = () => (location.hash.slice(1).split('?')[0] || '/');
const parseQuery = () => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));

// Colour section for a path: "/student/jobs/12" -> "jobs", "/student" -> "home".
const sectionOf = (path) => { const seg = path.split('/').filter(Boolean); return seg.length < 2 ? 'home' : seg[1] === 'jobs' && seg[0] === 'employer' ? 'jobs' : seg[1]; };

function shell() {
  const user = session.user;
  const path = currentPath();
  const active = (to) => (to === path || (to !== homeFor(user?.role) && path.startsWith(`${to}/`)) ? 'page' : null);
  if (!user) {
    return h('div', null,
      h('header', { class: 'topbar topbar--pub' },
        h('div', { class: 'topbar__in' },
          h('a', { class: 'brand', href: '#/', 'aria-label': 'LanTURN home' }, lantern(), h('span', null, 'Lan', h('b', null, 'TURN'))),
          h('div', { class: 'topbar__user' }, themeToggle(), langPicker({ onchange: render }),
            h('a', { class: 'btn btn--secondary btn--sm', href: '#/login' }, t('Sign in')),
            h('a', { class: 'btn btn--accent btn--sm', href: '#/register' }, t('Get started'))))),
      h('main', { id: 'main', tabindex: '-1' }));
  }
  const groups = NAV[user.role] || [];
  const routeLabel = () => {
    try {
      const crumbPath = (location.hash.replace(/^#/, '').split('?')[0]) || '/';
      const hit = (typeof ROUTES !== 'undefined' ? ROUTES : []).find(([p]) => new RegExp(`^${p.replace(/:[^/]+/g, '[^/]+')}$`).test(crumbPath));
      return hit ? hit[3] : '';
    } catch { return ''; }
  };
  const label = groups.flatMap(([, items]) => items).find(([to]) => active(to))?.[1] || routeLabel() || '';
  const app = h('div', { class: 'app' });
  const side = h('aside', { class: 'side', id: 'side', 'aria-label': 'Sidebar' },
    h('a', { class: 'brand', href: `#${homeFor(user.role)}`, 'aria-label': 'LanTURN home' }, lantern(), h('span', null, 'Lan', h('b', null, 'TURN'))),
    h('nav', { class: 'nav', 'aria-label': 'Main' }, groups.map(([title, items]) => h('div', { class: 'side__group' },
      h('div', { class: 'side__label' }, t(title)),
      items.map(([to, name, ic]) => h('a', { href: `#${to}`, 'data-s': sectionOf(to), 'aria-current': active(to), id: to.endsWith('/messages') ? 'nav-messages' : null }, icon(ic), t(name)))))),
    h('div', { class: 'side__foot' },
      h('div', { class: 'me' }, h('span', { class: 'me__av', 'aria-hidden': 'true' }, (user.name || user.email || '?').trim()[0].toUpperCase()),
        h('div', { class: 'me__t' }, h('strong', null, user.name || user.email), h('small', null, user.team ? 'team member' : user.role.toLowerCase()))),
      h('button', { class: 'btn btn--secondary btn--sm', onclick: async () => { await logout(); navigate('/'); } }, icon('logout'), t('Sign out'))));
  const bar = h('header', { class: 'topbar' },
    h('div', { class: 'topbar__in' },
      h('div', { class: 'topbar__crumb' },
        h('button', { class: 'iconbtn menu-btn', type: 'button', 'aria-label': 'Open menu', 'aria-controls': 'side', onclick: () => app.classList.toggle('is-open') }, icon('list')),
        h('i', { 'aria-hidden': 'true' }), h('b', null, t(label || 'LanTURN'))),
      h('div', { class: 'topbar__user' }, themeToggle(), langPicker({ onchange: render }), user.role !== 'ADMIN' ? ai.bell() : null)));
  const tabs = user.role === 'STUDENT' ? h('nav', { class: 'tabbar', 'aria-label': 'Quick navigation' },
    [['/student', 'Home', 'home'], ['/student/jobs', 'Jobs', 'briefcase'], ['/student/resume', 'Resume', 'file'], ['/student/roadmap', 'Roadmap', 'route']].map(([to, name, ic]) => h('a', { href: `#${to}`, 'data-s': sectionOf(to), 'aria-current': active(to) }, icon(ic), h('span', null, t(name)))),
    h('button', { type: 'button', 'aria-label': 'More', 'aria-controls': 'side', onclick: () => app.classList.toggle('is-open') }, icon('list'), h('span', null, t('More')))) : null;
  app.append(side, h('div', { class: 'scrim', onclick: () => app.classList.remove('is-open') }), h('div', { class: 'app__main' }, bar, h('main', { id: 'main', tabindex: '-1' }), tabs));
  return app;
}

// Live notifications. EventSource cannot send an Authorization header, so the client trades its bearer token for a
// single-use ticket (POST /api/realtime/ticket) and connects with that. The ticket dies after a minute, so a dropped
// connection is not re-subscribed to: it is re-ticketed.
let live = null; let liveFor = null; let liveRetry = null;
function closeLive() { try { live?.close(); } catch { /* already closed */ } live = null; liveFor = null; clearTimeout(liveRetry); }
async function connectLive() {
  const user = session.user;
  if (!user || user.role === 'ADMIN') { closeLive(); return; }
  if (live && liveFor === user.id) return;
  closeLive();
  liveFor = user.id;
  let ticket = null;
  try { ticket = (await post('/realtime/ticket')).ticket; } catch { return; }
  if (!ticket || liveFor !== user.id) return;
  const es = new EventSource(`/api/realtime/stream?ticket=${encodeURIComponent(ticket)}`);
  live = es;
  es.addEventListener('notification', (ev) => {
    let detail = {};
    try { detail = JSON.parse(ev.data); } catch { /* keep the bell refresh anyway */ }
    window.dispatchEvent(new CustomEvent('lan:notification', { detail }));
    ai.refreshBell();
    refreshNavBadge();
    if (detail?.title) toast(detail.title, 'success');
  });
  es.onerror = () => {
    try { es.close(); } catch { /* ignore */ }
    if (live !== es) return;
    live = null; liveFor = null;
    liveRetry = setTimeout(connectLive, 15000);
  };
}

export async function refreshNavBadge() {
  if (!session.user || session.user.role === 'ADMIN') return;
  try {
    const { unread } = await get('/messages/unread');
    const link = document.getElementById('nav-messages');
    if (!link) return;
    let badge = link.querySelector('.nav__n');
    if (!unread) { badge?.remove(); link.removeAttribute('aria-description'); return; }
    if (!badge) { badge = h('span', { class: 'nav__n' }); link.append(badge); }
    badge.textContent = unread > 9 ? '9+' : String(unread);
    link.setAttribute('aria-description', `${unread} unread message${unread === 1 ? '' : 's'}`);
  } catch { /* signed out or offline */ }
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

  document.body.dataset.section = sectionOf(path);
  clear(app).append(shell());
  const main = document.getElementById('main');
  document.title = `${route.title} · LanTURN`;
  main.append(pageSkeleton());
  if (user && user.role !== 'ADMIN') { ai.refreshBell(); connectLive(); refreshNavBadge(); } else closeLive();
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

onSessionChange(() => { if (!session.user) closeLive(); });
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
  // Additive interaction layer (sticky header state, ripple, magnetic CTAs, chart tooltips, reveal stagger).
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA is optional */ }); });
}
