import { get, post, put, del } from '../api.js';
import { h, clear, icon, empty, errorBox, loadingBlock, toast, verifyBadge, fmtDate, busy, field, input, thinking, sparkline } from '../ui.js';
import { pageHead, wrapPage } from './shared.js';

export async function employers({ query }) {
  let status = query.status || 'PENDING';
  const bar = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' });
  const host = h('div');
  async function load() {
    clear(bar).append(...['PENDING', 'VERIFIED', 'REJECTED', ''].map((s) => h('button', { class: 'filter', 'aria-pressed': String(status === s), onclick: () => { status = s; load(); } }, s ? s[0] + s.slice(1).toLowerCase() : 'All')));
    clear(host).append(loadingBlock(2));
    try {
      const d = await get(`/admin/employers${status ? `?status=${status}` : ''}`);
      clear(host);
      if (!d.items.length) { host.append(empty('shield', 'Nothing here', 'No employer accounts match this filter.')); return; }
      const act = (id, what) => async () => { try { await post(`/admin/employers/${id}/${what}`); toast(what === 'approve' ? 'Employer approved' : 'Employer rejected', 'success'); load(); } catch (e) { toast(e.message, 'error'); } };
      host.append(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Company', 'Email', 'Industry', 'Registered', 'Status', 'Actions'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, d.items.map((e) => h('tr', null,
          h('td', null, h('strong', null, e.companyName)), h('td', null, e.email), h('td', null, e.industry || '—'), h('td', null, fmtDate(e.createdAt)), h('td', null, verifyBadge(e.verification)),
          h('td', null, h('div', { class: 'row' },
            e.verification !== 'VERIFIED' ? h('button', { class: 'btn btn--sm', onclick: act(e.userId, 'approve') }, icon('check'), 'Approve') : null,
            e.verification !== 'REJECTED' ? h('button', { class: 'btn btn--danger btn--sm', onclick: act(e.userId, 'reject') }, 'Reject') : null))))))));
    } catch (e) { clear(host).append(errorBox(e, load)); }
  }
  await load();
  return wrapPage(pageHead('Employers', 'Approve employer accounts before they can post jobs.'), bar, host);
}

// ---------------------------------------------------------------- AI providers (keys saved on the server, never shown again)
export async function aiSettings() {
  const host = h('div', { class: 'stack' });
  const summary = h('div', { class: 'alert', role: 'status' });
  async function load() {
    const d = await get('/admin/ai');
    clear(summary).append(icon('info'), h('span', null, d.active.length ? `Active order: ${[...new Set(d.active.map((p) => p.label))].join(' → ')}, then the rules engine.` : 'No provider is active. The site is running on the built-in rules engine.'));
    clear(host).append(...(d.storage && !d.storage.persistent ? [h('div', { class: 'alert alert--warn', role: 'alert' }, icon('info'), h('span', null, `Storage warning: keys saved here are lost on redeploy. ${d.storage.hint}`))] : []), await routingCard(), ...d.providers.map(card));
  }
  async function routingCard() {
    const r = await get('/admin/ai/routes');
    const rows = r.groups.map((g) => {
      const model = input({ value: g.model, spellcheck: 'false', 'aria-label': `${g.label} model` });
      const out = h('small', { class: 'muted', 'aria-live': 'polite' });
      const test = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, 'Test');
      test.onclick = () => busy(test, async () => {
        clear(out).append(thinking('Calling model…', null));
        try { const v = model.value.trim(); const i = v.indexOf(':'); const named = i > 0 && /^(opencode|deepseek|kimi|gemini|groq|openrouter|openai|anthropic|custom)$/.test(v.slice(0, i));
        const t = await post(`/admin/ai/${named ? v.slice(0, i) : 'nvidia'}/test`, { model: named ? v.slice(i + 1) : v }); clear(out).append(t.ok ? `Works (${(t.ms / 1000).toFixed(1)} s)` : `Not working: ${t.error}`); loadLogs(); } catch (e) { clear(out); toast(e.message, 'error'); }
      }, 'Testing…');
      return { key: g.key, model, row: h('div', { class: 'stack stack--sm' }, h('strong', null, g.label), h('small', { class: 'muted' }, g.hint), h('div', { class: 'row' }, model, test), out) };
    });
    const save = h('button', { class: 'btn btn--sm', type: 'button' }, 'Save routing');
    save.onclick = () => busy(save, async () => { try { await put('/admin/ai/routes', Object.fromEntries(rows.map((x) => [x.key, x.model.value.trim()]))); toast('Routing saved', 'success'); } catch (e) { toast(e.message, 'error'); } });
    const reset = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, 'Reset to defaults');
    reset.onclick = () => busy(reset, async () => { try { await del('/admin/ai/routes'); toast('Defaults restored', 'success'); await load(); } catch (e) { toast(e.message, 'error'); } });
    return h('div', { class: 'card stack' }, h('h3', null, 'Task routing (NVIDIA NIM)'),
      h('p', { class: 'muted' }, r.active ? 'One NVIDIA key, three models. Each task uses its model first, then the other two, then other providers, then the rules engine.' : 'Add an NVIDIA API key below to activate routing.'),
      ...rows.map((x) => x.row), h('div', { class: 'row' }, save, reset));
  }
  function card(p) {
    const key = input({ type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: p.configured ? `Saved ${p.keyHint}. Paste a new key to replace` : 'Paste API key', 'aria-label': `${p.label} API key` });
    const model = input({ value: p.customModel || p.origin === 'env' ? p.model : '', placeholder: p.model, 'aria-label': `${p.label} model` });
    const url = p.editableUrl ? input({ value: p.baseUrl, placeholder: 'https://host/v1', 'aria-label': `${p.label} base URL` }) : null;
    const result = h('p', { class: 'muted', 'aria-live': 'polite' });
    const save = h('button', { class: 'btn btn--sm', type: 'button' }, 'Save');
    const test = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, 'Test');
    const off = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: p.enabled ? true : null, onchange: async (e) => { try { await put(`/admin/ai/${p.name}`, { enabled: e.target.checked }); await load(); } catch (x) { toast(x.message, 'error'); } } }), 'Enabled');
    save.onclick = () => busy(save, async () => {
      const body = { model: model.value.trim() };
      if (key.value.trim()) body.apiKey = key.value.trim();
      if (url) body.baseUrl = url.value.trim();
      try { await put(`/admin/ai/${p.name}`, body); toast(`${p.label} saved`, 'success'); await load(); } catch (e) { toast(e.message, 'error'); }
    });
    test.onclick = () => busy(test, async () => {
      result.className = '';
      clear(result).append(thinking(`Calling ${p.label}…`, 'Testing the first model in the box (saved or not).'));
      try {
        const r = await post(`/admin/ai/${p.name}/test`, { model: model.value.trim() || undefined });
        result.className = r.ok ? 'alert alert--success' : 'alert alert--danger';
        clear(result).append(icon(r.ok ? 'check' : 'warn'), h('span', null, r.ok ? `It works. ${r.model} answered in ${(r.ms / 1000).toFixed(1)} s.` : `Not working: ${r.error}`));
        loadLogs();
      } catch (e) { clear(result); toast(e.message, 'error'); }
    }, 'Testing…');
    const list = h('div', { hidden: true });
    const browse = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, 'Browse models');
    browse.onclick = () => busy(browse, async () => {
      list.hidden = false; clear(list).append(thinking('Loading model list…', null));
      try {
        const r = await get(`/admin/ai/${p.name}/models`);
        if (!r.ok) { clear(list).append(h('div', { class: 'alert alert--danger' }, icon('warn'), h('span', null, r.error))); return; }
        const q = input({ type: 'search', placeholder: `Filter ${r.models.length} models`, 'aria-label': 'Filter models' });
        const box = h('div', { class: 'models' });
        const paint = () => { clear(box).append(...r.models.filter((m) => m.toLowerCase().includes(q.value.toLowerCase())).slice(0, 80).map((m) => h('button', { type: 'button', onclick: () => { model.value = model.value.trim() ? `${model.value.trim()},${m}` : m; toast(`Added ${m}`, 'success'); } }, m))); };
        q.oninput = paint; paint();
        const probeOut = h('div', { class: 'stack stack--sm' });
        const probe = h('button', { class: 'btn btn--sm', type: 'button' }, icon('bolt'), 'Find working models');
        probe.onclick = () => busy(probe, async () => {
          const bad = /vision|embed|rerank|guard|safety|reward|code|vl\b|clip|parse|nemoretriever|whisper|tts|asr/i;
          const pool = r.models.filter((m) => /instruct|chat|it\b|-it/i.test(m) && !bad.test(m));
          const pick = (pool.length >= 4 ? pool : r.models.filter((m) => !bad.test(m))).sort((a, b) => (/(8b|7b|3b|9b|mini|flash|small)/i.test(a) ? 0 : 1) - (/(8b|7b|3b|9b|mini|flash|small)/i.test(b) ? 0 : 1)).slice(0, 8);
          clear(probeOut).append(thinking(`Trying ${pick.length} models at once…`, 'Each gets 20 seconds. Working ones are listed below.'));
          try {
            const pr = await post(`/admin/ai/${p.name}/probe`, { models: pick });
            clear(probeOut).append(h('p', { class: 'strong' }, `${pr.results.filter((x) => x.ok).length} of ${pr.results.length} work with your key. Click a working one to add it.`),
              ...pr.results.map((x) => h('button', { type: 'button', class: `probe ${x.ok ? 'probe--ok' : 'probe--bad'}`, disabled: x.ok ? null : true, title: x.error, onclick: () => { model.value = model.value.trim() ? `${model.value.trim()},${x.model}` : x.model; toast(`Added ${x.model}. Press Save.`, 'success'); } },
                icon(x.ok ? 'check' : 'warn'), h('span', null, x.model), h('small', null, x.ok ? `${(x.ms / 1000).toFixed(1)} s` : x.error.slice(0, 70)))));
          } catch (e) { clear(probeOut); toast(e.message, 'error'); }
        }, 'Trying…');
        clear(list).append(h('p', { class: 'hint muted' }, 'Not every listed model is available to your account. Press "Find working models" to test a shortlist, or click any name below to add it.'), probe, probeOut, q, box);
      } catch (e) { clear(list); toast(e.message, 'error'); }
    }, 'Loading…');
    const remove = p.origin === 'admin' ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => { await del(`/admin/ai/${p.name}`); toast('Saved key removed', 'success'); await load(); } }, icon('trash'), 'Remove key') : null;
    return h('div', { class: 'card stack' },
      h('div', { class: 'row row--between' }, h('h3', null, p.label), h('span', { class: `badge ${p.configured ? 'badge--accent' : 'badge--neutral'}` }, p.configured ? (p.origin === 'admin' ? 'Key saved here' : 'Key from server settings') : 'Not set')),
      h('div', { class: 'form-grid' }, field('API key', key), field('Model (comma list = fallbacks)', model), url ? field('Base URL', url) : null),
      h('div', { class: 'row' }, save, test, browse, off, remove), result, list);
  }
  const logs = h('div', { class: 'stack stack--sm' });
  async function loadLogs() {
    try {
      const d = await get('/admin/ai/logs');
      clear(logs).append(h('div', { class: 'row row--between' }, h('h3', null, 'Recent AI calls'), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: loadLogs }, icon('refresh'), 'Refresh')),
        d.items.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, ['Time', 'Provider', 'Model', 'Used for', 'Result', 'Time taken', 'Details'].map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', null, d.items.map((c) => h('tr', null, h('td', null, new Date(c.at).toLocaleTimeString()), h('td', null, c.provider), h('td', null, c.model), h('td', null, c.purpose),
            h('td', null, h('span', { class: `badge ${c.ok ? 'badge--accent' : 'badge--neutral'}` }, c.ok ? 'OK' : 'Failed')), h('td', null, `${(c.ms / 1000).toFixed(1)} s`), h('td', null, c.note || '')))))) : h('p', { class: 'muted' }, 'No calls yet. Press Test on a provider, or use any AI feature.'));
    } catch { /* ignore */ }
  }
  await load(); await loadLogs();
  return wrapPage(pageHead('AI providers', 'Add API keys here. They are encrypted on the server and never sent back to the browser.'), summary, host, logs);
}

// ---------------------------------------------------------------- System: queue, circuit breakers, ML, metrics
// A tile: label, one big number, an optional trend line and an optional footnote. `opts` used to be a bare tone
// string, and both forms are still accepted so older call sites keep working.
// Every tile has the same four slots - label, number, chart, footnote - so a row of them lines up even when one has no
// history to draw. The chart slot renders a hairline when there is nothing to plot yet, which reads as "flat, unknown"
// rather than as a hole.
const stat = (label, value, opts = {}) => {
  const o = typeof opts === 'string' ? { tone: opts } : opts;
  const bad = o.tone === 'bad';
  return h('div', { class: 'stat stat--tile' },
    h('span', { class: 'stat__label' }, label),
    h('strong', { class: 'stat__value', style: bad ? { background: 'none', color: 'var(--danger, #e5484d)' } : null }, String(value)),
    h('div', { class: 'stat__spark' }, o.spark || null),
    h('span', { class: 'stat__hint' }, [o.delta, o.hint].filter(Boolean).join(' \u00b7 ')));
};

// "6 min", "4 h" or "7 days": how much ground the sparkline actually covers, so a delta never claims a window it does
// not have. Right after a deploy the history is minutes wide, and saying "7 days" then would be a lie.
const spanLabel = (at) => {
  const mins = Math.max(1, Math.round((Date.parse(at[at.length - 1]) - Date.parse(at[0])) / 60000));
  if (mins < 90) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} h`;
};

// Four cards stacked inside a card read as a card inside a card. One strip with hairline dividers reads as a row of
// numbers that belong to the section around it, which is what they are.
const strip = (items) => h('div', { class: 'statstrip' },
  items.map(([label, value, tone]) => h('div', { class: 'statstrip__c' },
    h('small', null, label),
    h('strong', { class: tone === 'bad' ? 'is-bad' : null }, String(value)))));

const signed = (n, unit) => `${n > 0 ? '+' : n < 0 ? '\u2212' : '\u00b1'}${Math.abs(n)}${unit ? ` ${unit}` : ''}`;

const table = (head, rows) => h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, ...head.map((x) => h('th', null, x)))), h('tbody', null, ...rows.map((r) => h('tr', null, ...r.map((c) => h('td', null, c)))))));

export async function system() {
  const host = h('div', { class: 'stack stack--lg' });
  let timer = null;
  let includeFeedback = false;
  let meta = null; // last metrics payload, for the page-head chips
  async function load(first) {
    if (first) clear(host).append(loadingBlock(3));
    try {
      const [m, t, ml, me, bk] = await Promise.all([get('/admin/metrics'), get('/admin/tasks'), get('/admin/ml'), get('/admin/ml/measure'), get('/admin/backups')]);
      const q = m.queue;
      const hist = m.history || { at: [], rssMb: [], rssPeakMb: [], inflight: [], queued: [], deadLetters: [] };
      meta = m;
      const failed = t.items.filter((x) => x.status === 'FAILED');
      clear(host).append(
        h('div', { class: 'grid grid--4' },
          stat('Uptime', `${Math.round(m.uptimeSec / 60)} min`, { hint: 'since this process started' }),
          stat('Memory (RSS)', `${m.memoryMb.rss} MB`, {
            spark: sparkline(hist.rssMb, { label: 'Memory, last 7 days' }),
            delta: hist.rssMb.length >= 2 ? `${signed(hist.rssMb[hist.rssMb.length - 1] - hist.rssMb[0], 'MB')} in ${spanLabel(hist.at)}` : null,
            hint: hist.at.length >= 2 ? `peak ${Math.max(...hist.rssPeakMb)} MB` : 'collecting history, one sample a minute',
          }),
          stat('In flight', m.inflight, {
            spark: sparkline(hist.inflight, { label: 'In-flight requests, busiest minute of each hour' }),
            hint: hist.at.length >= 2 ? `busiest ${hist.bucket === 'minute' ? 'minute' : 'hour'} ${Math.max(...hist.inflight)}` : 'requests being served right now',
          }),
          stat('Queue depth', q.queued ?? 0, {
            tone: q.oldestQueuedSec > 300 || q.deadLetters ? 'bad' : '',
            spark: sparkline(hist.queued, { label: 'Queue depth, last 7 days' }),
            hint: q.queued ? (q.oldestQueuedSec > 0 ? `oldest waiting ${q.oldestQueuedSec}s` : 'waiting for a worker') : 'queue is empty',
          })),
        h('div', { class: 'card stack' }, h('h3', null, 'Background queue'),
          strip([
            ['Queued', q.queued ?? 0],
            ['Running', q.running],
            ['Failed (dead letters)', q.deadLetters, q.deadLetters ? 'bad' : ''],
            ['Oldest waiting', `${q.oldestQueuedSec}s`, q.oldestQueuedSec > 300 ? 'bad' : ''],
          ]),
          failed.length ? table(['Task', 'Type', 'Attempts', 'Error', ''], failed.map((x) => [`#${x.id}`, x.type, `${x.attempts}/${x.max_attempts}`, (x.error || '').slice(0, 90), h('button', { class: 'btn btn--secondary btn--sm', onclick: (ev) => busy(ev.currentTarget, async () => { try { await post(`/admin/tasks/${x.id}/retry`); toast('Re-queued', 'success'); await load(); } catch (e) { toast(e.message, 'error'); } }) }, 'Retry')])) : empty('check', 'Nothing failed', 'Tasks that exhaust their attempts land here, with a one-click retry.')),
        h('div', { class: 'card stack' }, h('h3', null, 'Circuit breakers'), h('p', { class: 'muted' }, 'Open means the provider or service is being skipped and the built-in fallback is serving requests.'),
          m.breakers.length ? table(['Service', 'Recent failures', 'State'], m.breakers.map((b) => [b.key, b.fails, h('span', { class: b.open ? 'chip chip--missing' : 'chip chip--matched' }, b.open ? `open, retry in ${Math.ceil(b.retryInMs / 1000)}s` : 'closed')])) : empty('shield', 'No provider traffic yet', 'A breaker opens the moment an AI or mail provider starts failing, and closes again on recovery.')),
        h('div', { class: 'card stack' }, h('h3', null, 'ML model'),
          ml.model ? h('div', { class: 'stack stack--sm' }, h('p', null, `Active version ${ml.model.meta?.version ?? '?'} · ${ml.model.extra_samples ?? 0} extra training examples · ${ml.model.versions?.length ?? 0} saved versions`),
            ml.model.meta ? h('p', { class: 'muted' }, `Hold-out top-1 accuracy ${ml.model.meta.holdout_top1 ?? 'n/a'}. This is measured on synthetic text from the same generator as training, so it is not real-world accuracy.`) : null)
            : h('p', { class: 'muted' }, 'NLP service is not connected. Everything runs on the built-in rules.'),
          h('div', { class: 'row' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: includeFeedback ? true : null, onchange: (e) => { includeFeedback = e.target.checked; } }), `Include student feedback (${me.feedbackExamples} examples)`),
            h('button', { class: 'btn btn--secondary btn--sm', disabled: ml.model ? null : true, onclick: (ev) => busy(ev.currentTarget, async () => { try { const r = await post('/admin/ml/retrain', { includeFeedback }); toast(`Retrained (${r.feedbackUsed} feedback examples used)`, 'success'); await load(); } catch (e) { toast(e.message, 'error'); } }) }, 'Retrain now'))),
        h('div', { class: 'card stack' }, h('h3', null, 'Does the match score predict hiring decisions?'), h('p', { class: me.enoughData ? '' : 'muted' }, me.note),
          h('p', null, `${me.labeled} decided applications (${me.positives} advanced, ${me.negatives} rejected).`),
          table(['Signal', 'Samples', 'AUC', 'Precision in top fifth', 'Reading'], [['Skill match score', me.matchScore.n, me.matchScore.auc ?? '—', me.matchScore.precisionAtTopFifth ?? '—', me.matchScore.interpretation], ['Resume score', me.resumeScore.n, me.resumeScore.auc ?? '—', me.resumeScore.precisionAtTopFifth ?? '—', me.resumeScore.interpretation]]),
          h('small', { class: 'muted' }, 'AUC 0.5 is a coin flip, 1.0 is perfect agreement with employers.')),
        h('div', { class: 'card stack' }, h('h3', null, 'Monitoring and backups'),
          h('div', { class: 'row' }, ...[['Sentry', bk.monitoring.sentry], ['Alert webhook', bk.monitoring.alertWebhook], ['Uptime ping', bk.monitoring.uptimePing]].map(([l, on]) => h('span', { class: on ? 'chip chip--matched' : 'chip chip--missing' }, `${l}: ${on ? 'on' : 'not set'}`))),
          bk.items.length ? table(['Backup', 'Size', 'Created'], bk.items.slice(0, 5).map((b) => [b.file, `${Math.round(b.sizeBytes / 1024)} KB`, fmtDate(b.createdAt)])) : h('p', { class: 'muted' }, 'No backups yet. One is taken daily.'),
          h('div', { class: 'row' }, h('button', { class: 'btn btn--secondary btn--sm', onclick: (ev) => busy(ev.currentTarget, async () => { try { const r = await post('/admin/backups/run'); toast(`Backup saved (${Math.round(r.sizeBytes / 1024)} KB)`, 'success'); await load(); } catch (e) { toast(e.message, 'error'); } }) }, 'Back up now')),
          h('small', { class: 'muted' }, 'Backups live on the same volume as the database. They protect against corruption and mistakes, not against losing the volume: download one regularly or copy it off-site.')),
        h('div', { class: 'card stack' }, h('h3', null, 'Slowest routes'),
          table(['Route', 'Requests', 'Errors', 'p50', 'p95', 'Max'], [...m.routes].sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 12).map((r) => [r.route, r.count, r.errors, `${r.p50Ms} ms`, `${r.p95Ms} ms`, `${r.maxMs} ms`]))));
    } catch (e) { clear(host).append(errorBox(e, () => load(true))); }
  }
  await load(true);
  timer = setInterval(() => { if (!host.isConnected) { clearInterval(timer); return; } load(); }, 8000);
  const chips = meta ? h('div', { class: 'row' },
    h('span', { class: 'chip chip--blue' }, `Match engine: ${meta.matchBackend}`),
    h('span', { class: meta.email.enabled ? 'chip chip--matched' : 'chip chip--missing' }, `Email: ${meta.email.enabled ? 'on' : 'off'}`)) : null;
  return wrapPage(pageHead('System', 'Live view of background work, provider health and the ML model. Refreshes every few seconds.', chips), host);
}
