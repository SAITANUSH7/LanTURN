import { get, post } from '../api.js';
import { h, clear, icon, toast, busy, loadingBlock, errorBox, empty } from '../ui.js';
import { pageHead, wrapPage } from './shared.js';

const STATUS = { done: ['Done', 'ok'], current: ['You are here', 'accent'], upcoming: ['Next', ''] };
const KIND = { video: 'Video', course: 'Course', docs: 'Docs', practice: 'Practice' };

function guideView(g) {
  return h('ol', { class: 'guide' }, g.steps.map((st) => h('li', { class: 'guide__step' },
    h('div', { class: 'guide__head' }, h('strong', null, st.step), h('span', { class: 'muted' }, st.what)),
    st.links.length ? h('ul', { class: 'guide__links' }, st.links.map((l) => h('li', null,
      h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.title), h('small', { class: 'muted' }, ` ${l.source || KIND[l.kind] || ''}`)))) : null)));
}

/** Vertical flowchart of the whole path: you -> stages (with a decision after each) -> project -> jobs. */
export async function roadmapPage({ query }) {
  const host = h('div', { class: 'stack stack--lg' }, loadingBlock(3));
  let domain = query.domain || '';
  const load = async () => {
    clear(host).append(loadingBlock(3));
    try { draw(await get(`/career/roadmap${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`)); } catch (e) {
      clear(host).append(/Upload|No direction/i.test(e.message || '') ? empty('route', 'No roadmap yet', 'Upload your resume first. We choose the direction and build the flowchart from it.') : errorBox(e, load));
      if (/Upload|No direction/i.test(e.message || '')) host.append(h('a', { class: 'btn', href: '#/student/setup' }, icon('upload'), 'Upload resume'));
    }
  };
  const mark = async (d, si, ti, done) => { await post('/career/topic', { domain: d.domain.id, stage: si, topic: ti, done }); };

  const draw = (d) => {
    clear(host);
    domain = d.domain.id;
    const totalTopics = d.stages.reduce((a, s) => a + s.topics.length, 0);
    const doneTopics = d.stages.reduce((a, s) => a + s.topics.filter((t) => t.done).length, 0);
    host.append(
      h('div', { class: 'card stack' },
        h('div', { class: 'row row--between' }, h('h3', null, d.domain.title), h('span', { class: 'muted' }, `${doneTopics}/${totalTopics} topics · about ${d.domain.estimatedMonths} months`)),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Choose a direction' }, d.directions.slice(0, 8).map((x) => {
          const b = h('button', { type: 'button', class: `chip chip--btn${x.id === d.domain.id ? ' is-on' : ''}`, 'aria-pressed': x.id === d.domain.id ? 'true' : 'false' }, `${x.title} · ${x.fit}%`);
          b.onclick = () => { domain = x.id; load(); };
          return b;
        })),
        h('a', { href: '#/student/map' }, 'See the graph of all directions')));

    const flow = h('div', { class: 'flow' });
    const line = () => h('div', { class: 'flow__line', 'aria-hidden': 'true' });
    flow.append(h('div', { class: 'flow__node flow__node--start' }, icon('user'), h('div', null, h('strong', null, 'You, today'), h('small', { class: 'muted' }, `${doneTopics} topics already covered`))));

    d.stages.forEach((st, si) => {
      flow.append(line());
      const [label, tone] = STATUS[st.status] || STATUS.upcoming;
      const body = h('div', { class: 'flow__body', hidden: st.status === 'upcoming' && si > 0 ? true : null });
      const toggle = h('button', { type: 'button', class: 'flow__toggle', 'aria-expanded': body.hidden ? 'false' : 'true' }, body.hidden ? 'Show topics' : 'Hide topics');
      toggle.onclick = () => { body.hidden = !body.hidden; toggle.textContent = body.hidden ? 'Show topics' : 'Hide topics'; toggle.setAttribute('aria-expanded', String(!body.hidden)); };
      st.topics.forEach((t, ti) => {
        const guideHost = h('div', { hidden: true });
        const cb = h('input', { type: 'checkbox', checked: t.done ? true : null, 'aria-label': `Mark ${t.title} as known` });
        cb.onchange = async () => { try { await mark(d, si, ti, cb.checked); await load(); } catch (e) { cb.checked = !cb.checked; toast(e.message, 'error'); } };
        const gbtn = h('button', { type: 'button', class: 'btn btn--secondary btn--sm' }, 'Study guide');
        gbtn.onclick = () => { if (!guideHost.childElementCount) guideHost.append(guideView(t.guide)); guideHost.hidden = !guideHost.hidden; gbtn.textContent = guideHost.hidden ? 'Study guide' : 'Hide guide'; };
        body.append(h('div', { class: 'flow__topic' },
          h('div', { class: 'row row--between' }, h('label', { class: 'check' }, cb, h('span', { class: t.done ? 'is-done' : '' }, t.title), t.source === 'resume' ? h('small', { class: 'badge badge--ok' }, 'on your resume') : null), gbtn), guideHost));
      });
      if (st.project) body.append(h('div', { class: 'flow__project' }, icon('bolt'), h('div', null, h('strong', null, `Build: ${st.project.title}`), h('p', { class: 'muted' }, st.project.description || ''))));
      flow.append(h('section', { class: `flow__node flow__node--stage flow__node--${st.status}` },
        h('div', { class: 'row row--between' }, h('strong', null, `${si + 1}. ${st.title}`), h('span', { class: `badge ${tone ? 'badge--' + tone : ''}` }, label)),
        h('p', { class: 'muted' }, st.description),
        h('div', { class: 'flow__meter', role: 'img', 'aria-label': `${st.pct}% complete` }, h('i', { style: { width: `${st.pct}%` } })),
        h('small', { class: 'muted' }, `${st.pct}% · ${st.durationWeeks || '?'} weeks · ${st.difficulty || ''}`), toggle, body));

      if (si < d.stages.length - 1 && st.pct < 100) {
        const skip = h('button', { type: 'button', class: 'btn btn--secondary btn--sm' }, 'Yes, skip ahead');
        skip.onclick = () => busy(skip, async () => {
          try { for (const t of st.topics) if (!t.done) await mark(d, si, t.index, true); toast('Stage marked as known', 'success'); await load(); } catch (e) { toast(e.message, 'error'); }
        }, 'Saving…');
        flow.append(line(), h('div', { class: 'flow__decision' }, h('div', { class: 'flow__diamond', 'aria-hidden': 'true' }, '?'), h('div', { class: 'stack stack--sm' }, h('strong', null, `Already comfortable with "${st.title}"?`), h('div', { class: 'row' }, skip, h('span', { class: 'muted' }, 'Otherwise carry on below.')))));
      }
    });
    flow.append(line(), h('a', { class: 'flow__node flow__node--goal', href: '#/student/jobs' }, icon('briefcase'), h('div', null, h('strong', null, 'Apply to roles'), h('small', { class: 'muted' }, `${d.domain.title} jobs and internships`))));
    host.append(flow);
  };
  await load();
  return wrapPage(pageHead('Your roadmap', 'A step-by-step path from where you are to your first role, with what to study and where.'), host);
}
