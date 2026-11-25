/**
 * Interaction polish layer.
 *
 * Small, additive behaviours that make the product feel alive without owning any markup: the DOM, the router and every
 * class the e2e suite pins stay exactly as they were. Everything here degrades to nothing:
 *   · no pointer (touch/screen reader)   -> no hover effects, no ripple
 *   · prefers-reduced-motion: reduce     -> only the safe, non-moving parts (sticky header state, tooltips)
 *   · an error inside one enhancer       -> that enhancer is skipped, the page still works
 */

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const finePointer = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches === true;

/** Run fn now and after every route render (main.js replaces #main's children, so we re-apply each time). */
function onNavigate(fn) {
  let scheduled = 0;
  const run = () => { scheduled = 0; try { fn(document.getElementById('main') || document.body); } catch { /* one enhancer must never break the page */ } };
  const schedule = () => { if (scheduled) return; scheduled = requestAnimationFrame(run); };
  window.addEventListener('hashchange', () => setTimeout(schedule, 30));
  document.addEventListener('lan:render', () => setTimeout(schedule, 30), { once: false });
  // Views render asynchronously; a short idle pass catches the content that arrives after the first paint.
  const observer = new MutationObserver((records) => {
    for (const r of records) if (r.target && (r.target.id === 'main' || r.target.closest?.('#main'))) { schedule(); return; }
  });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  schedule();
}

/** 1. Sticky header: gains elevation once the page has scrolled, so content never slides under a flat bar. */
function stickyHeader() {
  const bars = () => document.querySelectorAll('.topbar');
  const update = () => {
    const stuck = window.scrollY > 6;
    bars().forEach((b) => b.classList.toggle('is-stuck', stuck));
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

/** 2. Ripple: a single expanding light from the pointer, on controls only. Skipped for keyboard activation. */
function ripple() {
  if (reduceMotion() || !finePointer()) return;
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest?.('.btn, .iconbtn, .filter, .tabbar a, .segmented button');
    if (!el || el.hasAttribute('disabled') || el.getAttribute('aria-busy') === 'true') return;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.9;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${ev.clientX - rect.left - size / 2}px`;
    dot.style.top = `${ev.clientY - rect.top - size / 2}px`;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  }, { passive: true });
}

/** 3. Magnetism: primary actions lean a few pixels toward the pointer. 3px of feedback, never more. */
function magnetic() {
  if (reduceMotion() || !finePointer()) return;
  const selector = '.btn--accent, .btn--grad, .lp-cta .btn';
  document.addEventListener('pointermove', (ev) => {
    const el = ev.target.closest?.(selector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = ((ev.clientX - r.left) / r.width - 0.5) * 6;
    const dy = ((ev.clientY - r.top) / r.height - 0.5) * 4;
    el.style.transform = `translate(${dx.toFixed(2)}px, ${(dy - 1).toFixed(2)}px)`;
  }, { passive: true });
  document.addEventListener('pointerout', (ev) => {
    const el = ev.target.closest?.(selector);
    if (el) el.style.transform = '';
  }, { passive: true });
}

/** 4. Charts: the bar chart has no legend, so give each column a native tooltip from its own label. */
function chartTooltips(root) {
  root.querySelectorAll?.('.chart__col').forEach((col) => {
    if (col.dataset.tip) return;
    const text = col.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;
    col.dataset.tip = '1';
    // title only: aria-label on a plain div creates an accessibility violation (prohibited attribute on a generic role).
    col.setAttribute('title', text);
  });
}

/** 5. Stagger: lists reveal in order rather than all at once. Pure CSS var; harmless when motion is reduced. */
function stagger(root) {
  if (reduceMotion()) return;
  for (const group of root.querySelectorAll?.('.bento, .steps4, .stats, .grid, .chips, .attention__list, .lp-logos') || []) {
    [...group.children].forEach((child, i) => {
      if (child.style.getPropertyValue('--i')) return;
      child.style.setProperty('--i', String(Math.min(i, 12)));
    });
  }
}

/** 6. Route change: start each page at the top, and move focus to <main> for keyboard and screen-reader users. */
function routeHygiene() {
  let last = location.hash;
  window.addEventListener('hashchange', () => {
    if (location.hash === last) return;
    last = location.hash;
    window.scrollTo({ top: 0, behavior: 'instant' });
    const main = document.getElementById('main');
    if (main && document.activeElement !== main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
  });
}

/** 7. Numbers: give every metric the tabular figure treatment so columns of digits line up while counting up. */
function tabularNumbers(root) {
  root.querySelectorAll?.('.stat__value, .ring__value, .chart__total, [data-testid="rm-known"]').forEach((n) => {
    if (n.style.fontVariantNumeric) return;
    n.style.fontVariantNumeric = 'tabular-nums';
  });
}

export function initPolish() {
  const safe = (fn, arg) => { try { fn(arg); } catch { /* never let polish break the app */ } };
  safe(stickyHeader);
  safe(ripple);
  safe(magnetic);
  safe(routeHygiene);
  onNavigate((root) => { safe(chartTooltips, root); safe(stagger, root); safe(tabularNumbers, root); });
}
