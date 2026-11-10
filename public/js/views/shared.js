import { h, icon, TYPE_LABEL, scoreRing, skillChip, meter, fmtDate, badgeSource } from '../ui.js';

export const pageHead = (title, sub, actions) =>
  h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), sub ? h('p', null, sub) : null), actions ? h('div', { class: 'row' }, actions) : null);

export const wrapPage = (...children) => h('div', { class: 'container page stack stack--lg' }, ...children);

export function jobCard(j, href) {
  const meta = h('div', { class: 'job__meta' },
    h('span', null, icon('building'), j.company.name || 'Company'),
    h('span', null, icon('briefcase'), TYPE_LABEL[j.type] || j.type),
    h('span', null, icon('pin'), j.remote ? 'Remote' : j.location || 'Location flexible'));
  return h('a', { class: 'card card--hover job', href },
    h('div', null, h('h3', null, j.title), meta,
      h('div', { class: 'chips' }, j.skills.slice(0, 5).map((s) => skillChip(s.name, null)))),
    j.match ? h('div', { class: 'job__score' }, scoreRing(j.match.score, { size: 'sm' }), h('div', null, 'match')) : null);
}

export function analysisView(a) {
  if (!a) return h('p', { class: 'muted' }, 'No analysis yet.');
  if (a.status === 'FAILED') return h('div', { class: 'alert alert--danger' }, icon('warn'), h('span', null, 'The analysis failed. Use “Re-analyse” to try again.'));
  const b = a.breakdown || {};
  return h('div', { class: 'stack' },
    h('div', { class: 'gap-grid' },
      scoreRing(a.overallScore),
      h('div', { class: 'stack stack--sm' },
        h('div', { class: 'row' }, h('h3', null, 'Overall resume score'), badgeSource(a.source)),
        h('p', { class: 'muted' }, a.summary),
        h('p', { class: 'muted' }, `Structure checks ${a.deterministicScore}/40 · Quality review ${a.aiScore}/60`))),
    h('div', { class: 'stack stack--sm' },
      meter('Sections', b.sections ?? 0, 15), meter('Contact details', b.contact ?? 0, 5), meter('Length', b.length ?? 0, 10), meter('Quantified impact', b.quantified ?? 0, 10),
      meter('Clarity', b.clarity ?? 0, 20), meter('Skills presentation', b.skills ?? 0, 20), meter('Writing quality', b.writing ?? 0, 20)),
    h('div', null, h('h4', null, 'Skills we recognised'),
      h('div', { class: 'chips', style: { marginTop: '8px' } }, (a.extractedSkills.mapped || []).length ? a.extractedSkills.mapped.map((s) => skillChip(s, 'blue')) : h('span', { class: 'muted' }, 'None found. Add a Skills section with standard technology names.'))),
    h('div', { class: 'grid grid--2' },
      h('div', null, h('h4', null, 'Strengths'), h('ul', { class: 'stack stack--sm', style: { marginTop: '8px' } }, a.strengths.map((s) => h('li', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } }, icon('check', 'ok'), s)))),
      h('div', null, h('h4', null, 'Improve next'), h('ol', { class: 'stack stack--sm', style: { marginTop: '8px' } }, a.improvements.map((i, n) => h('li', null, h('strong', null, `${n + 1}. ${i.issue}`), h('p', { class: 'muted' }, i.suggestion)))))));
}

export function roadmapView(r) {
  const p = r.plan;
  return h('div', { class: 'stack' },
    h('div', { class: 'card card--blue' },
      h('div', { class: 'row row--between' }, h('div', null, h('p', { class: 'muted' }, `Target: ${r.target.title}`), h('h2', { style: { fontSize: '1.9rem' } }, p.headline)),
        h('div', { class: 'row' }, h('span', { class: 'badge badge--accent' }, `${p.totalWeeks} weeks at ~8 h/week`), badgeSource(r.source)))),
    p.steps.length
      ? h('div', { class: 'timeline' }, p.steps.map((s) => h('div', { class: 'timeline__item' },
        h('div', { class: 'timeline__dot' }, s.order),
        h('div', { class: 'road' },
          h('div', { class: 'row row--between' }, h('h4', null, s.skill), h('span', { class: 'badge' }, `${s.weeks} wk`)),
          h('p', null, s.why),
          h('ul', null, s.actions.map((a) => h('li', null, a))),
          h('p', null, h('strong', null, 'Project: '), s.projectIdea),
          h('div', { class: 'road__meta' }, s.resourceTypes.map((t) => h('span', { class: 'chip chip--blue' }, t)))))))
      : h('div', { class: 'alert alert--success' }, icon('check'), 'You already cover every listed skill. Apply with confidence.'));
}

export { fmtDate };
