import { get, post } from '../api.js';
import { h, clear, icon, empty, errorBox, loadingBlock, toast, verifyBadge, fmtDate } from '../ui.js';
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
