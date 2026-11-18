import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT, config } from './config.js';
import { allow, success, failure } from './ai/breaker.js';

// Supervisor for native/build/Release/lanturn-search, the C++ full-text engine (BM25, prefix match, field weights).
// One long-lived child process, requests pipelined with ids, a timeout on every call, auto-restart after a crash, and a
// circuit breaker. If the binary is missing or unhealthy every call returns null and the caller uses SQL LIKE instead.
const BIN = path.join(ROOT, 'native', 'build', 'Release', 'lanturn-search');
const TIMEOUT = Number(process.env.SEARCH_TIMEOUT_MS || 1500);

let proc = null;
let rl = null;
let nextId = 1;
const pending = new Map(); // id -> { resolve, timer }
let loadedVersion = null;
let loading = null;
const stats = { queries: 0, reloads: 0, restarts: 0, failures: 0, docs: 0, lastLoadMs: null };
let binaryOk = null;
export const searchAvailable = () => {
  if (process.env.DISABLE_NATIVE === '1' || process.env.DISABLE_SEARCH_ENGINE === '1') return false;
  if (binaryOk === null) binaryOk = fs.existsSync(BIN);
  return binaryOk;
};
export const searchStatus = () => ({ available: searchAvailable(), running: Boolean(proc), ...stats });

function failAll(reason) {
  for (const [id, p] of pending) { clearTimeout(p.timer); p.resolve({ error: reason }); pending.delete(id); }
}

function start() {
  if (proc) return;
  proc = spawn(BIN, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  loadedVersion = null; stats.restarts += 1;
  rl = readline.createInterface({ input: proc.stdout });
  rl.on('line', (line) => {
    const m = line.match(/^#(\d+)\t(.*)$/);
    if (!m) return;
    const p = pending.get(Number(m[1]));
    if (p) { clearTimeout(p.timer); pending.delete(Number(m[1])); p.resolve({ line: m[2] }); }
  });
  const dead = (why) => { if (!proc) return; proc = null; rl?.close(); loadedVersion = null; failAll(why); };
  proc.on('exit', () => dead('exited'));
  proc.on('error', () => { binaryOk = false; dead('spawn error'); });
  proc.stdin.on('error', () => dead('stdin closed'));
  proc.unref?.(); proc.stdin.unref?.(); proc.stdout.unref?.(); // never keep the Node process alive just for the helper
}

function send(cmd) {
  return new Promise((resolve) => {
    try { start(); } catch { return resolve({ error: 'spawn failed' }); }
    if (!proc) return resolve({ error: 'not running' });
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); resolve({ error: 'timeout' }); try { proc?.kill('SIGKILL'); } catch { /* gone */ } }, TIMEOUT);
    pending.set(id, { resolve, timer });
    try { proc.stdin.write(`#${id}\t${cmd}\n`); } catch { clearTimeout(timer); pending.delete(id); resolve({ error: 'write failed' }); }
  });
}

const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ');

/** Make sure the engine holds the index for `bundle` (one reload at a time; rebuilt only when the data version moved). */
async function ensureIndex(bundle) {
  if (loadedVersion === bundle.v) return true;
  if (loading) { await loading; return loadedVersion === bundle.v; }
  loading = (async () => {
    const file = path.join(os.tmpdir(), `lanturn-search-${process.pid}.tsv`);
    const lines = bundle.rows.map((r) => [r.id, clean(r.title), clean(r.company_name), clean((bundle.skills.get(r.id) || []).map((s) => s.name).join(' ')), clean(r.description)].join('\t'));
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const out = await send(`LOAD\t${file}`);
    if (out.line?.startsWith('OK')) {
      const [, docs, , ms] = out.line.split('\t');
      loadedVersion = bundle.v; stats.reloads += 1; stats.docs = Number(docs); stats.lastLoadMs = Number(ms);
    }
  })().finally(() => { loading = null; });
  await loading;
  return loadedVersion === bundle.v;
}

/** Ranked ids for a text query over the open jobs in `bundle`, or null if the engine is unavailable. */
export async function searchJobs(bundle, query, limit = 1000) {
  if (!searchAvailable() || !query.trim()) return null;
  try { allow('search'); } catch { return null; }
  try {
    if (!(await ensureIndex(bundle))) throw new Error('index load failed');
    const out = await send(`Q\t${limit}\t${clean(query)}`);
    if (!out.line?.startsWith('R\t')) throw new Error(out.error || out.line || 'bad reply');
    const [, total, list] = out.line.split('\t');
    success('search'); stats.queries += 1;
    return { total: Number(total), hits: list ? list.split(',').map((x) => { const [id, s] = x.split(':'); return { id: Number(id), score: Number(s) }; }) : [] };
  } catch (e) {
    failure('search'); stats.failures += 1;
    return null;
  }
}

export function stopSearch() {
  try { proc?.stdin.write('QUIT\n'); } catch { /* ignore */ }
  setTimeout(() => { try { proc?.kill(); } catch { /* ignore */ } }, 300).unref();
  void config;
}
