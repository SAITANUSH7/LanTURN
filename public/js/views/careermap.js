import { get, post, api, session, reloadUser } from '../api.js';
import { h, clear, icon, empty, toast, busy, loadingBlock, badgeSource } from '../ui.js';
import { pageHead, wrapPage } from './shared.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const cut = (str, n) => (str.length > n ? `${str.slice(0, n - 1)}…` : str);

const COL = 196, NW = 166, NH = 54, GAP = 16, PAD = 14, HEAD = 34;

/** Layered left-to-right graph. Domain nodes are clickable to refocus the map. */
export function drawGraph(graph, onPick) {
  const layers = graph.layers.map(() => []);
  for (const n of graph.nodes) layers[n.layer].push(n);
  layers.forEach((l) => l.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  const tall = Math.max(...layers.map((l) => l.length), 1);
  const H = HEAD + PAD * 2 + tall * (NH + GAP);
  const W = PAD * 2 + layers.length * COL - (COL - NW);
  const pos = new Map();
  layers.forEach((l, li) => {
    const total = l.length * (NH + GAP) - GAP;
    const top = HEAD + PAD + ((tall * (NH + GAP) - GAP) - total) / 2;
    l.forEach((n, i) => pos.set(n.id, { x: PAD + li * COL, y: top + i * (NH + GAP) }));
  });
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'cmap', role: 'img', 'aria-label': 'Career map graph' });
  graph.layers.forEach((name, li) => svg.append(s('text', { x: PAD + li * COL + NW / 2, y: 18, 'text-anchor': 'middle', class: 'cmap__layer' }, name)));
  for (const e of graph.edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    if (a.x === b.x) { const top = a.y < b.y; svg.append(s('path', { d: `M${a.x + NW / 2},${top ? a.y + NH : a.y} L${b.x + NW / 2},${top ? b.y : b.y + NH}`, class: `cmap__edge cmap__edge--${e.kind}` })); continue; }
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
    svg.append(s('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, class: `cmap__edge cmap__edge--${e.kind}` }));
  }
  for (const n of graph.nodes) {
    const p = pos.get(n.id);
    const g = s('g', { class: `cmap__node cmap__node--${n.type} cmap__node--${n.status || 'upcoming'}${n.focus ? ' is-focus' : ''}`, transform: `translate(${p.x},${p.y})` });
    const clickable = n.type === 'domain' || n.link;
    if (clickable) { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); }
    g.append(s('title', {}, `${n.label}${n.sub ? ' — ' + n.sub : ''}`));
    g.append(s('rect', { width: NW, height: NH, rx: 12 }));
    if (n.type === 'stage' && n.pct != null) g.append(s('rect', { x: 0, y: NH - 4, width: Math.max(2, (NW * n.pct) / 100), height: 4, rx: 2, class: 'cmap__bar' }));
    g.append(s('text', { x: 10, y: 22, class: 'cmap__title' }, cut(n.label, 22)));
    if (n.sub) g.append(s('text', { x: 10, y: 40, class: 'cmap__sub' }, cut(n.sub, 26)));
    if (n.type === 'domain') { const act = () => onPick(n.domainId); g.addEventListener('click', act); g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act(); } }); }
    else if (n.link) { const act = () => { location.hash = n.link.replace(/^#/, '').replace('/jobs', '/student/jobs'); }; g.addEventListener('click', act); g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') act(); }); }
    svg.append(g);
  }
  return svg;
}

export function uploader(onDone) {
  const needsConsent = !session.user.consentAt;
  const file = h('input', { type: 'file', accept: 'application/pdf,.pdf,image/png,image/jpeg,image/webp' });
  const name = h('span', { class: 'strong' }, 'Choose your resume (PDF or photo, max 4 MB)');
  const consent = h('input', { type: 'checkbox' });
  const btn = h('button', { class: 'btn', type: 'button', disabled: true }, icon('upload'), 'Build my map');
  file.onchange = () => { name.textContent = file.files[0]?.name || 'Choose your resume (PDF or photo, max 4 MB)'; btn.disabled = !file.files[0]; };
  btn.onclick = () => busy(btn, async () => {
    if (needsConsent && !consent.checked) { toast('Please tick the consent box first.', 'error'); return; }
    const fd = new FormData(); fd.append('file', file.files[0]); if (consent.checked) fd.append('consent', 'true');
    try { await api('POST', '/resumes', { form: fd }); await reloadUser(); toast('Resume read. Setting everything up…', 'success'); await onDone(); } catch (e) { toast(e.message, 'error'); }
  }, 'Reading resume…');
  return h('div', { class: 'card stack' }, h('h3', null, 'Start from your resume'),
    h('label', { class: 'dropzone' }, icon('upload'), name, h('p', { class: 'muted' }, 'PDF, or a PNG, JPG or WebP photo.'), file),
    needsConsent ? h('label', { class: 'check' }, consent, h('span', null, 'I agree that my resume text is processed by LanTURN to build this map (and by a language model if the administrator enabled one).')) : null,
    h('div', null, btn));
}

export async function careerMap() {
  const host = h('div', { class: 'stack stack--lg' }, loadingBlock(2));
  let focus = null;
  const load = async (domain) => {
    focus = domain || focus;
    clear(host).append(loadingBlock(2));
    try { draw(await get(`/career/map${focus ? `?domain=${encodeURIComponent(focus)}` : ''}`)); } catch (e) { clear(host).append(h('div', { class: 'card' }, h('p', null, e.message))); }
  };
  const draw = (d) => {
    clear(host);
    if (d.needsInput) { host.append(empty('route', 'No map yet', 'Upload your resume and LanTURN will chart every direction you can take, how far along each one you are, and what to do next.'), uploader(() => { location.hash = '/student/setup'; })); return; }
    const insight = h('div', { class: 'card stack', hidden: true });
    const insightBtn = h('button', { class: 'btn btn--secondary', type: 'button' }, icon('sparkle'), 'Explain my map');
    insightBtn.onclick = () => busy(insightBtn, async () => {
      try {
        const r = await post('/career/map/insight', { domain: d.focus.id });
        insight.hidden = false;
        clear(insight).append(h('div', { class: 'row row--between' }, h('h3', null, r.headline), badgeSource(r.source)), h('p', { class: 'prose' }, r.summary), h('ol', { class: 'prose' }, r.nextSteps.map((x) => h('li', null, x))));
      } catch (e) { toast(e.message, 'error'); }
    }, 'Thinking…');
    const dirs = h('div', { class: 'stack stack--sm' }, d.domains.map((x) => {
      const b = h('button', { type: 'button', class: `cmap-dir${x.id === d.focus.id ? ' is-on' : ''}` },
        h('span', { class: 'cmap-dir__name' }, x.title), h('span', { class: 'cmap-dir__meta' }, `${x.fit}% fit · ${x.matched}/${x.total} topics${x.openJobs ? ` · ${x.openJobs} job${x.openJobs === 1 ? '' : 's'}` : ''}`),
        h('span', { class: 'cmap-dir__bar' }, h('i', { style: { width: `${x.fit}%` } })));
      b.onclick = () => load(x.id);
      return b;
    }));
    const actions = d.nextActions.length ? h('ol', { class: 'stack stack--sm cmap-actions' }, d.nextActions.map((a) => h('li', null,
      h('strong', null, a.kind === 'build' ? `Build: ${a.title}` : `Learn: ${a.title}`),
      h('small', { class: 'muted' }, ` in ${a.stage}`),
      a.resources?.length ? h('div', { class: 'chips' }, a.resources.map((r) => (r.url ? h('a', { class: 'chip', href: r.url, target: '_blank', rel: 'noopener noreferrer' }, cut(r.title || r.url, 30)) : h('span', { class: 'chip' }, cut(String(r.title || r), 30))))) : null))) : h('p', { class: 'muted' }, 'Nothing missing in the current stage. Move to the next one.');
    host.append(
      h('div', { class: 'card' }, h('div', { class: 'row row--between' }, h('h3', null, `Your map: ${d.focus.title}`), h('small', { class: 'muted' }, 'Tap a direction to refocus')),
        h('div', { class: 'cmap-wrap' }, drawGraph(d.graph, (id) => load(id)))),
      h('div', { class: 'grid grid--2' },
        h('div', { class: 'card stack' }, h('h3', null, 'All directions, ranked'), dirs),
        h('div', { class: 'card stack' }, h('h3', null, 'Do this next'), actions, h('div', null, insightBtn))),
      insight, uploader(() => load()));
  };
  await load();
  return wrapPage(pageHead('Career Map', 'Every direction your resume opens up, where you stand in each, and the shortest path forward.'), host);
}
