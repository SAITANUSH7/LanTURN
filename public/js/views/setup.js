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
  let polls = 0;
  const redoVerdict = async (btn) => busy(btn, async () => { try { const { verdict } = await post('/career/verdict'); toast('Verdict updated', 'success'); await load(); void verdict; } catch (e) { toast(e.message, 'error'); } }, 'Thinking…');
  const draw = (s) => {
    clear(host);
    // the LLM conclusion arrives from a background task a few seconds after upload: check back a few times
    if (s?.verdict?.pending && polls++ < 5) setTimeout(() => { if (host.isConnected) load(); }, 4000);
    if (!s) { host.append(empty('file', 'Nothing set up yet', 'Upload your resume and we will fill in your profile, pick your skills, choose a direction and match jobs automatically.'), uploader(load)); return; }
    const filled = Object.entries(s.filled || {});
    const redo = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('refresh'), 'Run again');
    redo.onclick = () => busy(redo, async () => { try { draw((await post('/career/auto-setup')).setup); toast('Updated from your latest resume', 'success'); } catch (e) { toast(e.message, 'error'); } }, 'Working…');
    host.append(...[
      h('div', { class: 'card card--accent stack' },
        h('div', { class: 'row row--between' }, h('h3', null, s.headline || 'Your profile is ready'), redo),
        h('p', null, s.direction ? `Best direction for you right now: ${s.direction.title} (${s.direction.fit}% of its topics already on your resume).` : 'Add more skills to see a direction.'),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/student/roadmap' }, icon('route'), 'Open my roadmap'), h('a', { class: 'btn btn--secondary', href: '#/student/map' }, 'See all directions'), h('a', { class: 'btn btn--secondary', href: '#/student/jobs' }, 'Browse jobs'))),
      s.verdict ? verdictCard(s.verdict, redoVerdict) : null,
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
      uploader(load)].filter(Boolean));
  };
  await load();
  return wrapPage(pageHead('Your auto-setup', 'Everything below came from your resume. Nothing is final: change what you like.'), host);
}

const AGREE = { agree: ['Rules and ML agree', 'badge--ok'], partial: ['Partly agree', ''], disagree: ['Rules and ML disagree', ''], 'rules-only': ['Rules only', ''] };
function verdictCard(v, redo) {
  const [alabel, atone] = AGREE[v.agreement] || AGREE['rules-only'];
  const by = [v.sources.rules && 'rules', v.sources.ml && 'ML model', v.sources.llm ? `AI${v.sources.provider ? ` (${v.sources.provider})` : ''}` : null].filter(Boolean).join(' + ');
  const again = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('refresh'), 'Re-run');
  again.onclick = () => redo(again);
  return h('div', { class: 'card card--accent stack' },
    h('div', { class: 'row row--between' }, h('h3', null, 'Combined verdict'), again),
    h('div', { class: 'row' }, h('strong', null, v.headline), h('span', { class: `badge ${atone}` }, alabel), h('span', { class: 'badge' }, `${v.confidence} confidence`)),
    h('p', null, v.reasoning),
    v.pending ? h('p', { class: 'muted' }, 'The AI is reading the rules and ML results now. This updates in a few seconds.') : null,
    h('div', { class: 'grid grid--2' },
      h('div', { class: 'stack stack--sm' }, h('strong', null, 'Strengths'), v.strengths.length ? h('ul', null, v.strengths.map((x) => h('li', null, x))) : h('p', { class: 'muted' }, 'None found yet.')),
      h('div', { class: 'stack stack--sm' }, h('strong', null, 'Do next'), h('ul', null, v.nextSteps.map((x) => h('li', null, x))))),
    v.topJobs.length ? h('div', { class: 'stack stack--sm' }, h('strong', null, 'Best jobs for you'), h('ul', null, v.topJobs.map((j) => h('li', null, h('b', null, j.title), ` · ${j.why}`)))) : null,
    h('small', { class: 'muted' }, `Concluded from: ${by}.${v.llmSkipped ? ' The AI step was skipped, so this is the rules+ML result.' : ''}`));
}
