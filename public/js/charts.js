// Dependency-free SVG radar chart (CSP-safe: attributes only, no inline styles).
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };

export function radar(dims, { size = 400, label = 'Radar chart' } = {}) {
  const n = dims.length;
  const c = size / 2;
  const R = size / 2 - 104;
  const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': `${label}: ${dims.map((d) => `${d.name} ${Math.round(d.score)}`).join(', ')}`, class: 'radar' });
  for (const f of [0.25, 0.5, 0.75, 1]) svg.append(s('polygon', { points: dims.map((_, i) => pt(i, R * f).join(',')).join(' '), class: 'radar__ring' }));
  dims.forEach((d, i) => {
    const [x, y] = pt(i, R);
    svg.append(s('line', { x1: c, y1: c, x2: x, y2: y, class: 'radar__axis' }));
    const [lx, ly] = pt(i, R + 16);
    const anchor = Math.abs(lx - c) < 6 ? 'middle' : lx > c ? 'start' : 'end';
    svg.append(s('text', { x: lx, y: ly + 4, 'text-anchor': anchor, class: 'radar__label' }, d.name.length > 14 ? `${d.name.slice(0, 13)}…` : d.name));
  });
  svg.append(s('polygon', { points: dims.map((d, i) => pt(i, R * Math.max(0.04, Math.min(100, d.score) / 100)).join(',')).join(' '), class: 'radar__shape' }));
  dims.forEach((d, i) => { const [x, y] = pt(i, R * Math.max(0.04, Math.min(100, d.score) / 100)); svg.append(s('circle', { cx: x, cy: y, r: 4, class: 'radar__dot' })); });
  return svg;
}
