import { get, post, put } from '../api.js';
import { h, clear, icon, toast, busy, loadingBlock, errorBox, field, input, textarea, scoreRing } from '../ui.js';
import { pageHead, wrapPage } from './shared.js';

/** Streak + the one thing to do next. Shown on the student home. */
export async function todayCard() {
  try {
    const { streak, next } = await get('/student/today');
    return h('section', { class: 'today', 'aria-label': 'Today' },
      h('div', { class: 'today__streak' }, icon('bolt'),
        h('b', null, streak.current ? `${streak.current}` : '0'),
        h('small', null, streak.current ? 'day streak' : 'no streak yet')),
      h('div', { class: 'today__body' },
        h('p', { class: 'today__kicker' }, streak.current && !streak.doneToday ? 'One thing to keep your streak' : 'Do this next'),
        h('h3', null, next.title),
        h('p', { class: 'muted' }, next.why)),
      h('a', { class: 'btn', href: next.link }, 'Do it', icon('arrow-right')));
  } catch { return null; }
}

const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const list = (arr) => arr.join('\n');

export async function resumeBuilder() {
  const host = h('div', { class: 'stack stack--lg' }, loadingBlock(3));
  let d;
  try { d = await get('/student/builder'); } catch (e) { return wrapPage(pageHead('Resume builder'), errorBox(e, () => location.reload())); }
  const f = {
    name: input({ value: d.name, maxlength: 80 }), email: input({ value: d.email, type: 'email' }), phone: input({ value: d.phone }),
    links: input({ value: d.links.join(', '), placeholder: 'github.com/you, linkedin.com/in/you' }),
    summary: textarea({ rows: 3, maxlength: 600 }, d.summary), skills: input({ value: d.skills.join(', '), placeholder: 'React, Node.js, SQL' }),
  };
  const rows = { education: d.education.map((x) => ({ ...x })), experience: d.experience.map((x) => ({ ...x, bullets: list(x.bullets) })), projects: d.projects.map((x) => ({ ...x, bullets: list(x.bullets) })) };
  const blocks = {
    education: [['school', 'School'], ['degree', 'Degree'], ['years', 'Years'], ['detail', 'Detail (CGPA, honours)']],
    experience: [['role', 'Role'], ['org', 'Company'], ['years', 'Dates'], ['bullets', 'Bullets, one per line', true]],
    projects: [['name', 'Project'], ['tech', 'Tech used'], ['bullets', 'Bullets, one per line', true]],
  };
  const sections = h('div', { class: 'stack stack--lg' });
  const paint = () => {
    clear(sections);
    for (const [key, cols] of Object.entries(blocks)) {
      const box = h('div', { class: 'card stack' }, h('div', { class: 'row row--between' }, h('h3', null, key[0].toUpperCase() + key.slice(1)), h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: () => { rows[key].push(Object.fromEntries(cols.map(([k]) => [k, '']))); paint(); } }, icon('plus'), 'Add')));
      rows[key].forEach((r, i) => {
        const ctl = cols.map(([k, label, multi]) => { const c = multi ? textarea({ rows: 3 }, r[k] || '') : input({ value: r[k] || '' }); c.oninput = () => { r[k] = c.value; }; return field(label, c); });
        box.append(h('div', { class: 'card card--flat stack' }, h('div', { class: 'form-grid' }, ...ctl), h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => { rows[key].splice(i, 1); paint(); } }, icon('x'), 'Remove')));
      });
      sections.append(box);
    }
  };
  paint();
  const body = () => ({
    name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), summary: f.summary.value.trim(),
    links: f.links.value.split(',').map((x) => x.trim()).filter(Boolean), skills: f.skills.value.split(',').map((x) => x.trim()).filter(Boolean),
    education: rows.education, experience: rows.experience.map((x) => ({ ...x, bullets: lines(x.bullets) })), projects: rows.projects.map((x) => ({ ...x, bullets: lines(x.bullets) })),
  });
  const result = h('div', { 'aria-live': 'polite' });
  const save = async () => { await put('/student/builder', body()); };
  const showCheck = (r) => {
    clear(result).append(h('div', { class: 'card stack' }, h('div', { class: 'row' }, scoreRing(r.score, { size: 'sm', accent: true }), h('div', null, h('h3', null, `ATS readiness ${r.score}/100`), h('p', { class: 'muted' }, `${r.words} words. This is a rules-based check of structure and wording, not a guarantee for any one employer's system.`))),
      ...r.checks.map((c) => h('div', { class: 'row' }, h('span', { class: c.status === 'pass' ? 'chip chip--matched' : 'chip chip--missing' }, c.status === 'pass' ? 'OK' : c.status === 'warn' ? 'Improve' : 'Fix'), h('span', null, c.label), c.tip ? h('small', { class: 'muted' }, c.tip) : null)),
      r.jobChecked ? h('p', null, `Job keywords found: ${r.coveredKeywords.join(', ') || 'none'}. Missing: ${r.missingKeywords.join(', ') || 'none'}.`) : null));
  };
  const act = (label, fn, cls = 'btn btn--secondary') => { const b = h('button', { type: 'button', class: cls, onclick: () => busy(b, async () => { try { await fn(); } catch (e) { toast(e.message, 'error'); } }) }, label); return b; };
  const openBlob = (html) => { const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank'); if (!w) toast('Allow pop-ups to open the printable resume', 'error'); };
  const download = (name, text) => { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: name }); document.body.append(a); a.click(); a.remove(); };
  clear(host).append(
    h('div', { class: 'card stack' }, h('h3', null, 'Basics'), h('div', { class: 'form-grid' }, field('Full name', f.name), field('Email', f.email), field('Phone', f.phone), field('Links', f.links)), field('Summary (2 lines)', f.summary), field('Skills, comma separated', f.skills)),
    sections,
    h('div', { class: 'row' },
      act('Save', async () => { await save(); toast('Saved', 'success'); }, 'btn'),
      act('Check ATS readiness', async () => { await save(); showCheck(await post('/student/builder/check', {})); }),
      act('Open printable (Save as PDF)', async () => { await save(); openBlob((await get('/student/builder/export')).html); }),
      act('Download plain text', async () => { await save(); download('resume.txt', (await get('/student/builder/export')).text); })),
    result);
  return wrapPage(pageHead('Resume builder', 'Single-column layout with standard headings, which applicant tracking systems read best. Print it and choose Save as PDF.'), host);
}
