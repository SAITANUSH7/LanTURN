import crypto from 'node:crypto';
import { allow, success, failure } from './ai/breaker.js';

// Optional Python NLP sidecar (services/nlp). Every call is bounded by a timeout and a circuit breaker, and every
// failure degrades to "no semantic score": the app keeps ranking by skill match exactly as before.
const base = () => (process.env.NLP_SERVICE_URL || '').replace(/\/+$/, '');
export const nlpEnabled = () => Boolean(base());

let fetchImpl = (...a) => fetch(...a);
export const __setNlpFetch = (fn) => { fetchImpl = fn || ((...a) => fetch(...a)); };

const status = { lastOkAt: null, lastError: null, calls: 0, failures: 0, cacheHits: 0 };
export const nlpStatus = () => ({ enabled: nlpEnabled(), ...status });

const cache = new Map();
const remember = (k, v) => { cache.set(k, v); if (cache.size > 200) cache.delete(cache.keys().next().value); };

/**
 * Text-relevance of one resume against many jobs.
 * @param {string} resume
 * @param {{id:number,text:string}[]} jobs
 * @param {string} version  changes whenever the job set changes (used for the cache key)
 * @returns {Promise<Map<number,{score:number,shared:string[],missing:string[]}>|null>} null when unavailable
 */
export async function semanticRank(resume, jobs, version = '') {
  if (!nlpEnabled() || !resume || !jobs.length) return null;
  const key = crypto.createHash('sha1').update(`${version}|${resume}`).digest('hex');
  const hit = cache.get(key);
  if (hit) { status.cacheHits += 1; return hit; }
  try { allow('nlp'); } catch { return null; }
  status.calls += 1;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Number(process.env.NLP_TIMEOUT_MS || 1500));
  try {
    const headers = { 'content-type': 'application/json' };
    if (process.env.NLP_SERVICE_TOKEN) headers['x-service-token'] = process.env.NLP_SERVICE_TOKEN;
    const res = await fetchImpl(`${base()}/v1/rank`, { method: 'POST', headers, signal: ctl.signal, body: JSON.stringify({ resume: resume.slice(0, 60000), jobs: jobs.slice(0, 1000).map((j) => ({ id: j.id, text: j.text.slice(0, 60000) })) }) });
    if (!res.ok) throw new Error(`nlp HTTP ${res.status}`);
    const body = await res.json();
    const out = new Map((body.results || []).map((r) => [r.id, { score: r.score, shared: r.shared || [], missing: r.missing || [] }]));
    success('nlp'); status.lastOkAt = new Date().toISOString(); status.lastError = null;
    remember(key, out);
    return out;
  } catch (e) {
    failure('nlp'); status.failures += 1; status.lastError = /abort/i.test(e.message) ? 'timeout' : String(e.message).slice(0, 120);
    return null;
  } finally { clearTimeout(timer); }
}
