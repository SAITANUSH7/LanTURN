// Tiny DOM toolkit. Everything user-supplied goes through textContent, so no XSS by construction.
import { LANGS, getLang, setLang } from './i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) (sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv));
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

const ICONS = {
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  refresh2: '<path d="M4 4v6h6M20 20v-6h-6"/><path d="M20 9a8 8 0 0 0-14-3L4 10M4 15a8 8 0 0 0 14 3l2-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14a5 5 0 0 1 5 5"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  x: '<path d="M5 5l14 14M19 5L5 19"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  'arrow-right': '<path d="M4 12h16M14 6l6 6-6 6"/>',
  'arrow-left': '<path d="M20 12H4M10 6l-6 6 6 6"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3 3l18 18"/><path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c6 0 10 7 10 7a13.7 13.7 0 0 1-3.3 3.7"/><path d="M6.6 6.6C3.8 8.3 2 12 2 12s4 7 10 7a9.5 9.5 0 0 0 4.1-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4M4 5v4h4M4 13a8 8 0 0 0 14 4M20 19v-4h-4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5L16 9.5"/>',
};

export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.innerHTML = ICONS[name] || ''; // static trusted strings only
  return svg;
}

export function lantern() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 60 80');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ea8ff"/><stop offset="1" stop-color="#2a5bd7"/></linearGradient></defs><circle cx="30" cy="8" r="5" fill="none" stroke="#fff" stroke-width="3"/><polygon points="12,24 48,24 40,12 20,12" fill="#fff"/><rect x="15" y="24" width="30" height="40" rx="7" fill="url(#lg)" stroke="#fff" stroke-width="2.5"/><circle cx="30" cy="44" r="9" fill="#a9ccff"/><rect x="11" y="64" width="38" height="8" rx="3" fill="#fff"/>';
  return svg;
}

// ---------- Formatting ----------
export const TYPE_LABEL = { INTERNSHIP: 'Internship', FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Contract' };
export const STATUS_META = {
  APPLIED: { label: 'Applied', cls: '', icon: 'clock' },
  SHORTLISTED: { label: 'Shortlisted', cls: 'badge--accent', icon: 'star' },
  INTERVIEW: { label: 'Interview', cls: 'badge--warning', icon: 'users' },
  OFFERED: { label: 'Offered', cls: 'badge--success', icon: 'check' },
  REJECTED: { label: 'Rejected', cls: 'badge--danger', icon: 'x' },
  WITHDRAWN: { label: 'Withdrawn', cls: 'badge--neutral', icon: 'logout' },
};
export const statusBadge = (s) => {
  const m = STATUS_META[s] || { label: s, cls: 'badge--neutral', icon: 'info' };
  return h('span', { class: `badge ${m.cls}`, 'data-st': s }, icon(ICONS[m.icon] ? m.icon : 'info'), m.label);
};
export const verifyBadge = (v) =>
  h('span', { class: `badge ${v === 'VERIFIED' ? 'badge--success' : v === 'REJECTED' ? 'badge--danger' : 'badge--warning'}` }, icon(v === 'VERIFIED' ? 'shield' : v === 'REJECTED' ? 'x' : 'clock'), v === 'VERIFIED' ? 'Verified' : v === 'REJECTED' ? 'Rejected' : 'Pending approval');

export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateTime(s) {
  const d = new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

// ---------- Components ----------
/**
 * The language select. It sits in the top bar while the bar has room for it, and in the landing footer on phones where
 * it does not. It takes the re-render as a callback instead of importing the router, so both places can use it.
 */
export function langPicker({ onchange: after } = {}) {
  return h('select', { class: 'lang', 'aria-label': 'Language', onchange: (e) => { setLang(e.target.value); if (after) after(); } },
    LANGS.map(([v, l]) => h('option', { value: v, selected: v === getLang() ? true : null }, l)));
}

export function scoreRing(value, { size = '', label = true, accent = false } = {}) {
  const v = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  return h('div', { class: `ring ${size === 'sm' ? 'ring--sm' : ''} ${accent ? 'ring--accent' : ''} ${v >= 75 ? 'ring--hi' : v >= 50 ? 'ring--mid' : 'ring--lo'}`, role: 'img', 'aria-label': `Score ${v} out of 100`, style: { '--p': v } },
    h('span', { class: 'ring__value' }, v, h('small', null, '/100')));
}


/**
 * A trend line for a stat tile, drawn as inline SVG so it costs no request and no library.
 *
 * Returns null for fewer than two points: a single sample is not a trend, and drawing a flat line through one point
 * would imply a stability nobody measured. `preserveAspectRatio="none"` lets the path stretch to the tile width; the
 * stroke is kept even by `vector-effect: non-scaling-stroke` in CSS.
 */
export function sparkline(values, { label = '', height = 34, width = 132, tone = 'accent' } = {}) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length < 2) return null;
  const min = Math.min(...nums); const max = Math.max(...nums);
  const span = max - min || Math.abs(max) || 1;
  const pad = 3;
  const px = (i) => (i / (nums.length - 1)) * width;
  const py = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
  const line = nums.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
  const el = (name, attrs) => {
    const n = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const svg = el('svg', { class: `spark spark--${tone}`, viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', role: 'img', focusable: 'false', 'aria-label': `${label || 'Trend'} over ${nums.length} points: from ${nums[0]} to ${nums[nums.length - 1]}, low ${min}, high ${max}` });
  svg.append(el('path', { class: 'spark__area', d: `${line} L${width} ${height} L0 ${height} Z` }));
  svg.append(el('path', { class: 'spark__line', d: line }));
  svg.append(el('circle', { class: 'spark__dot', cx: px(nums.length - 1).toFixed(1), cy: py(nums[nums.length - 1]).toFixed(1), r: 2.6 }));
  return svg;
}

export function meter(label, value, max) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  const fill = h('div', { class: `meter__fill ${pct >= 75 ? 'is-hi' : pct >= 50 ? 'is-mid' : 'is-lo'}` });
  requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
  return h('div', { class: 'meter' }, h('span', null, label), h('div', { class: 'meter__track', role: 'img', 'aria-label': `${label}: ${value} of ${max}` }, fill), h('span', { class: 'meter__val' }, `${value}/${max}`));
}

export const weightDots = (w) => h('span', { class: 'weight', role: 'img', 'aria-label': `Importance ${w} of 3`, title: `This job weights the skill ${w} of 3` }, [1, 2, 3].map((i) => h('i', { class: i <= w ? 'on' : '' })));

export function skillChip(name, kind, weight) {
  const cls = kind === 'matched' ? 'chip chip--matched' : kind === 'missing' ? 'chip chip--missing' : 'chip chip--blue';
  return h('span', { class: cls }, kind === 'matched' ? icon('check') : kind === 'missing' ? icon('x') : null, name, weight ? weightDots(weight) : null, kind === 'matched' ? h('span', { class: 'sr-only' }, ' (you have this)') : kind === 'missing' ? h('span', { class: 'sr-only' }, ' (missing)') : null);
}

// `mod` lets a caller pick the compact variant for a slot inside a card ("nothing failed" under a heading that already
// says so). Everything else keeps the page-level block.
export const empty = (iconName, title, text, action, mod = '') =>
  h('div', { class: `empty${mod ? ` ${mod}` : ''}` }, icon(iconName), h('h3', null, title), text ? h('p', { class: 'muted' }, text) : null, action ? h('div', { class: 'empty__act' }, action) : null);

export const errorBox = (err, retry) =>
  h('div', { class: 'alert alert--danger', role: 'alert' }, icon('warn'), h('div', { class: 'stack stack--sm' }, h('strong', null, 'Something went wrong'), h('p', null, err?.message || 'Please try again.'), retry ? h('div', null, h('button', { class: 'btn btn--sm btn--secondary', onclick: retry }, icon('refresh'), 'Try again')) : null));

/** Page-shaped placeholder shown while a view's data loads: header, stat tiles, then cards. */
export const pageSkeleton = () => h('div', { class: 'container page sk', 'aria-busy': 'true', 'aria-label': 'Loading' },
  h('div', { class: 'skeleton sk__title' }), h('div', { class: 'skeleton sk__sub' }),
  h('div', { class: 'stats' }, Array.from({ length: 4 }, () => h('div', { class: 'skeleton sk__stat' }))),
  h('div', { class: 'split' }, h('div', { class: 'stack' }, Array.from({ length: 3 }, () => h('div', { class: 'skeleton sk__card' }))), h('div', { class: 'skeleton sk__card sk__card--tall' })));

export const loadingBlock = (rows = 3) => h('div', { class: 'stack', 'aria-busy': 'true', 'aria-label': 'Loading' }, Array.from({ length: rows }, () => h('div', { class: 'skeleton', style: { height: '84px' } })));

export function toast(message, type = '') {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast ${type ? `toast--${type}` : ''}` }, message);
  box.append(t);
  setTimeout(() => t.remove(), 4500);
}

export function confirmDialog({ title, body, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const done = (v) => { backdrop.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    const yes = h('button', { class: `btn ${danger ? 'btn--danger' : ''}`, onclick: () => done(true) }, confirmText);
    const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) done(false); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', null, title), h('p', null, body),
        h('div', { class: 'modal__actions' }, h('button', { class: 'btn btn--secondary', onclick: () => done(false) }, 'Cancel'), yes)));
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    yes.focus();
  });
}

/** Disable a button while an async action runs and show a spinner. */
export async function busy(btn, fn, label = 'Working…') {
  const original = btn.cloneNode(true);
  btn.disabled = true;
  clear(btn).append(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ` ${label}`);
  try { return await fn(); } finally { btn.disabled = false; clear(btn).append(...original.childNodes); }
}

export function field(label, control, { hint, error, id } = {}) {
  const fid = id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = fid;
  if (hint) control.setAttribute('aria-describedby', `${fid}-hint`);
  return h('div', { class: 'field' }, h('label', { for: fid }, label), control, hint ? h('span', { class: 'hint', id: `${fid}-hint` }, hint) : null, error ? h('span', { class: 'error', role: 'alert' }, error) : null);
}

export const input = (props = {}) => h('input', { class: 'input', ...props });

/** Password field with an inline show/hide toggle. Same shape as field(), so it drops in anywhere. */
export function passwordField(label, pw, { hint, error, id } = {}) {
  const fid = id || `f-${Math.random().toString(36).slice(2, 8)}`;
  pw.id = fid;
  pw.setAttribute('autocomplete', pw.getAttribute('autocomplete') || 'current-password');
  if (hint) pw.setAttribute('aria-describedby', `${fid}-hint`);
  const toggle = h('button', {
    type: 'button',
    class: 'password-toggle',
    'aria-label': `Show ${label.toLowerCase()}`,
    'aria-pressed': 'false',
    tabindex: '0',
    onclick: () => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${label.toLowerCase()}`);
      toggle.replaceChildren(icon(show ? 'eye-off' : 'eye'));
      pw.focus();
    },
  }, icon('eye'));
  return h('div', { class: 'field field--password' },
    h('label', { for: fid }, label),
    h('div', { class: 'input-with-toggle' }, pw, toggle),
    hint ? h('span', { class: 'hint', id: `${fid}-hint` }, hint) : null,
    error ? h('span', { class: 'error', role: 'alert' }, error) : null);
}
export const select = (options, value, props = {}) => h('select', { class: 'select', ...props }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) ? true : null }, l)));
export const textarea = (props = {}, value = '') => { const t = h('textarea', { class: 'textarea', ...props }); t.value = value; return t; };

export const badgeSource = (src) =>
  h('span', { class: `badge ${src === 'llm' ? 'badge--accent' : 'badge--neutral'}`, title: src === 'llm' ? 'Written by a language model, scored with fixed rules' : 'Calculated by the built-in rules engine' }, icon(src === 'llm' ? 'sparkle' : 'bolt'), src === 'llm' ? 'AI review' : 'Rules engine');

/** Large, clearly rotating loading panel with an elapsed-seconds counter. Stops itself when removed from the page. */
export function thinking(label = 'Asking the AI…', hint = 'Slow models can take up to 30 seconds. Falls back to the next model if one fails.') {
  const secs = h('small', null, '0 s');
  const el = h('div', { class: 'thinking', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'thinking__ring', 'aria-hidden': 'true' }), h('div', { class: 'thinking__text' }, h('strong', null, label), secs, hint ? h('small', null, hint) : null));
  const t0 = Date.now();
  const timer = setInterval(() => { if (!el.isConnected && Date.now() - t0 > 500) { clearInterval(timer); return; } secs.textContent = `${Math.floor((Date.now() - t0) / 1000)} s elapsed`; }, 500);
  return el;
}
