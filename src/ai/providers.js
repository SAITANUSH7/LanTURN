// Provider-agnostic LLM layer. Almost every vendor speaks the OpenAI "chat/completions" dialect, so one
// adapter + a table of presets covers them; Anthropic gets its own small adapter. Every base URL and model
// is overridable from the environment because vendors rename models often.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db.js';

const env = process.env;

export const PRESETS = {
  deepseek:   { label: 'DeepSeek',            baseUrl: 'https://api.deepseek.com',                              keyEnv: 'DEEPSEEK_API_KEY',   model: 'deepseek-flash',                  jsonMode: false },
  kimi:       { label: 'Kimi (Moonshot AI)',  baseUrl: 'https://api.moonshot.ai/v1',                            keyEnv: 'MOONSHOT_API_KEY',   model: 'kimi-k2-turbo-preview',           jsonMode: true },
  nvidia:     { label: 'NVIDIA NIM',          baseUrl: 'https://integrate.api.nvidia.com/v1',                   keyEnv: 'NVIDIA_API_KEY',     model: 'meta/llama-3.3-70b-instruct',     jsonMode: false },
  opencode:   { label: 'OpenCode Zen',        baseUrl: 'https://opencode.ai/zen/v1',                            keyEnv: 'OPENCODE_API_KEY',   model: 'deepseek-v4-flash-free',          jsonMode: false },
  gemini:     { label: 'Google Gemini',       baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyEnv: 'GEMINI_API_KEY',   model: 'gemini-2.5-flash',                jsonMode: true },
  groq:       { label: 'Groq',                baseUrl: 'https://api.groq.com/openai/v1',                        keyEnv: 'GROQ_API_KEY',       model: 'llama-3.3-70b-versatile',         jsonMode: true },
  openrouter: { label: 'OpenRouter',          baseUrl: 'https://openrouter.ai/api/v1',                          keyEnv: 'OPENROUTER_API_KEY', model: 'openrouter/auto',                 jsonMode: false },
  openai:     { label: 'OpenAI',              baseUrl: 'https://api.openai.com/v1',                             keyEnv: 'OPENAI_API_KEY',     model: 'gpt-4o-mini',                     jsonMode: true },
  anthropic:  { label: 'Anthropic',           baseUrl: 'https://api.anthropic.com/v1',                          keyEnv: 'ANTHROPIC_API_KEY',  model: 'claude-haiku-4-5',                kind: 'anthropic' },
  custom:     { label: 'Custom (OpenAI-compatible)', baseUrl: '',                                               keyEnv: 'LLM_API_KEY',        model: '',                                 jsonMode: false },
};

const up = (n) => n.toUpperCase();

// ---- Keys saved from the admin screen. Encrypted at rest (AES-256-GCM) with a key derived from the server secret.
const vaultKey = () => crypto.createHash('sha256').update(`lanturn-ai-vault:${config.refreshSecret}`).digest();
export function sealKey(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function openKey(sealed) {
  if (!sealed) return '';
  try {
    const [iv, tag, enc] = sealed.split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', vaultKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return ''; } // secret rotated or row corrupted: treat as not set
}
const saved = (name) => {
  try { return db.prepare('SELECT * FROM ai_settings WHERE provider = ?').get(name) || null; } catch { return null; }
};

/** Resolve one provider from admin-saved settings (win) or environment. Returns null if unusable. */
export function resolveProvider(name, { ignoreDisabled = false } = {}) {
  const p = PRESETS[name];
  if (!p) return null;
  const row = saved(name);
  if (row && !row.enabled && !ignoreDisabled) return null;
  const key = openKey(row?.api_key_enc) || env[p.keyEnv] || '';
  const baseUrl = (row?.base_url || env[`${up(name)}_BASE_URL`] || (name === 'custom' ? env.LLM_BASE_URL : p.baseUrl) || '').replace(/\/+$/, '');
  let model = row?.model || env[`${up(name)}_MODEL`] || '';
  if (!model && name === 'anthropic') model = env.LLM_MODEL || p.model;
  if (!model && name === 'custom') model = env.LLM_MODEL || '';
  if (!model) model = p.model;
  if (!baseUrl || !model || (!key && name !== 'custom')) return null;
  if (name === 'custom' && !key && !row?.base_url && !env.LLM_BASE_URL) return null;
  return { name, label: p.label, kind: p.kind || 'openai', baseUrl, key, model, jsonMode: env[`${up(name)}_JSON_MODE`] ? env[`${up(name)}_JSON_MODE`] === 'true' : Boolean(p.jsonMode), origin: row && openKey(row.api_key_enc) ? 'admin' : 'env' };
}

/** Providers that are configured right now, in priority order. Read lazily so tests can change env. */
export function activeProviders() {
  const wanted = config.aiProvider === 'auto' ? config.aiPriority : [config.aiProvider];
  const out = [];
  for (const name of wanted) {
    const r = resolveProvider(name);
    if (!r) continue;
    // A comma-separated model list becomes a fallback chain on the same provider (first model is tried first).
    for (const m of r.model.split(',').map((x) => x.trim()).filter(Boolean)) out.push({ ...r, model: m });
  }
  return out;
}

export const llmEnabled = () => activeProviders().length > 0;
export const providerSummary = () => activeProviders().map((p) => ({ name: p.name, label: p.label, model: p.model }));

let fetchImpl = (...a) => fetch(...a);
/** Test seam: replace the network call. */
export const __setFetch = (fn) => { fetchImpl = fn || ((...a) => fetch(...a)); };

async function post(url, headers, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), config.aiTimeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Call log: printed to the terminal and kept (last 100) for the admin screen. Never contains keys or prompts.
const LOG = [];
export const recentCalls = () => LOG.slice().reverse();
function record(p, purpose, ok, ms, note) {
  const e = { at: new Date().toISOString(), provider: p.name, model: p.model, purpose, ok, ms, note: note || '' };
  LOG.push(e);
  if (LOG.length > 100) LOG.shift();
  if (!config.isTest) console.log(`[ai] ${ok ? 'OK  ' : 'FAIL'} ${p.name} ${p.model} ${purpose} ${(ms / 1000).toFixed(1)}s${note ? ` - ${note}` : ''}`);
}
const tidy = (t) => String(t || '').replace(/\s+/g, ' ').replace(/(nvapi|sk|gsk|AIza)[-\w]{10,}/g, '[key]').slice(0, 160);
async function httpError(p, res) {
  let body = '';
  try { body = tidy(await res.text()); } catch { /* ignore */ }
  return new Error(`${p.name} HTTP ${res.status}${body ? `: ${body}` : ''}`);
}
/** chatOnce with timing + logging. `purpose` is a short label such as "chat" or "dna". */
async function chatLogged(p, args, purpose) {
  const t0 = Date.now();
  try {
    const out = await chatOnce(p, args);
    record(p, purpose, true, Date.now() - t0);
    return out;
  } catch (e) {
    record(p, purpose, false, Date.now() - t0, tidy(/abort/i.test(e.message) ? `timed out after ${config.aiTimeoutMs / 1000}s` : e.message));
    throw e;
  }
}

async function chatOnce(p, { system, messages, maxTokens, json }) {
  if (p.kind === 'anthropic') {
    const res = await post(`${p.baseUrl}/messages`, { 'x-api-key': p.key, 'anthropic-version': '2023-06-01' },
      { model: p.model, max_tokens: maxTokens, temperature: 0.3, system, messages });
    if (!res.ok) throw await httpError(p, res);
    const b = await res.json();
    return (b.content || []).map((c) => c.text || '').join('');
  }
  const body = { model: p.model, max_tokens: maxTokens, temperature: 0.3, messages: [{ role: 'system', content: system }, ...messages] };
  const headers = p.key ? { authorization: `Bearer ${p.key}` } : {};
  if (json && p.jsonMode) body.response_format = { type: 'json_object' };
  let res = await post(`${p.baseUrl}/chat/completions`, headers, body);
  if (res.status === 400 && body.response_format) {
    // Some models reject JSON mode; retry as plain text and rely on our own extraction + validation.
    delete body.response_format;
    res = await post(`${p.baseUrl}/chat/completions`, headers, body);
  }
  if (!res.ok) throw await httpError(p, res);
  const b = await res.json();
  return b.choices?.[0]?.message?.content || '';
}

/** Pull a JSON object out of model text: strips code fences, <think> blocks and surrounding prose. */
export function extractJson(text) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{');
  const z = t.lastIndexOf('}');
  if (a >= 0 && z > a) return JSON.parse(t.slice(a, z + 1));
  throw new Error('not valid JSON');
}

/** Plain-text completion with provider fallback. Throws if every provider fails. */
export async function chatText({ system, messages, maxTokens = 600 }) {
  const chain = activeProviders();
  if (!chain.length) throw new Error('No AI provider configured');
  let last;
  for (const p of chain) {
    try {
      const out = (await chatLogged(p, { system, messages, maxTokens, json: false }, 'chat')).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (out) return { text: out, provider: p.name, model: p.model };
    } catch (e) { last = e; }
  }
  throw last || new Error('AI unavailable');
}

/** Validated JSON completion: per provider one retry with the validation error, then the next provider. */
export async function callJson(system, user, schema, maxTokens = 1500, purpose = 'json') {
  const chain = activeProviders();
  if (!chain.length) throw new Error('No AI provider configured');
  let last;
  for (const p of chain) {
    let lastErr = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const content = attempt ? `${user}\n\nYour previous reply failed validation: ${lastErr}. Return corrected JSON only.` : user;
        const text = await chatLogged(p, { system, messages: [{ role: 'user', content }], maxTokens, json: true }, purpose);
        const parsed = schema.safeParse(extractJson(text));
        if (parsed.success) { Object.defineProperty(parsed.data, '__provider', { value: p.name, enumerable: false }); return parsed.data; }
        record(p, purpose, false, 0, 'reply did not match the expected JSON shape');
        lastErr = parsed.error.issues[0] ? `${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}` : 'schema mismatch';
      } catch (e) {
        lastErr = e.message;
        if (/HTTP (401|403|404|429|5\d\d)|abort|fetch failed/i.test(e.message)) break; // retrying the same provider will not help
      }
    }
    last = new Error(`${p.name}: ${lastErr}`);
  }
  throw last;
}

/** One tiny request to check a key and model from the admin screen. Never throws; reports the outcome. */
export async function testProvider(name) {
  const r = resolveProvider(name, { ignoreDisabled: true });
  if (!r) return { ok: false, error: 'Add an API key first' };
  const model = r.model.split(',')[0].trim();
  const t0 = Date.now();
  try {
    const text = await chatLogged({ ...r, model }, { system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'ping' }], maxTokens: 20, json: false }, 'test');
    return { ok: true, ms: Date.now() - t0, model, reply: String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim().slice(0, 40) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, model, error: /HTTP 401|HTTP 403/.test(e.message) ? `The provider rejected the key (401/403). ${e.message.split(': ').slice(1).join(': ')}` : /HTTP 404/.test(e.message) ? `Model or URL not found (404). Check the model name. ${e.message.split(': ').slice(1).join(': ')}` : /abort/i.test(e.message) ? `Timed out after ${config.aiTimeoutMs / 1000}s` : /fetch failed/i.test(e.message) ? 'Could not reach the provider. Check internet, firewall or VPN.' : tidy(e.message) };
  }
}
