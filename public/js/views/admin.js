import { get, post, put, del } from '../api.js';
import { h, clear, icon, empty, errorBox, loadingBlock, toast, verifyBadge, fmtDate, busy, field, input } from '../ui.js';
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
    clear(host).append(...d.providers.map(card));
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
      try { const r = await post(`/admin/ai/${p.name}/test`); result.textContent = r.ok ? `Working: ${r.model} answered in ${r.ms} ms.` : `Failed: ${r.error}`; result.className = r.ok ? 'strong' : 'error'; } catch (e) { toast(e.message, 'error'); }
    });
    const remove = p.origin === 'admin' ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => { await del(`/admin/ai/${p.name}`); toast('Saved key removed', 'success'); await load(); } }, icon('trash'), 'Remove key') : null;
    return h('div', { class: 'card stack' },
      h('div', { class: 'row row--between' }, h('h3', null, p.label), h('span', { class: `badge ${p.configured ? 'badge--accent' : 'badge--neutral'}` }, p.configured ? (p.origin === 'admin' ? 'Key saved here' : 'Key from server settings') : 'Not set')),
      h('div', { class: 'form-grid' }, field('API key', key), field('Model (comma list = fallbacks)', model), url ? field('Base URL', url) : null),
      h('div', { class: 'row' }, save, test, off, remove), result);
  }
  await load();
  return wrapPage(pageHead('AI providers', 'Add API keys here. They are encrypted on the server and never sent back to the browser.'), summary, host);
}
