import { get, post } from '../api.js';
import { h, clear, icon, empty, toast, busy, loadingBlock, errorBox } from '../ui.js';
import { pageHead, wrapPage } from './shared.js';
import { uploader } from './careermap.js';

const LABELS = { name: 'Name', college: 'College', degree: 'Degree', branch: 'Branch', graduationYear: 'Graduation year', location: 'City' };

/** "We set everything up from your resume": what was filled, skills, direction, next steps, matching jobs. */
export async function setupPage() {
  const host = h('div', { class: 'stack stack--lg' }, loadingBlock(3));
  const load = async () => {
    clear(host).append(loadingBlock(3));
    try {
      const { setup } = await get('/career/setup');
      draw(setup);
    } catch (e) { clear(host).append(errorBox(e, load)); }
  };
  const draw = (s) => {
    clear(host);
    if (!s) { host.append(empty('file', 'Nothing set up yet', 'Upload your resume and we will fill in your profile, pick your skills, choose a direction and match jobs automatically.'), uploader(load)); return; }
    const filled = Object.entries(s.filled || {});
    const redo = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('refresh'), 'Run again');
    redo.onclick = () => busy(redo, async () => { try { draw((await post('/career/auto-setup')).setup); toast('Updated from your latest resume', 'success'); } catch (e) { toast(e.message, 'error'); } }, 'Working…');
    host.append(
      h('div', { class: 'card card--accent stack' },
        h('div', { class: 'row row--between' }, h('h3', null, s.headline || 'Your profile is ready'), redo),
        h('p', null, s.direction ? `Best direction for you right now: ${s.direction.title} (${s.direction.fit}% of its topics already on your resume).` : 'Add more skills to see a direction.'),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/student/roadmap' }, icon('route'), 'Open my roadmap'), h('a', { class: 'btn btn--secondary', href: '#/student/map' }, 'See all directions'), h('a', { class: 'btn btn--secondary', href: '#/student/jobs' }, 'Browse jobs'))),
      h('div', { class: 'grid grid--2' },
        h('div', { class: 'card stack' }, h('h3', null, 'Filled into your profile'),
          filled.length ? h('dl', { class: 'kv' }, filled.flatMap(([k, v]) => [h('dt', null, LABELS[k] || k), h('dd', null, String(v))])) : h('p', { class: 'muted' }, 'Your profile already had these details, so nothing was overwritten.'),
          h('small', { class: 'muted' }, 'Wrong? Fix anything in Profile. Your edits are never overwritten.'), h('a', { href: '#/student/profile' }, 'Review profile')),
        h('div', { class: 'card stack' }, h('h3', null, `Skills found (${s.skills.length})`),
          s.skills.length ? h('div', { class: 'chips' }, s.skills.map((x) => h('span', { class: 'chip' }, x))) : h('p', { class: 'muted' }, 'No known skills were recognised. Add skills in Profile.'))),
      s.ml ? h('div', { class: 'card stack' }, h('h3', null, 'Second opinion from the ML model'),
        h('p', { class: 'muted' }, 'A text classifier trained on the career paths reads your resume independently of the skill matching above.'),
        h('ul', { class: 'stack stack--sm' }, s.ml.top.map((t) => h('li', { class: 'row row--between' }, h('a', { href: `#/student/roadmap?domain=${t.id}` }, t.title), h('span', { class: 'muted' }, `${Math.round(t.prob * 100)}% confidence`)))),
        h('small', { class: 'muted' }, `Model v${s.ml.modelVersion}. Confidence is spread across 28 paths, so 30–50% is already a strong signal.`)) : null,
      h('div', { class: 'grid grid--2' },
        h('div', { class: 'card stack' }, h('h3', null, 'Do this next'),
          s.nextActions.length ? h('ol', { class: 'stack stack--sm cmap-actions' }, s.nextActions.map((a) => h('li', null, h('strong', null, a.kind === 'build' ? `Build: ${a.title}` : `Learn: ${a.title}`), h('small', { class: 'muted' }, ` in ${a.stage}`)))) : h('p', { class: 'muted' }, 'Nothing missing in your current stage.'),
          h('a', { href: '#/student/roadmap' }, 'See the full flowchart with study links')),
        h('div', { class: 'card stack' }, h('h3', null, 'Other directions worth a look'),
          s.alternatives.length ? h('ul', { class: 'stack stack--sm' }, s.alternatives.map((a) => h('li', { class: 'row row--between' }, h('a', { href: `#/student/roadmap?domain=${a.id}` }, a.title), h('span', { class: 'muted' }, `${a.fit}% fit`)))) : h('p', { class: 'muted' }, 'None yet.'))),
      h('div', { class: 'card stack' }, h('h3', null, 'Jobs you match'),
        s.jobs.length ? h('ul', { class: 'stack' }, s.jobs.map((j) => h('li', { class: 'row row--between' },
          h('div', { class: 'stack stack--sm' }, h('a', { class: 'strong', href: `#/student/jobs/${j.id}` }, j.title), h('small', { class: 'muted' }, [j.company, j.location].filter(Boolean).join(' · ') + (j.missing.length ? ` · missing: ${j.missing.slice(0, 3).join(', ')}` : ''))),
          h('span', { class: `badge ${j.match >= 70 ? 'badge--ok' : ''}` }, `${j.match}% match`)))) : h('p', { class: 'muted' }, 'No open jobs yet. New ones appear as employers post them.')),
      uploader(load));
  };
  await load();
  return wrapPage(pageHead('Your auto-setup', 'Everything below came from your resume. Nothing is final: change what you like.'), host);
}
