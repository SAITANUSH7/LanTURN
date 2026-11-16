// Task routing: one NVIDIA key, three models, each used for the work it does best.
//   code  = reasoning and technical output   (default DeepSeek)
//   write = chat and natural writing         (default Meta Llama)
//   json  = strict structured extraction     (default Nemotron)
// If a task's model fails, the other two are tried next, then the remaining providers, then the rules engine.
import { db } from '../db.js';

const env = process.env;
export const GROUPS = {
  code: { label: 'Code and reasoning', hint: 'Skill tests, grading, interview prep, job descriptions', purposes: ['arena-questions', 'arena-grade', 'interview-prep', 'job-description'], fallback: env.AI_ROUTE_CODE || 'nvidia/nemotron-3.5-super-vl-120b-a12b', params: { temperature: 0.3, top_p: 0.9, chat_template_kwargs: { thinking: false, enable_thinking: false } } },
  write: { label: 'Chat and writing', hint: 'Career Coach, hiring assistant, cover letters, Company DNA, map summary', purposes: ['chat', 'cover-letter', 'company-dna', 'career-map'], fallback: env.AI_ROUTE_WRITE || 'nvidia/nemotron-3.5-super-vl-120b-a12b', params: { temperature: 0.4, top_p: 0.9, chat_template_kwargs: { enable_thinking: false } } },
  json: { label: 'Strict JSON extraction', hint: 'Resume analysis, roadmaps, Career DNA', purposes: ['resume', 'roadmap', 'dna', 'json'], fallback: env.AI_ROUTE_JSON || 'nvidia/nemotron-3.5-super-vl-120b-a12b', params: { temperature: 0.2, top_p: 0.95, chat_template_kwargs: { enable_thinking: false } } },
};
GROUPS.vision = { label: 'Image reading (OCR)', hint: 'Resume photos, screenshots and scanned PDFs', purposes: ['ocr'], fallback: env.AI_ROUTE_VISION || 'nvidia/nemotron-3.5-super-vl-120b-a12b', params: { temperature: 0.1, top_p: 0.9, chat_template_kwargs: { enable_thinking: false } } };
const ORDER = ['json', 'code', 'write'];

db.exec('CREATE TABLE IF NOT EXISTS ai_routes (group_key TEXT PRIMARY KEY, model TEXT NOT NULL)');

export const groupOf = (purpose) => Object.keys(GROUPS).find((g) => GROUPS[g].purposes.includes(purpose)) || 'json';

export function currentRoutes() {
  const saved = Object.fromEntries(db.prepare('SELECT group_key, model FROM ai_routes').all().map((r) => [r.group_key, r.model]));
  return Object.fromEntries(Object.keys(GROUPS).map((g) => [g, saved[g] || GROUPS[g].fallback]));
}
export const saveRoute = (group, model) => db.prepare('INSERT INTO ai_routes (group_key, model) VALUES (?, ?) ON CONFLICT(group_key) DO UPDATE SET model = excluded.model').run(group, model);
export const resetRoutes = () => db.prepare('DELETE FROM ai_routes').run();

/** Reorder a provider chain for a task. Only touches NVIDIA entries; other providers keep their place after them. */
export function routeChain(chain, purpose) {
  const nv = chain.find((p) => p.name === 'nvidia');
  if (!nv) return chain;
  const routes = currentRoutes();
  // Text models cannot read images: for OCR use only the vision model, then other providers.
  if (groupOf(purpose) === 'vision') return [{ ...nv, model: routes.vision, params: GROUPS.vision.params }, ...chain.filter((p) => p.name !== 'nvidia')];
  const g = groupOf(purpose);
  const models = [routes[g], ...ORDER.filter((x) => x !== g).map((x) => routes[x])];
  // Each model keeps the sampling settings from its model card (thinking is off for JSON so the answer is not buried in reasoning).
  const groupOfModel = Object.fromEntries(ORDER.map((x) => [routes[x], x]));
  groupOfModel[routes[g]] = g; // the task's own settings win when two groups share a model
  const routed = [...new Set(models)].map((model) => ({ ...nv, model, params: GROUPS[groupOfModel[model]].params }));
  const seen = new Set(routed.map((p) => p.model));
  const extra = chain.filter((p) => p.name === 'nvidia' && !seen.has(p.model));
  return [...routed, ...chain.filter((p) => p.name !== 'nvidia'), ...extra];
}

/** Sampling settings for a model as currently routed (used by the admin Test button so it behaves like a real call). */
export function paramsForModel(model) {
  const routes = currentRoutes();
  const g = Object.keys(GROUPS).find((k) => routes[k] === model);
  return g ? GROUPS[g].params : undefined;
}
