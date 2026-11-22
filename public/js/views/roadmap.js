import { get, post } from '../api.js';
import { h, clear, icon, toast, busy, loadingBlock, errorBox, empty, scoreRing } from '../ui.js';
import { pageHead, wrapPage } from './shared.js';
import { confetti } from '../fx.js';

const KIND = { video: 'Video', course: 'Course', docs: 'Docs', practice: 'Practice' };
const STATUS_LABEL = { done: 'Complete', current: 'In progress', upcoming: 'Up next' };

/** Re-derive percentages and stage status in the browser so toggling a topic updates everything instantly. */
function derive(d) {
  let currentSet = false;
  for (const st of d.stages) {
    const done = st.topics.filter((t) => t.done).length;
    st.doneCount = done; st.pct = st.topics.length ? Math.round((done / st.topics.length) * 100) : 100;
    if (st.pct === 100) st.status = 'done';
    else if (!currentSet) { st.status = 'current'; currentSet = true; } else st.status = 'upcoming';
  }
  d.total = d.stages.reduce((a, s) => a + s.topics.length, 0);
  d.doneTotal = d.stages.reduce((a, s) => a + s.doneCount, 0);
  d.pct = d.total ? Math.round((d.doneTotal / d.total) * 100) : 0;
  d.stagesDone = d.stages.filter((s) => s.status === 'done').length;
  d.monthsLeft = Math.max(0, Math.round(d.domain.estimatedMonths * (1 - (d.total ? d.doneTotal / d.total : 0))));
  d.flat = d.stages.flatMap((s, si) => s.topics.map((t) => ({ si, t })));
}

export async function roadmapPage({ query }) {
  const root = h('div', { class: 'rm' }, loadingBlock(3));
  let domain = query.domain || '';
  let d = null; let filter = 'all'; let open = new Set(); let drawer = null; let openKey = null;

  const closeDrawer = () => { drawer?.remove(); drawer = null; openKey = null; document.removeEventListener('keydown', onKey); };
  addEventListener('hashchange', closeDrawer, { once: true });
  const onKey = (e) => {
    if (!drawer) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const i = d.flat.findIndex((x) => x.t.key === openKey); const n = d.flat[i + (e.key === 'ArrowRight' ? 1 : -1)]; if (n) { e.preventDefault(); showGuide(n.si, n.t); } }
  };

  async function load() {
    clear(root).append(loadingBlock(3));
    try {
      d = await get(`/career/roadmap${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`);
      domain = d.domain.id; derive(d);
      open = new Set(d.stages.filter((s) => s.status === 'current').map((s) => s.index));
      paint();
    } catch (e) {
      const none = /Upload|No direction/i.test(e.message || '');
      clear(root).append(none ? empty('route', 'No roadmap yet', 'Upload your resume first. We pick the direction and build your path from it.') : errorBox(e, load));
      if (none) root.append(h('a', { class: 'btn', href: '#/student/setup' }, icon('upload'), 'Upload resume'));
    }
  }

  async function toggle(si, t, value) {
    const before = d.stages[si].status;
    t.done = value; t.source = value ? 'manual' : null; derive(d); paint(`topic-${si}-${t.index}`);
    try {
      await post('/career/topic', { domain: d.domain.id, stage: si, topic: t.index, done: value });
      if (value && d.stages[si].status === 'done' && before !== 'done') { confetti(); toast(`Stage complete: ${d.stages[si].title}`, 'success'); open.add(si + 1); paint(`topic-${si}-${t.index}`); }
    } catch (e) { t.done = !value; derive(d); paint(`topic-${si}-${t.index}`); toast(e.message, 'error'); }
  }
  async function markStage(si, btn) {
    const st = d.stages[si];
    await busy(btn, async () => {
      try { for (const t of st.topics) if (!t.done) await post('/career/topic', { domain: d.domain.id, stage: si, topic: t.index, done: true }); st.topics.forEach((t) => { if (!t.done) { t.done = true; t.source = 'manual'; } }); derive(d); open.add(si + 1); paint(); confetti(); toast(`Marked "${st.title}" as known`, 'success'); } catch (e) { toast(e.message, 'error'); }
    }, 'Saving…');
  }

  // ---------- study guide drawer ----------
  function showGuide(si, t) {
    openKey = t.key; const st = d.stages[si];
    const i = d.flat.findIndex((x) => x.t.key === t.key); const prev = d.flat[i - 1]; const next = d.flat[i + 1];
    const el = h('aside', { class: 'rm-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Study guide: ${t.title}` },
      h('div', { class: 'rm-drawer__top' }, h('small', null, `${si + 1}. ${st.title}`), h('button', { type: 'button', class: 'rm-x', 'aria-label': 'Close guide', onclick: closeDrawer }, icon('x'))),
      h('h2', { class: 'rm-drawer__title' }, t.title),
      h('div', { class: 'rm-drawer__actions' },
        t.source === 'resume' ? h('span', { class: 'badge badge--ok' }, 'Found on your resume') : h('button', { type: 'button', class: `btn ${t.done ? 'btn--secondary' : ''}`, onclick: async () => { await toggle(si, t, !t.done); showGuide(si, t); } }, icon('check'), t.done ? 'Marked as known' : 'Mark as known')),
      h('ol', { class: 'rm-steps' }, t.guide.steps.map((s) => h('li', null,
        h('strong', null, s.step), h('p', null, s.what),
        s.links.length ? h('ul', null, s.links.map((l) => h('li', null, h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.title), h('small', null, ` ${l.source || KIND[l.kind] || ''}`)))) : null))),
      h('div', { class: 'rm-drawer__nav' },
        h('button', { type: 'button', class: 'btn btn--secondary btn--sm', disabled: prev ? null : true, onclick: () => prev && showGuide(prev.si, prev.t) }, icon('arrow-left'), 'Previous'),
        h('small', null, 'Use ← → keys'),
        h('button', { type: 'button', class: 'btn btn--secondary btn--sm', disabled: next ? null : true, onclick: () => next && showGuide(next.si, next.t) }, 'Next', icon('arrow-right'))));
    const scrim = h('div', { class: 'rm-scrim', onclick: closeDrawer });
    drawer?.remove(); const wrap = h('div', { class: 'rm-layer' }, scrim, el); drawer = wrap; document.body.append(wrap);
    document.removeEventListener('keydown', onKey); document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => { wrap.classList.add('on'); el.focus?.(); });
  }

  // ---------- page ----------
  function paint(focusId) {
    const y = scrollY;
    const nextUp = d.flat.find((x) => !x.t.done);
    const sel = h('select', { class: 'rm-select', 'aria-label': 'Career direction', onchange: (e) => { domain = e.target.value; load(); } },
      d.directions.slice(0, 12).map((x) => h('option', { value: x.id, selected: x.id === d.domain.id ? true : null }, `${x.title} · ${x.fit}% match`)));
    const panel = h('aside', { class: 'rm-panel' },
      h('div', { class: 'rm-panel__ring' }, scoreRing(d.pct, { accent: true }), h('div', null, h('strong', { 'data-testid': 'rm-known' }, `${d.doneTotal} of ${d.total}`), h('span', null, 'topics known'))),
      h('div', { class: 'rm-panel__stats' }, h('div', null, h('b', null, d.stagesDone), h('span', null, `of ${d.stages.length} stages`)), h('div', null, h('b', null, d.monthsLeft), h('span', null, 'months to go'))),
      nextUp ? h('div', { class: 'rm-next' }, h('small', null, 'Up next'), h('strong', null, nextUp.t.title), h('span', null, d.stages[nextUp.si].title),
        h('button', { type: 'button', class: 'btn btn--accent', onclick: () => { open.add(nextUp.si); showGuide(nextUp.si, nextUp.t); } }, icon('arrow-right'), 'Open study guide'))
        : h('div', { class: 'rm-next' }, h('strong', null, 'Every stage is complete'), h('a', { class: 'btn btn--accent', href: '#/student/jobs' }, 'Apply to roles')),
      h('label', { class: 'rm-field' }, h('span', null, 'Direction'), sel),
      h('div', { class: 'segmented rm-filter', role: 'group', 'aria-label': 'Show topics' }, [['all', 'All'], ['todo', 'To do'], ['done', 'Done']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(filter === k), onclick: () => { filter = k; paint(); } }, l))),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => { open = new Set(d.stages.map((s) => s.index)); paint(); } }, 'Expand all'), h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => { open = new Set(); paint(); } }, 'Collapse all')),
      h('a', { class: 'rm-link', href: '#/student/map' }, 'See all directions'));

    const track = h('ol', { class: 'rm-track' });
    track.append(h('li', { class: 'rm-start' }, h('span', { class: 'rm-dot' }, icon('user')), h('div', null, h('strong', null, 'You, today'), h('span', null, `${d.doneTotal} topics already covered`))));
    d.stages.forEach((st, si) => {
      const rows = st.topics.filter((t) => filter === 'all' || (filter === 'done' ? t.done : !t.done));
      if (filter !== 'all' && !rows.length) return;
      const isOpen = open.has(si);
      const list = h('ul', { class: 'rm-topics', role: 'list' }, rows.map((t) => {
        const auto = t.source === 'resume';
        const cb = h('input', { type: 'checkbox', checked: t.done ? true : null, disabled: auto ? true : null, 'aria-label': `${t.done ? 'Unmark' : 'Mark'} ${t.title} as known`, title: auto ? 'Detected from your resume' : null, onchange: (e) => toggle(si, t, e.target.checked) });
        return h('li', { class: `rm-topic${t.done ? ' is-done' : ''}`, id: `topic-${si}-${t.index}` },
          h('label', { class: 'rm-check' }, cb, h('span', { class: 'rm-check__box' }, icon('check'))),
          h('button', { type: 'button', class: 'rm-topic__main', 'data-topic': '1', onclick: () => showGuide(si, t) }, h('span', { class: 'rm-topic__title' }, t.title), auto ? h('span', { class: 'badge badge--ok' }, 'on your resume') : null, h('span', { class: 'rm-topic__go' }, 'Guide', icon('arrow-right'))));
      }));
      list.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const items = [...root.querySelectorAll('[data-topic]')]; const i = items.indexOf(document.activeElement); if (i < 0) return;
        e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
      });
      const head = h('button', { type: 'button', class: 'rm-stage__head', 'aria-expanded': String(isOpen), onclick: () => { isOpen ? open.delete(si) : open.add(si); paint(); } },
        h('span', { class: 'rm-stage__title' }, st.title), h('span', { class: `rm-state rm-state--${st.status}` }, STATUS_LABEL[st.status]), h('span', { class: 'rm-chev', 'aria-hidden': 'true' }, icon('arrow-right')));
      track.append(h('li', { class: `rm-stage rm-stage--${st.status}${isOpen ? ' is-open' : ''}`, style: { '--fill': `${st.pct}%`, '--pn': String(st.pct) } },
        h('span', { class: 'rm-dot' }, st.status === 'done' ? icon('check') : String(si + 1)),
        h('div', { class: 'rm-stage__card' }, head,
          h('p', { class: 'rm-stage__desc' }, st.description),
          h('div', { class: 'rm-bar', role: 'img', 'aria-label': `${st.pct}% complete` }, h('i')),
          h('div', { class: 'rm-meta' }, h('span', null, `${st.doneCount}/${st.topics.length} topics`), h('span', null, `${st.durationWeeks || '?'} weeks`), st.difficulty ? h('span', null, st.difficulty) : null),
          h('div', { class: 'rm-body' }, h('div', { class: 'rm-body__in' }, list,
            st.project ? h('div', { class: 'rm-project' }, icon('bolt'), h('div', null, h('strong', null, `Build: ${st.project.title}`), h('p', null, st.project.description || ''))) : null,
            st.pct < 100 ? h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: (e) => markStage(si, e.currentTarget) }, 'I already know this stage') : null)))));
    });
    track.append(h('li', { class: 'rm-goal' }, h('a', { class: 'rm-goal__card', href: '#/student/jobs' }, h('span', { class: 'rm-dot' }, icon('briefcase')), h('div', null, h('strong', null, 'Apply to roles'), h('span', null, `${d.domain.title} jobs and internships`)))));

    clear(root).append(h('div', { class: 'rm-head' }, h('h2', null, d.domain.title), h('p', null, `${d.stages.length} stages · about ${d.domain.estimatedMonths} months from zero`)), h('div', { class: 'rm-grid' }, track, panel));
    scrollTo(0, y);
    if (focusId) document.getElementById(focusId)?.querySelector('input:not([disabled]), button')?.focus({ preventScroll: true });
  }

  await load();
  return wrapPage(pageHead('Your roadmap', 'Open any topic for a study guide, tick what you already know, and watch the path fill in.'), root);
}
