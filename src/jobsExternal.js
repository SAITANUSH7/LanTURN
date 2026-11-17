// Live job boards. Keys come from env: ADZUNA_APP_ID + ADZUNA_APP_KEY (+ ADZUNA_COUNTRY, default "in"), or JOOBLE_API_KEY.
// Without a key the caller falls back to campus postings. Server-side only: keys never reach the browser.
let doFetch = (...a) => fetch(...a);
export const __setJobsFetch = (f) => { doFetch = f || ((...a) => fetch(...a)); };

const cache = new Map(); // key -> {at, data}; 10 minutes, keeps the free quotas safe
const TTL = 10 * 60 * 1000;

export const liveSources = () => [
  ...(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY ? ['adzuna'] : []),
  ...(process.env.JOOBLE_API_KEY ? ['jooble'] : []),
];

const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const money = (lo, hi) => (lo || hi ? `₹${Math.round((lo || hi) / 1000)}k${hi && lo ? `–${Math.round(hi / 1000)}k` : ''} / yr` : '');

async function adzuna({ keywords, location, page }) {
  const u = new URL(`https://api.adzuna.com/v1/api/jobs/${process.env.ADZUNA_COUNTRY || 'in'}/search/${page}`);
  u.search = new URLSearchParams({ app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY, results_per_page: '20', what: keywords, ...(location ? { where: location } : {}), 'content-type': 'application/json' });
  const r = await doFetch(u, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`adzuna HTTP ${r.status}`);
  const d = await r.json();
  return { totalCount: d.count || 0, jobs: (d.results || []).map((j) => ({ id: `adzuna-${j.id}`, title: clean(j.title), company: j.company?.display_name || '', location: j.location?.display_name || '', snippet: clean(j.description).slice(0, 240), salary: money(j.salary_min, j.salary_max), type: j.contract_time || '', updated: j.created || '', link: j.redirect_url })) };
}

async function jooble({ keywords, location, page }) {
  const r = await doFetch(`https://jooble.org/api/${process.env.JOOBLE_API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keywords, location, page: String(page) }), signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`jooble HTTP ${r.status}`);
  const d = await r.json();
  return { totalCount: d.totalCount || 0, jobs: (d.jobs || []).map((j) => ({ id: `jooble-${j.id}`, title: clean(j.title), company: j.company || '', location: j.location || '', snippet: clean(j.snippet).slice(0, 240), salary: j.salary || '', type: j.type || '', updated: j.updated || '', link: j.link })) };
}

/** Returns { source, totalCount, jobs } or null when no live source is configured or all fail. */
export async function searchLive(q) {
  const key = JSON.stringify(q);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  for (const src of liveSources()) {
    try {
      const data = { source: src, ...(await (src === 'adzuna' ? adzuna(q) : jooble(q))) };
      data.jobs = data.jobs.filter((j) => /^https?:\/\//.test(j.link || ''));
      cache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) { console.warn('live jobs failed:', e.message); }
  }
  return null;
}
