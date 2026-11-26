// Dependency-free SVG radar chart (CSP-safe: attributes only, no inline styles).
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };

// Two lines beat one ellipsis: an axis you cannot name is not a label.
function wrapLabel(name) {
  if (name.length <= 15) return [name];
  const words = name.split(/\s+/);
  if (words.length === 1) return [`${name.slice(0, 14)}\u2026`];
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) { line = w; continue; }
    if (`${line} ${w}`.length <= 15 && lines.length < 1) line = `${line} ${w}`;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2).map((l, i, arr) => (i === arr.length - 1 && l.length > 17 ? `${l.slice(0, 16)}\u2026` : l));
}

export function radar(dims, { size = 400, label = 'Radar chart' } = {}) {
  const n = dims.length;
  const c = size / 2;
  // The old radius (half the viewBox minus 104) shrank the polygon to 96px and then truncated every axis name to
  // 13 characters - "Technical Dep…", "Execution Spe…" - because there was no room to say what the axis was.
  const R = size / 2 - 78;
  const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': `${label}: ${dims.map((d) => `${d.name} ${Math.round(d.score)}`).join(', ')}`, class: 'radar' });
  for (const f of [0.25, 0.5, 0.75, 1]) svg.append(s('polygon', { points: dims.map((_, i) => pt(i, R * f).join(',')).join(' '), class: 'radar__ring' }));
  dims.forEach((d, i) => {
    const [x, y] = pt(i, R);
    svg.append(s('line', { x1: c, y1: c, x2: x, y2: y, class: 'radar__axis' }));
    const [lx, ly] = pt(i, R + 14);
    const anchor = Math.abs(lx - c) < 6 ? 'middle' : lx > c ? 'start' : 'end';
    const lines = wrapLabel(d.name);
    const t = s('text', { x: lx, y: ly + 4 - (lines.length - 1) * 6, 'text-anchor': anchor, class: 'radar__label' });
    lines.forEach((line, li) => t.append(s('tspan', { x: lx, dy: li === 0 ? 0 : 12 }, line)));
    svg.append(t);
  });
  svg.append(s('polygon', { points: dims.map((d, i) => pt(i, R * Math.max(0.04, Math.min(100, d.score) / 100)).join(',')).join(' '), class: 'radar__shape' }));
  dims.forEach((d, i) => { const [x, y] = pt(i, R * Math.max(0.04, Math.min(100, d.score) / 100)); svg.append(s('circle', { cx: x, cy: y, r: 4, class: 'radar__dot' })); });
  return svg;
}
