// Weighted skill-coverage scoring. Flat typed-array interface so the same call can be served by the native C++ core
// (native/) when it is built, and by the JS implementation below otherwise. Both must return identical results.
//
//   skillIds / offsets : CSR layout. Student i owns skillIds[offsets[i] .. offsets[i+1]) (ids, any order)
//   reqIds / reqWeights: the job's required skills and their weights (1..3)
//   returns Uint8Array : percent (0..100) of the job's total weight each student covers
export function matchManyJs(skillIds, offsets, reqIds, reqWeights) {
  const n = offsets.length - 1;
  const out = new Uint8Array(n);
  let total = 0;
  const want = new Map();
  for (let i = 0; i < reqIds.length; i++) { want.set(reqIds[i], reqWeights[i]); total += reqWeights[i]; }
  if (!total) return out;
  for (let s = 0; s < n; s++) {
    let have = 0;
    for (let k = offsets[s]; k < offsets[s + 1]; k++) { const w = want.get(skillIds[k]); if (w) have += w; }
    out[s] = Math.round((have / total) * 100);
  }
  return out;
}

let impl = matchManyJs;
export let backend = 'js';
try {
  const native = (await import('./native.js')).loadNative();
  if (native?.matchMany) { impl = native.matchMany; backend = 'native'; }
} catch { /* optional */ }

export const matchMany = (a, b, c, d) => impl(a, b, c, d);
export const __useJs = () => { impl = matchManyJs; backend = 'js'; };

/** Pack arrays of skill-id arrays into the CSR layout. */
export function pack(lists) {
  const offsets = new Int32Array(lists.length + 1);
  let n = 0;
  for (let i = 0; i < lists.length; i++) { offsets[i] = n; n += lists[i].length; }
  offsets[lists.length] = n;
  const ids = new Int32Array(n);
  let p = 0;
  for (const l of lists) for (const id of l) ids[p++] = id;
  return { skillIds: ids, offsets };
}
