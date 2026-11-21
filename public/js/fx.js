// Interaction layer: motion, pointer effects, confetti and a command palette. Pure enhancement: if anything here fails,
// the app still works. Respects prefers-reduced-motion. No inline scripts or styles (CSP-safe: only CSSOM and classes).
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const app = document.getElementById('app');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ---------- entrance, reveal and count-up (only right after navigation, so polling re-renders stay still) ----------
let navAt = 0;
addEventListener('hashchange', () => { navAt = performance.now(); });
const fresh = () => performance.now() - navAt < 1800;
const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('fx-in'); e.target.classList.remove('fx-pre'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' }) : null;

function countUp(node) {
  const m = /^(\D*)(\d+(?:\.\d+)?)(\D*)$/.exec(node.textContent.trim());
  if (!m || reduce) return;
  const [, pre, num, post] = m; const end = Number(num); const dec = (num.split('.')[1] || '').length;
  if (end === 0) return;
  const t0 = performance.now(); const dur = 900;
  const tick = (t) => { const k = Math.min(1, (t - t0) / dur); const v = end * (1 - (1 - k) ** 3); node.textContent = `${pre}${v.toFixed(dec)}${post}`; if (k < 1) requestAnimationFrame(tick); };
  node.textContent = `${pre}${(0).toFixed(dec)}${post}`; requestAnimationFrame(tick);
}
function animateRing(ring) {
  const to = Number(ring.style.getPropertyValue('--p')) || 0;
  if (reduce || !to) return;
  const val = $('.ring__value', ring); const t0 = performance.now(); const dur = 1100;
  const tick = (t) => { const k = Math.min(1, (t - t0) / dur); const e = 1 - (1 - k) ** 3; ring.style.setProperty('--p', String(to * e)); if (val) val.textContent = String(Math.round(to * e)); if (k < 1) requestAnimationFrame(tick); };
  ring.style.setProperty('--p', '0'); requestAnimationFrame(tick);
}
let order = 0; let orderReset = 0;
function enhance(root) {
  if (!fresh() || root.nodeType !== 1) return;
  const now = performance.now(); if (now - orderReset > 400) order = 0; orderReset = now;
  const targets = [...(root.matches?.('.card, .stat, .table-wrap, .empty, .alert, .ring, .seg') ? [root] : []), ...$$('.card, .stat, .table-wrap, .empty, .alert', root)];
  for (const t of targets) {
    if (t.dataset.fx) continue; t.dataset.fx = '1';
    const r = t.getBoundingClientRect();
    if (reduce) continue;
    if (r.top < innerHeight * 0.95 || !io) { t.style.setProperty('--i', String(Math.min(order++, 14))); t.classList.add('fx-in'); }
    else { t.classList.add('fx-pre'); io.observe(t); }
  }
  $$('.stat__value, .ring__value', root).forEach((n) => { if (!n.dataset.cu && !n.closest('.ring')) { n.dataset.cu = '1'; countUp(n); } });
  $$('.ring', root).forEach((r) => { if (!r.dataset.ra) { r.dataset.ra = '1'; animateRing(r); } });
  if (root.matches?.('.nav') || $('.nav', root)) setupNav();
  if ($('.topbar__user', root) || root.matches?.('.topbar__user')) addPaletteHint();
}
if (app) new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) enhance(n); }).observe(app, { childList: true, subtree: true });

// ---------- pointer effects: card spotlight, gentle tilt, button ripple, cursor glow ----------
const glow = el('i', 'fx-cursor'); glow.setAttribute('aria-hidden', 'true'); document.body.append(glow);
let px = 0; let py = 0; let raf = 0;
document.addEventListener('pointermove', (e) => {
  px = e.clientX; py = e.clientY;
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; glow.style.transform = `translate(${px - 260}px, ${py - 260}px)`; });
  const card = e.target.closest?.('.card, .stat');
  if (!card) return;
  const r = card.getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top;
  card.style.setProperty('--mx', `${x}px`); card.style.setProperty('--my', `${y}px`);
  if (!reduce && card.matches('.card--hover, .stat, .cand, a.card') && r.width < 760) {
    card.style.transform = `perspective(900px) rotateX(${((0.5 - y / r.height) * 5).toFixed(2)}deg) rotateY(${((x / r.width - 0.5) * 6).toFixed(2)}deg) translateZ(0)`;
  }
}, { passive: true });
document.addEventListener('pointerout', (e) => { const c = e.target.closest?.('.card, .stat'); if (c && !c.contains(e.relatedTarget)) c.style.transform = ''; });
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest?.('.btn'); if (!b || reduce) return;
  const r = b.getBoundingClientRect(); const s = el('i', 'ripple');
  s.style.left = `${e.clientX - r.left}px`; s.style.top = `${e.clientY - r.top}px`; b.append(s); setTimeout(() => s.remove(), 650);
});

// ---------- scroll progress ----------
const bar = el('i', 'fx-progress'); bar.setAttribute('aria-hidden', 'true'); document.body.append(bar);
addEventListener('scroll', () => { const h = document.documentElement; const max = h.scrollHeight - h.clientHeight; bar.style.transform = `scaleX(${max > 0 ? Math.min(1, h.scrollTop / max) : 0})`; }, { passive: true });

// ---------- nav: sliding highlight ----------
function setupNav() {
  const nav = $('.nav'); if (!nav || nav.dataset.fx) return; nav.dataset.fx = '1';
  const pill = el('i', 'nav__glow'); nav.prepend(pill);
  const to = (a) => { if (!a) { pill.classList.remove('on'); return; } pill.style.left = `${a.offsetLeft}px`; pill.style.width = `${a.offsetWidth}px`; pill.style.setProperty('--sec', getComputedStyle(a).getPropertyValue('--sec')); pill.classList.add('on'); };
  nav.addEventListener('pointerover', (e) => to(e.target.closest('a')));
  nav.addEventListener('pointerleave', () => to(null));
}

// ---------- confetti ----------
export function confetti(x = innerWidth / 2, y = innerHeight / 3) {
  if (reduce) return;
  const c = el('canvas', 'fx-confetti'); c.width = innerWidth; c.height = innerHeight; document.body.append(c);
  const g = c.getContext('2d'); const cols = ['#6ea8ff', '#a78bfa', '#38bdf8', '#fbbf24', '#818cf8', '#ffffff', '#fb923c'];
  const ps = Array.from({ length: 110 }, () => ({ x, y, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 3, s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0] }));
  const t0 = performance.now();
  const tick = (t) => {
    g.clearRect(0, 0, c.width, c.height);
    for (const p of ps) { p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - (t - t0) / 1900); g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); g.restore(); }
    if (t - t0 < 1900) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
}
// Celebrate completing a roadmap topic, and wins that arrive as success toasts.
document.addEventListener('change', (e) => { const i = e.target; if (i.matches?.('input[type=checkbox]') && i.checked && i.closest('.flow__topic, .flow, .road, .topic')) { const r = i.getBoundingClientRect(); confetti(r.left + 10, r.top); } });
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && /offer|hired|congrat|streak|medal|badge/i.test(n.textContent)) confetti(); }).observe(document.body, { childList: true, subtree: true });

// ---------- command palette (Ctrl/Cmd+K or "/") ----------
let pal = null;
function addPaletteHint() {
  const u = $('.topbar__user'); if (!u || $('.kbd-hint', u)) return;
  const b = el('button', 'kbd-hint'); b.type = 'button'; b.setAttribute('aria-label', 'Open quick search'); b.append(el('span', null, 'Search'), el('kbd', null, /Mac/.test(navigator.platform) ? '⌘K' : 'Ctrl K'));
  b.onclick = openPalette; u.prepend(b);
}
function commands() {
  const out = $$('.nav a[href^="#/"]').map((a) => ({ label: a.textContent.trim(), hint: 'Go to', href: a.getAttribute('href'), s: a.dataset.s }));
  const extra = [];
  if (out.some((c) => c.href.startsWith('#/student'))) extra.push(['Auto-setup from resume', '#/student/setup', 'setup'], ['Mock interview and coach', '#/student/coach', 'coach'], ['Skill map of all directions', '#/student/map', 'career']);
  if (out.some((c) => c.href.startsWith('#/employer'))) extra.push(['Post a job', '#/employer/jobs/new', 'jobs'], ['Company profile', '#/employer/company', 'company']);
  for (const [label, href, s] of extra) if (!out.some((c) => c.href === href)) out.push({ label, hint: 'Go to', href, s });
  const so = $$('.topbar__user button').find((b) => /sign out/i.test(b.textContent));
  if (so) out.push({ label: 'Sign out', hint: 'Account', run: () => so.click(), s: 'ai' });
  return out;
}
function openPalette() {
  if (pal) return;
  const prev = document.activeElement; const list = commands(); let sel = 0; let shown = list;
  const root = el('div', 'pal'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Quick search');
  const box = el('div', 'pal__box'); const inp = el('input', 'pal__in'); inp.placeholder = 'Jump to a page or action…'; inp.setAttribute('aria-label', 'Search pages and actions');
  const ul = el('ul', 'pal__list'); ul.setAttribute('role', 'listbox'); box.append(inp, ul, el('div', 'pal__foot', '↑ ↓ to move · Enter to open · Esc to close')); root.append(box); document.body.append(root); pal = root;
  const close = () => { root.remove(); pal = null; prev?.focus?.(); };
  const draw = () => {
    ul.replaceChildren(...shown.map((c, i) => { const li = el('li', `pal__item${i === sel ? ' on' : ''}`); li.dataset.s = c.s || ''; li.setAttribute('role', 'option'); li.append(el('i', 'pal__dot'), el('span', null, c.label), el('small', null, c.hint)); li.onclick = () => go(c); li.onpointermove = () => { if (sel !== i) { sel = i; draw(); } }; return li; }));
    if (!shown.length) ul.append(el('li', 'pal__empty', 'Nothing matches'));
  };
  const go = (c) => { close(); if (c.run) c.run(); else location.hash = c.href; };
  inp.addEventListener('input', () => { const q = inp.value.trim().toLowerCase(); shown = q ? list.filter((c) => c.label.toLowerCase().includes(q)) : list; sel = 0; draw(); });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); } else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); go(shown[sel]); }
  });
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  draw(); inp.focus();
}
document.addEventListener('keydown', (e) => {
  const typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); if (pal) { pal.remove(); pal = null; } else openPalette(); }
});
if (app) enhance(app);
