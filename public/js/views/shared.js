import { api, get, put, post } from '../api.js';
import { h, clear, icon, toast, busy, textarea, TYPE_LABEL, scoreRing, skillChip, meter, fmtDate, fmtDateTime, badgeSource } from '../ui.js';

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
    h('div', { class: 'card card--blue rm-plan' },
      // One column: a headline that runs to two lines next to a right-aligned badge row squeezed both, and the
      // `16 weeks at ~8 h/week` pill competed with the plan's own title for the same line.
      h('p', { class: 'rm-plan__target' }, `Target · ${r.target.title}`),
      h('h2', { class: 'rm-plan__title' }, p.headline),
      h('div', { class: 'rm-plan__meta' },
        h('span', { class: 'badge badge--accent' }, icon('clock'), `${p.totalWeeks} weeks at ~8 h/week`),
        h('span', { class: 'badge' }, icon('route'), `${p.steps.length} step${p.steps.length === 1 ? '' : 's'}`),
        badgeSource(r.source))),
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

/** Email notification switch. Hidden when the server has no email provider configured. */
export async function emailPrefsCard() {
  try {
    const p = await get('/email-prefs');
    if (!p.available) return null;
    const box = h('input', { type: 'checkbox', checked: p.enabled ? true : null, onchange: async (e) => {
      try { await put('/email-prefs', { enabled: e.target.checked }); toast(e.target.checked ? 'Emails on' : 'Emails off', 'success'); } catch (x) { e.target.checked = !e.target.checked; toast(x.message, 'error'); }
    } });
    return h('div', { class: 'card stack stack--sm' }, h('h3', null, 'Email notifications'), h('label', { class: 'check' }, box, 'Email me about application updates, strong matches and new matching jobs'), h('small', { class: 'muted' }, 'Chat and connection activity is never emailed. Every email also has a one-click unsubscribe link.'));
  } catch { return null; }
}


/** Download a file the API serves behind sign-in (CSV, calendar). */
export async function downloadFile(path, filename) {
  const res = await api('GET', path, { raw: true });
  const url = URL.createObjectURL(await res.blob());
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const MODE_LABEL = { VIDEO: 'Video call', PHONE: 'Phone call', ONSITE: 'On site' };
const safeLink = (t) => (/^https:\/\/\S+$/i.test(t) ? h('a', { href: t, target: '_blank', rel: 'noopener noreferrer' }, t) : h('span', null, t));
const fmtWhen = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** One interview line. `actions` are extra buttons (employer: cancel). */
export function interviewRow(it, actions = []) {
  const past = new Date(it.startsAt).getTime() < Date.now();
  const cancelled = it.status === 'CANCELLED';
  return h('div', { class: `interview${cancelled ? ' is-cancelled' : ''}` },
    h('div', { class: 'interview__when' }, icon('clock'), h('strong', null, fmtWhen(it.startsAt)), h('span', { class: 'muted' }, `${it.durationMin} min`), cancelled ? h('span', { class: 'badge badge--neutral' }, 'Cancelled') : past ? h('span', { class: 'badge badge--neutral' }, 'Past') : h('span', { class: 'badge badge--success' }, 'Scheduled')),
    h('p', { class: 'interview__where' }, h('span', { class: 'muted' }, `${MODE_LABEL[it.mode]}${it.location ? ': ' : ''}`), it.location ? safeLink(it.location) : null),
    it.note ? h('p', { class: 'muted' }, it.note) : null,
    !cancelled ? h('div', { class: 'row row--wrap' }, h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: (ev) => busy(ev.currentTarget, async () => { try { await downloadFile(`/interviews/${it.id}/ics`, `interview-${it.id}.ics`); } catch (e) { toast(e.message, 'error'); } }) }, icon('download'), 'Add to calendar'), ...actions) : null);
}

/** Message thread for one application. Works for both sides; the server decides who may write. */
export function messageThread(applicationId, { onCount } = {}) {
  const log = h('div', { class: 'thread__log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' });
  const ta = textarea({ rows: '2', maxlength: '2000', placeholder: 'Write a message', 'aria-label': 'Message' });
  const hint = h('p', { class: 'muted thread__hint' });
  const sendBtn = h('button', { type: 'submit', class: 'btn btn--sm' }, icon('bolt'), 'Send');
  const form = h('form', { class: 'thread__form', onsubmit: (e) => {
    e.preventDefault();
    if (!ta.value.trim()) return;
    busy(sendBtn, async () => { try { await post(`/applications/${applicationId}/messages`, { body: ta.value.trim() }); ta.value = ''; await load(); } catch (ex) { toast(ex.message, 'error'); } });
  } }, ta, sendBtn);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
  async function load() {
    try {
      const d = await get(`/applications/${applicationId}/messages`);
      clear(log);
      if (!d.items.length) log.append(h('p', { class: 'muted' }, d.you === 'STUDENT' ? 'No messages yet. You can reply once the employer writes to you.' : 'No messages yet. Introduce yourself or ask a question.'));
      d.items.forEach((m) => log.append(h('div', { class: `msg ${m.from === d.you ? 'msg--me' : 'msg--them'}` }, h('p', null, m.body), h('small', { class: 'muted' }, fmtDateTime(m.at)))));
      log.scrollTop = log.scrollHeight;
      form.hidden = !d.canReply;
      hint.textContent = d.canReply ? 'Ctrl+Enter to send.' : '';
      onCount?.(d.items.length);
    } catch (e) { clear(log).append(h('p', { class: 'muted' }, e.message)); }
  }
  load();
  return h('div', { class: 'thread stack stack--sm' }, log, form, hint);
}
