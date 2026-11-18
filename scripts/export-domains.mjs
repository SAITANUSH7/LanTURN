// Export the Career AIsle domains as the training corpus for the Python domain classifier.
//   node scripts/export-domains.mjs   ->  services/nlp/data/domains.json
import fs from 'node:fs';
import { CAREER_DOMAINS } from '../src/data/careerRoadmaps.js';

const out = CAREER_DOMAINS.map((d) => ({
  id: d.id, title: d.title, category: d.category, description: d.description,
  topics: d.stages.flatMap((s) => s.topics),
  stages: d.stages.map((s) => ({ title: s.title, description: s.description })),
  projects: d.stages.map((s) => s.project).filter(Boolean).map((p) => `${p.title}. ${p.description || ''}`),
}));
fs.writeFileSync(new URL('../services/nlp/data/domains.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(`exported ${out.length} domains, ${out.reduce((a, d) => a + d.topics.length, 0)} topics`);
