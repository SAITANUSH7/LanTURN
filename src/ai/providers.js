// Provider-agnostic LLM layer. Almost every vendor speaks the OpenAI "chat/completions" dialect, so one
// adapter + a table of presets covers them; Anthropic gets its own small adapter. Every base URL and model
// is overridable from the environment because vendors rename models often.
import { config } from '../config.js';

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

/** Providers that are configured right now, in priority order. Read lazily so tests can change env. */
export function activeProviders() {
  const wanted = config.aiProvider === 'auto' ? config.aiPriority : [config.aiProvider];
  const out = [];
  for (const name of wanted) {
    const p = PRESETS[name];
    if (!p) continue;
    const key = env[p.keyEnv] || '';
    const baseUrl = (env[`${up(name)}_BASE_URL`] || (name === 'custom' ? env.LLM_BASE_URL : p.baseUrl) || '').replace(/\/+$/, '');
    let model = env[`${up(name)}_MODEL`] || '';
    if (!model && name === 'anthropic') model = env.LLM_MODEL || p.model;
    if (!model && name === 'custom') model = env.LLM_MODEL || '';
    if (!model) model = p.model;
    // Local OpenAI-compatible servers (Ollama, LM Studio) need no key, so a custom base URL alone is enough.
    if (!baseUrl || !model || (!key && name !== 'custom')) continue;
    if (name === 'custom' && !key && !env.LLM_BASE_URL) continue;
    out.push({ name, label: p.label, kind: p.kind || 'openai', baseUrl, key, model, jsonMode: env[`${up(name)}_JSON_MODE`] ? env[`${up(name)}_JSON_MODE`] === 'true' : Boolean(p.jsonMode) });
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

async function chatOnce(p, { system, messages, maxTokens, json }) {
  if (p.kind === 'anthropic') {
    const res = await post(`${p.baseUrl}/messages`, { 'x-api-key': p.key, 'anthropic-version': '2023-06-01' },
      { model: p.model, max_tokens: maxTokens, temperature: 0.3, system, messages });
    if (!res.ok) throw new Error(`${p.name} HTTP ${res.status}`);
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
  if (!res.ok) throw new Error(`${p.name} HTTP ${res.status}`);
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
      const out = (await chatOnce(p, { system, messages, maxTokens, json: false })).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (out) return { text: out, provider: p.name, model: p.model };
    } catch (e) { last = e; }
  }
  throw last || new Error('AI unavailable');
}

/** Validated JSON completion: per provider one retry with the validation error, then the next provider. */
export async function callJson(system, user, schema, maxTokens = 1500) {
  const chain = activeProviders();
  if (!chain.length) throw new Error('No AI provider configured');
  let last;
  for (const p of chain) {
    let lastErr = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const content = attempt ? `${user}\n\nYour previous reply failed validation: ${lastErr}. Return corrected JSON only.` : user;
        const text = await chatOnce(p, { system, messages: [{ role: 'user', content }], maxTokens, json: true });
        const parsed = schema.safeParse(extractJson(text));
        if (parsed.success) { Object.defineProperty(parsed.data, '__provider', { value: p.name, enumerable: false }); return parsed.data; }
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
