// Task routing: one NVIDIA key, three models, each used for the work it does best.
//   code  = reasoning and technical output   (default DeepSeek)
//   write = chat and natural writing         (default Meta Llama)
//   json  = strict structured extraction     (default Nemotron)
// If a task's model fails, the other two are tried next, then the remaining providers, then the rules engine.
import { db } from '../db.js';

const env = process.env;
export const GROUPS = {
  code: { label: 'Code and reasoning', hint: 'Skill tests, grading, interview prep, job descriptions', purposes: ['arena-questions', 'arena-grade', 'interview-prep', 'job-description'], fallback: env.AI_ROUTE_CODE || 'deepseek-ai/deepseek-v3.1' },
  write: { label: 'Chat and writing', hint: 'Career Coach, hiring assistant, cover letters, Company DNA, map summary', purposes: ['chat', 'cover-letter', 'company-dna', 'career-map'], fallback: env.AI_ROUTE_WRITE || 'meta/llama-3.3-70b-instruct' },
  json: { label: 'Strict JSON extraction', hint: 'Resume analysis, roadmaps, Career DNA', purposes: ['resume', 'roadmap', 'dna', 'json'], fallback: env.AI_ROUTE_JSON || 'nvidia/nemotron-3-nano-30b-a3b' },
};
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
  const g = groupOf(purpose);
  const models = [routes[g], ...ORDER.filter((x) => x !== g).map((x) => routes[x])];
  const routed = [...new Set(models)].map((model) => ({ ...nv, model }));
  const seen = new Set(routed.map((p) => p.model));
  const extra = chain.filter((p) => p.name === 'nvidia' && !seen.has(p.model));
  return [...routed, ...chain.filter((p) => p.name !== 'nvidia'), ...extra];
}
