// Tunable constants for every deterministic score in the product.
export const SCORING = {
  resume: { sections: 15, contact: 5, length: 10, quantified: 10, rubricMax: 20 },
  match: { skill: 0.8, preference: 0.1, freshness: 0.1 },
  freshness: { fullDays: 7, zeroDays: 60 },
};

const ACTION_VERBS = new Set(
  ('built developed designed implemented led created optimized optimised deployed analyzed analysed improved reduced increased ' +
    'automated launched managed organized organised wrote delivered integrated migrated tested trained architected engineered ' +
    'collaborated mentored presented researched established configured debugged refactored scaled shipped').split(' '),
);

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function textStats(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean).length;
  const bullets = lines.filter((l) => /^[-•*▪◦●–]\s*/.test(l) || (l.length >= 40 && l.length <= 260 && /[a-z]/.test(l) && l.split(' ').length >= 7));
  return { lines, words, bullets };
}

/** Deterministic 0-40 part of the resume score plus the facts the narrative uses. */
export function deterministicResume(text) {
  const { lines, words, bullets } = textStats(text);
  const has = (re) => lines.some((l) => l.length < 60 && re.test(l));
  const sections = {
    education: has(/\beducation\b|\bacademics?\b|\bqualification/i),
    skills: has(/\bskills?\b|technologies|tech stack/i),
    projects: has(/\bprojects?\b|\bexperience\b|\binternships?\b|\bwork history\b/i),
  };
  const sectionPts = (Number(sections.education) + Number(sections.skills) + Number(sections.projects)) * 5;

  const contact = {
    email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text),
    phone: /(\+?\d[\d\s().-]{8,}\d)/.test(text),
    link: /(linkedin\.com|github\.com|gitlab\.com|portfolio|https?:\/\/)/i.test(text),
  };
  const contactPts = (contact.email ? 3 : 0) + (contact.phone ? 1 : 0) + (contact.link ? 1 : 0);

  let lengthPts = 0;
  if (words >= 300 && words <= 900) lengthPts = 10;
  else if ((words >= 200 && words < 300) || (words > 900 && words <= 1200)) lengthPts = 6;
  else if (words >= 100 && words < 200) lengthPts = 3;

  const quantBullets = bullets.filter((b) => /\d/.test(b) || /%/.test(b));
  const quantRatio = bullets.length ? quantBullets.length / bullets.length : 0;
  const quantPts = Math.round(clamp(quantRatio / 0.4, 0, 1) * 10);

  const verbBullets = bullets.filter((b) => ACTION_VERBS.has(b.replace(/^[^A-Za-z]+/, '').split(/\s+/)[0]?.toLowerCase()));
  const verbRatio = bullets.length ? verbBullets.length / bullets.length : 0;
  const avgBulletLen = bullets.length ? bullets.reduce((s, b) => s + b.length, 0) / bullets.length : 0;
  const hasSummary = has(/\b(summary|objective|profile|about)\b/i);

  return {
    score: sectionPts + contactPts + lengthPts + quantPts,
    parts: { sections: sectionPts, contact: contactPts, length: lengthPts, quantified: quantPts },
    facts: { words, sections, contact, quantRatio, verbRatio, bulletCount: bullets.length, avgBulletLen, hasSummary },
  };
}

/** Rules-based stand-in for the language-model rubric (each 0-20). Used when no LLM is configured. */
export function rubricFromRules(det, skillCount) {
  const f = det.facts;
  const secCount = Object.values(f.sections).filter(Boolean).length;
  const clarity = clamp(5 + secCount * 3 + (f.hasSummary ? 2 : 0) + (f.bulletCount >= 4 ? 3 : 0) + (f.words >= 200 ? 1 : 0), 0, 20);
  const skills = clamp((f.sections.skills ? 5 : 2) + Math.round(skillCount * 1.4), 0, 20);
  const writing = clamp(4 + Math.round(f.verbRatio * 10) + (f.avgBulletLen >= 60 && f.avgBulletLen <= 190 ? 4 : 1) + (f.quantRatio > 0.2 ? 2 : 0), 0, 20);
  return { clarity, skills, writing };
}

export function narrativeFromRules(det, skillCount) {
  const f = det.facts;
  const strengths = [];
  const improvements = [];
  if (f.sections.education && f.sections.skills && f.sections.projects) strengths.push('All key sections are present: education, skills and projects or experience.');
  if (skillCount >= 8) strengths.push(`${skillCount} recognised skills are clearly listed.`);
  if (f.quantRatio >= 0.3) strengths.push('Several bullets include numbers, which makes impact concrete.');
  if (f.contact.link) strengths.push('Profile or code links are included.');
  if (f.verbRatio >= 0.5) strengths.push('Bullets start with strong action verbs.');
  if (!strengths.length) strengths.push('The resume was readable and could be analysed.');

  const add = (priority, issue, suggestion) => improvements.push({ priority, issue, suggestion });
  if (f.quantRatio < 0.3) add(1, 'Few measurable results', 'Add numbers to project bullets: users, latency, accuracy, team size or time saved.');
  if (!f.sections.projects) add(2, 'No projects or experience section found', 'Add a Projects section with 2–3 projects, each with the stack used and what you achieved.');
  if (!f.sections.skills) add(2, 'No skills section found', 'Add a Skills section grouped by category (languages, frameworks, tools).');
  if (skillCount < 6) add(3, 'Few recognised skills', 'List the technologies you have actually used, using standard names such as “PostgreSQL” or “Jetpack Compose”.');
  if (f.verbRatio < 0.4) add(3, 'Bullets do not lead with action verbs', 'Start bullets with verbs such as built, designed, optimised or deployed.');
  if (!f.contact.link) add(4, 'No profile links', 'Add a GitHub or LinkedIn link so reviewers can see your work.');
  if (!f.contact.email || !f.contact.phone) add(4, 'Incomplete contact details', 'Include an email address and phone number at the top.');
  if (f.words < 200) add(5, 'Resume is very short', 'Aim for roughly 300–600 words: expand projects with the problem, your role and the outcome.');
  if (f.words > 900) add(5, 'Resume is long', 'Trim to one or two pages by cutting older or less relevant items.');
  if (!f.hasSummary) add(6, 'No short summary', 'Open with a two-line summary stating your target role and strongest skills.');
  improvements.sort((a, b) => a.priority - b.priority);
  return {
    strengths: strengths.slice(0, 5),
    improvements: improvements.slice(0, 7),
    summary: `Rules-based review: ${skillCount} recognised skills, ${Math.round(f.quantRatio * 100)}% of bullets quantified.`,
  };
}

/** Required = [{skill_id, name, weight}], studentIds = Set of skill ids. */
export function skillGap(required, studentIds) {
  const matched = [];
  const missing = [];
  let total = 0;
  let got = 0;
  for (const r of required) {
    total += r.weight;
    if (studentIds.has(r.skill_id)) {
      matched.push({ skillId: r.skill_id, skill: r.name, weight: r.weight });
      got += r.weight;
    } else {
      missing.push({ skillId: r.skill_id, skill: r.name, weight: r.weight, category: r.category });
    }
  }
  missing.sort((a, b) => b.weight - a.weight || a.skill.localeCompare(b.skill));
  matched.sort((a, b) => b.weight - a.weight || a.skill.localeCompare(b.skill));
  return { matchPercent: total ? Math.round((got / total) * 100) : 0, matched, missing };
}

export function preferenceMatch(job, prefs) {
  const types = prefs.types || [];
  const locs = (prefs.locations || []).map((l) => l.toLowerCase());
  if (!types.length && !locs.length) return 50;
  const typeOk = !types.length || types.includes(job.type);
  const locOk = !locs.length || job.remote || locs.includes((job.location || '').toLowerCase());
  return typeOk && locOk ? 100 : typeOk || locOk ? 50 : 0;
}

export function freshness(createdAt, now = Date.now()) {
  const t = new Date(createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T') + 'Z').getTime();
  const days = Math.max(0, (now - t) / 86400000);
  const { fullDays, zeroDays } = SCORING.freshness;
  if (days <= fullDays) return 100;
  if (days >= zeroDays) return 0;
  return Math.round(100 * (1 - (days - fullDays) / (zeroDays - fullDays)));
}

export function matchScore(skillMatch, prefMatch, fresh) {
  const w = SCORING.match;
  return Math.round(w.skill * skillMatch + w.preference * prefMatch + w.freshness * fresh);
}

// ---- Rules-based roadmap -------------------------------------------------
const CATEGORY_PLAN = {
  Languages: { actions: ['Read the official documentation tour end to end', 'Solve 15–20 small practice problems in it', 'Rewrite one small script you already have using it'], project: 'a command-line tool that solves a problem you personally have', res: ['official documentation', 'interactive tutorial', 'practice problem set'] },
  Frontend: { actions: ['Follow the official getting-started guide', 'Rebuild two pages from a site you like', 'Learn how to debug it in browser developer tools'], project: 'a responsive portfolio or dashboard page', res: ['official documentation', 'interactive tutorial', 'open-source project to read'] },
  Backend: { actions: ['Read the official guide and build the hello-world service', 'Add validation, error handling and authentication', 'Write tests for each endpoint'], project: 'a small REST API with login and a database', res: ['official documentation', 'build-along tutorial', 'open-source project to read'] },
  Mobile: { actions: ['Complete the official codelab for the basics', 'Build a two-screen app with navigation', 'Connect it to a public API and show loading and error states'], project: 'a notes or task app with a remote API', res: ['official codelab', 'official documentation', 'open-source sample app'] },
  Databases: { actions: ['Install it locally and create a schema for a real idea', 'Practise queries with joins, filters and indexes', 'Connect it to a small app'], project: 'a schema and queries for a small booking or library system', res: ['official documentation', 'interactive tutorial', 'practice dataset'] },
  'Cloud/DevOps': { actions: ['Use the free tier or a local setup to run the basics', 'Automate one repeatable task with it', 'Document your setup so someone else can repeat it'], project: 'deploy a small app end to end with automated builds', res: ['official documentation', 'hands-on lab', 'open-source project to read'] },
  'Data/ML': { actions: ['Work through an introductory notebook on a public dataset', 'Reproduce one tutorial result from scratch', 'Write up what you learned with charts or metrics'], project: 'an analysis or model on a public dataset with a short write-up', res: ['official documentation', 'practice dataset', 'interactive tutorial'] },
  Tools: { actions: ['Complete the beginner guide', 'Use it daily on a real project for a week', 'Learn the five commands or features you use most'], project: 'use it on a team project and note your workflow', res: ['official documentation', 'interactive tutorial'] },
  'CS Fundamentals': { actions: ['Study one core topic per week from a standard textbook or course', 'Implement each concept in code', 'Practise explaining it aloud'], project: 'implement the core structures or concepts yourself', res: ['textbook chapter', 'university course notes', 'practice problem set'] },
  'Soft Skills': { actions: ['Pick one situation each week to practise it deliberately', 'Ask a mentor or peer for specific feedback', 'Record examples you can use in interviews'], project: 'lead a small team task and write a short retrospective', res: ['peer feedback', 'workshop or club activity'] },
};

export function roadmapFromRules(targetTitle, gap) {
  const steps = gap.missing.slice(0, 8).map((m, i) => {
    const plan = CATEGORY_PLAN[m.category] || CATEGORY_PLAN.Tools;
    const weeks = m.weight + (['Cloud/DevOps', 'Data/ML'].includes(m.category) ? 1 : 0);
    const importance = m.weight === 3 ? 'a core requirement' : m.weight === 2 ? 'an important requirement' : 'a useful extra';
    return {
      order: i + 1,
      skill: m.skill,
      why: `${m.skill} is ${importance} for ${targetTitle}.`,
      actions: plan.actions,
      projectIdea: `Build ${plan.project} using ${m.skill}.`,
      resourceTypes: plan.res,
      weeks,
    };
  });
  return {
    headline: steps.length ? `${steps.length} step${steps.length > 1 ? 's' : ''} to close your gap for ${targetTitle}` : `You already cover every listed skill for ${targetTitle}`,
    totalWeeks: steps.reduce((s, x) => s + x.weeks, 0),
    steps,
  };
}
