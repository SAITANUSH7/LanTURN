// Tiny DOM toolkit. Everything user-supplied goes through textContent, so no XSS by construction.
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
  sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
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
  return h('span', { class: `badge ${m.cls}` }, icon(ICONS[m.icon] ? m.icon : 'info'), m.label);
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
export function scoreRing(value, { size = '', label = true, accent = false } = {}) {
  const v = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  return h('div', { class: `ring ${size === 'sm' ? 'ring--sm' : ''} ${accent ? 'ring--accent' : ''}`, role: 'img', 'aria-label': `Score ${v} out of 100`, style: { '--p': v } },
    h('span', { class: 'ring__value' }, v));
}

export function meter(label, value, max) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  const fill = h('div', { class: 'meter__fill' });
  requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
  return h('div', { class: 'meter' }, h('span', null, label), h('div', { class: 'meter__track', role: 'img', 'aria-label': `${label}: ${value} of ${max}` }, fill), h('span', { class: 'meter__val' }, `${value}/${max}`));
}

export const weightDots = (w) => h('span', { class: 'weight', title: `Importance ${w} of 3` }, [1, 2, 3].map((i) => h('i', { class: i <= w ? 'on' : '' })));

export function skillChip(name, kind, weight) {
  const cls = kind === 'matched' ? 'chip chip--matched' : kind === 'missing' ? 'chip chip--missing' : 'chip chip--blue';
  return h('span', { class: cls }, kind === 'matched' ? icon('check') : kind === 'missing' ? icon('x') : null, name, weight ? weightDots(weight) : null, kind === 'matched' ? h('span', { class: 'sr-only' }, ' (you have this)') : kind === 'missing' ? h('span', { class: 'sr-only' }, ' (missing)') : null);
}

export const empty = (iconName, title, text, action) =>
  h('div', { class: 'empty' }, icon(iconName), h('h3', null, title), text ? h('p', { class: 'muted' }, text) : null, action ? h('div', { style: { marginTop: '16px' } }, action) : null);

export const errorBox = (err, retry) =>
  h('div', { class: 'alert alert--danger', role: 'alert' }, icon('warn'), h('div', { class: 'stack stack--sm' }, h('strong', null, 'Something went wrong'), h('p', null, err?.message || 'Please try again.'), retry ? h('div', null, h('button', { class: 'btn btn--sm btn--secondary', onclick: retry }, icon('refresh'), 'Try again')) : null));

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
export async function busy(btn, fn) {
  const label = btn.cloneNode(true);
  btn.disabled = true;
  clear(btn).append(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Working…');
  try { return await fn(); } finally { btn.disabled = false; clear(btn).append(...label.childNodes); }
}

export function field(label, control, { hint, error, id } = {}) {
  const fid = id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = fid;
  if (hint) control.setAttribute('aria-describedby', `${fid}-hint`);
  return h('div', { class: 'field' }, h('label', { for: fid }, label), control, hint ? h('span', { class: 'hint', id: `${fid}-hint` }, hint) : null, error ? h('span', { class: 'error', role: 'alert' }, error) : null);
}

export const input = (props = {}) => h('input', { class: 'input', ...props });
export const select = (options, value, props = {}) => h('select', { class: 'select', ...props }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) ? true : null }, l)));
export const textarea = (props = {}, value = '') => { const t = h('textarea', { class: 'textarea', ...props }); t.value = value; return t; };

export const badgeSource = (src) =>
  h('span', { class: `badge ${src === 'llm' ? 'badge--accent' : 'badge--neutral'}`, title: src === 'llm' ? 'Written by a language model, scored with fixed rules' : 'Calculated by the built-in rules engine' }, icon(src === 'llm' ? 'sparkle' : 'bolt'), src === 'llm' ? 'AI review' : 'Rules engine');
