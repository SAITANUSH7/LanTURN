// Career Map engine: resume evidence -> graph of directions (domains), your progress inside each, and the next steps.
// Pure functions, no I/O, no AI: deterministic and explainable. The AI layer only adds a narrative on top (see routes/careerMap.js).

const STOP = new Set(['and', 'the', 'for', 'with', 'using', 'into', 'from', 'your', 'basics', 'basic', 'introduction', 'intro', 'fundamentals', 'fundamental', 'concepts', 'concept', 'advanced', 'modern', 'overview', 'principles', 'patterns', 'best', 'practices', 'building', 'build', 'working', 'systems', 'system', 'design', 'development', 'management', 'core', 'essentials', 'applied', 'real', 'world', 'tools', 'tooling', 'techniques', 'strategies']);
const KEEP_SHORT = new Set(['ui', 'ux', 'ci', 'cd', 'ml', 'ai', 'qa', 'db', 'c#', 'c++', 'go', 'js', 'ts', 'os', 'ar', 'vr', 'css', 'sql', 'api', 'git', 'aws', 'gcp', 'xss', 'jwt', 'seo', 'rag', 'llm', 'nlp', 'cnn', 'rnn', 'gan', 'etl']);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

const tokCache = new Map();
export const tokens = (text) => {
  const hit = tokCache.get(text);
  if (hit) return hit;
  const out = tokensRaw(text);
  if (tokCache.size < 5000) tokCache.set(text, out);
  return out;
};
const tokensRaw = (text) => {
  const raw = String(text).toLowerCase().match(/[a-z0-9+#.]+/g) || [];
  const clean = raw.map((t) => t.replace(/^\.+|\.+$/g, '')).filter(Boolean);
  const sig = [...new Set(clean.filter((t) => !STOP.has(t) && (t.length >= 3 || KEEP_SHORT.has(t))))];
  return sig.length ? sig : [...new Set(clean)];
};

const wordRe = (t) => new RegExp(`(?<![a-z0-9+#])${esc(t)}(?:s|es)?(?![a-z0-9+#])`, 'i');
const reCache = new Map();
const hasWord = (text, t) => { let r = reCache.get(t); if (!r) { r = wordRe(t); reCache.set(t, r); } return r.test(text); };

/** A topic counts as covered when at least half of its distinctive words appear in the resume (whole-word match). */
export function topicCovered(topic, textLower, skillNamesLower = []) {
  const low = topic.toLowerCase();
  if (skillNamesLower.some((s) => s.length >= 3 && hasWord(low, s) && hasWord(textLower, s))) return true;
  const t = tokens(topic);
  if (!t.length) return false;
  const hits = t.filter((x) => hasWord(textLower, x)).length;
  return hits >= 1 && hits / t.length >= 0.5;
}

const JOB_TERMS = {
  frontend: ['frontend', 'front-end', 'front end', 'react', 'ui developer'], backend: ['backend', 'back-end', 'back end', 'node', 'api developer'],
  fullstack: ['full-stack', 'full stack', 'fullstack'], android: ['android', 'kotlin'], ios: ['ios', 'swift'], flutter: ['flutter', 'dart'], reactnative: ['react native'],
  aiml: ['machine learning', 'ml engineer', 'ai engineer', 'deep learning'], datasci: ['data scientist', 'data science'], dataanalytics: ['data analyst', 'analytics', 'bi '],
  dataeng: ['data engineer', 'etl'], prompteng: ['prompt', 'llm'], devops: ['devops', 'sre', 'cloud engineer', 'platform engineer'], cybersec: ['security', 'pentest'],
  cloudsec: ['cloud security'], uiux: ['ui/ux', 'ux', 'designer', 'product design'], product: ['product manager', 'product management'], qa: ['qa', 'test engineer', 'sdet', 'quality'],
  mobileqa: ['mobile qa', 'mobile test'], gamedev: ['game'], embedded: ['embedded', 'firmware'], blockchain: ['blockchain', 'web3', 'solidity'], arvr: ['ar/vr', 'unity', 'xr'],
  microservices: ['microservice'], sysarch: ['architect'], compilers: ['compiler'], engmgmt: ['engineering manager'], finance: ['finance', 'financial analyst'],
};

/**
 * @param {object} i
 * @param {string} i.name       student's name
 * @param {string} i.text       resume text ('' when none)
 * @param {{id:number,name:string,category:string}[]} i.skills  skills from profile + detected in resume
 * @param {object[]} i.domains  CAREER_DOMAINS
 * @param {{title:string,description?:string}[]} i.jobs  OPEN jobs
 * @param {Map<string,Set<string>>} [i.manual]  domainId -> completed topic keys the student ticked manually
 * @param {string} [i.focus]   domain id to expand
 */
export function buildCareerMap({ name, text, skills, domains, jobs = [], manual = new Map(), focus }) {
  const lower = String(text || '').toLowerCase();
  const skillNames = skills.map((s) => s.name.toLowerCase());
  const haveAny = skills.length > 0 || lower.length > 0;

  const scored = domains.map((d) => {
    const done = new Set(manual.get(d.id) || []);
    let matched = 0, total = 0;
    const stages = d.stages.map((st, si) => {
      const topics = st.topics.map((t, ti) => {
        const key = `${si}-${ti}`;
        const auto = haveAny && topicCovered(t, lower, skillNames);
        const covered = auto || done.has(key);
        total++; if (covered) matched++;
        return { key, title: t, covered, source: done.has(key) ? 'manual' : auto ? 'resume' : null };
      });
      const m = topics.filter((x) => x.covered).length;
      return { index: si, title: st.title, description: st.description, durationWeeks: st.durationWeeks, pct: topics.length ? Math.round((m / topics.length) * 100) : 0, topics, resources: st.resources || [], project: st.project || null };
    });
    // Stage status: the first stage that is not mostly done is the current one; later ones are upcoming.
    let cur = stages.findIndex((s) => s.pct < 70);
    if (cur < 0) cur = stages.length - 1;
    stages.forEach((s, i) => { s.status = s.pct >= 70 && i < cur ? 'done' : i === cur ? (s.pct >= 70 ? 'done' : 'current') : s.pct >= 70 ? 'done' : 'upcoming'; });
    const coverage = total ? matched / total : 0;
    const titleHits = tokens(d.title).filter((t) => hasWord(lower, t)).length;
    const skillOverlap = skills.length ? Math.min(1, skills.filter((s) => d.stages.some((st) => st.topics.some((t) => hasWord(t.toLowerCase(), s.name.toLowerCase())))).length / Math.max(3, skills.length)) : 0;
    const fit = Math.min(100, Math.round(100 * (0.7 * coverage + 0.2 * skillOverlap + 0.1 * Math.min(1, titleHits / 2))));
    const terms = JOB_TERMS[d.id] || tokens(d.title).slice(0, 2);
    const openJobs = jobs.filter((j) => { const h = `${j.title} ${j.description || ''}`.toLowerCase(); return terms.some((t) => h.includes(t)); }).length;
    return { id: d.id, title: d.title, category: d.category, icon: d.icon, estimatedMonths: d.estimatedMonths, fit, matched, total, coverage: Math.round(coverage * 100), openJobs, stages };
  }).sort((a, b) => b.fit - a.fit || b.matched - a.matched);

  const top = scored.slice(0, 6);
  const focusDomain = scored.find((d) => d.id === focus) || top[0];
  if (focusDomain && !top.includes(focusDomain)) top[top.length - 1] = focusDomain;

  // ---- graph ----
  const nodes = [];
  const edges = [];
  const add = (n) => { nodes.push(n); return n.id; };
  add({ id: 'you', layer: 0, type: 'you', label: name || 'You', sub: haveAny ? `${skills.length} skills found` : 'Upload a resume to begin', status: haveAny ? 'done' : 'current' });

  const byCat = new Map();
  for (const s of skills) byCat.set(s.category, [...(byCat.get(s.category) || []), s.name]);
  const clusters = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  for (const [cat, names] of clusters) {
    add({ id: `cat:${cat}`, layer: 1, type: 'cluster', label: cat, sub: names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : ''), count: names.length, status: 'done' });
    edges.push({ from: 'you', to: `cat:${cat}`, kind: 'has' });
  }
  for (const d of top) {
    add({ id: `dom:${d.id}`, layer: 2, type: 'domain', label: d.title, sub: `${d.fit}% fit · ${d.openJobs} open job${d.openJobs === 1 ? '' : 's'}`, fit: d.fit, domainId: d.id, focus: d.id === focusDomain?.id, status: d.id === focusDomain?.id ? 'current' : 'upcoming' });
    const linked = clusters.filter(([, names]) => d.stages.some((st) => st.topics.some((t) => names.some((n) => hasWord(t.title.toLowerCase(), n.toLowerCase())))));
    if (linked.length) for (const [cat] of linked) edges.push({ from: `cat:${cat}`, to: `dom:${d.id}`, kind: 'leads' });
    else edges.push({ from: 'you', to: `dom:${d.id}`, kind: 'explore' });
  }

  let nextActions = [];
  if (focusDomain) {
    const f = focusDomain;
    f.stages.forEach((s) => {
      add({ id: `st:${s.index}`, layer: 3, type: 'stage', label: s.title, sub: `${s.pct}% · ${s.durationWeeks || '?'} wks`, status: s.status, pct: s.pct, order: s.index });
      edges.push({ from: s.index === 0 ? `dom:${f.id}` : `st:${s.index - 1}`, to: `st:${s.index}`, kind: 'path' });
    });
    const cur = f.stages.find((s) => s.status === 'current') || f.stages.find((s) => s.pct < 100) || f.stages.at(-1);
    const missing = cur.topics.filter((t) => !t.covered);
    missing.slice(0, 3).forEach((t, i) => {
      add({ id: `gap:${i}`, layer: 4, type: 'gap', label: t.title, sub: `Learn in "${cur.title}"`, status: 'gap', order: i });
      edges.push({ from: `st:${cur.index}`, to: `gap:${i}`, kind: 'todo' });
    });
    if (cur.project) {
      add({ id: 'proj', layer: 4, type: 'project', label: cur.project.title, sub: 'Build this to prove it', status: 'upcoming', order: 3 });
      edges.push({ from: `st:${cur.index}`, to: 'proj', kind: 'todo' });
    }
    add({ id: 'goal', layer: 5, type: 'goal', label: f.openJobs ? `${f.openJobs} open job${f.openJobs === 1 ? '' : 's'} match` : 'Apply to roles', sub: f.title, status: 'upcoming', link: '#/jobs' });
    edges.push({ from: `st:${f.stages.length - 1}`, to: 'goal', kind: 'path' });
    nextActions = [
      ...missing.slice(0, 4).map((t) => ({ kind: 'learn', title: t.title, stage: cur.title, resources: cur.resources.slice(0, 2) })),
      ...(cur.project ? [{ kind: 'build', title: cur.project.title, stage: cur.title, description: cur.project.description || '' }] : []),
    ];
  }

  const slim = ({ stages, ...rest }) => rest;
  return {
    graph: { nodes, edges, layers: ['You', 'Strengths', 'Directions', 'Path', 'Next steps', 'Goal'] },
    domains: scored.slice(0, 12).map(slim),
    focus: focusDomain ? { ...slim(focusDomain), stages: focusDomain.stages.map(({ topics, ...s }) => ({ ...s, topicsDone: topics.filter((t) => t.covered).length, topicsTotal: topics.length })) } : null,
    nextActions,
    evidence: { skills: skills.map((s) => s.name), hasResume: lower.length > 0 },
    needsInput: !haveAny,
  };
}
