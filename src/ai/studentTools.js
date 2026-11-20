// Student tools: structured resume builder with a deterministic ATS-style check and printable/plain-text exports.
import { z } from 'zod';
import { extractSkills } from './skills.js';
import { deterministicResume } from './scoring.js';

const str = (n) => z.string().trim().max(n).default('');
const bullets = z.array(z.string().trim().min(1).max(300)).max(8).default([]);
export const ResumeDraft = z.object({
  name: str(80), email: str(120), phone: str(30), links: z.array(z.string().trim().max(200)).max(5).default([]), summary: str(600),
  education: z.array(z.object({ school: str(120), degree: str(120), years: str(30), detail: str(200) })).max(5).default([]),
  experience: z.array(z.object({ role: str(100), org: str(100), years: str(30), bullets })).max(8).default([]),
  projects: z.array(z.object({ name: str(100), tech: str(150), bullets })).max(8).default([]),
  skills: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
}).strict();

/** Plain, single-column text with standard section names: what applicant tracking systems parse best. */
export function toText(d) {
  const out = [d.name, [d.email, d.phone, ...d.links].filter(Boolean).join(' | ')].filter(Boolean);
  const sec = (title, lines) => { if (lines.length) out.push('', title, ...lines); };
  sec('SUMMARY', d.summary ? [d.summary] : []);
  sec('EDUCATION', d.education.flatMap((e) => [[e.school, e.degree, e.years].filter(Boolean).join(', '), ...(e.detail ? [e.detail] : [])]));
  sec('SKILLS', d.skills.length ? [d.skills.join(', ')] : []);
  sec('PROJECTS', d.projects.flatMap((p) => [[p.name, p.tech].filter(Boolean).join(' | '), ...p.bullets.map((b) => `- ${b}`)]));
  sec('EXPERIENCE', d.experience.flatMap((x) => [[x.role, x.org, x.years].filter(Boolean).join(', '), ...x.bullets.map((b) => `- ${b}`)]));
  return out.join('\n');
}

const VERBS = /^(built|developed|designed|implemented|led|created|optimi[sz]ed|deployed|analy[sz]ed|improved|reduced|increased|automated|launched|managed|organi[sz]ed|wrote|delivered|integrated|migrated|tested|trained|architected|engineered|collaborated|mentored|presented|researched|established|configured|debugged|refactored|scaled|shipped|resolved|streamlined|coordinated|authored|achieved)\b/i;

export function atsCheck(d, jobText = '') {
  const text = toText(d);
  const det = deterministicResume(text);
  const f = det.facts;
  const allBullets = [...d.experience, ...d.projects].flatMap((x) => x.bullets);
  const verbRatio = allBullets.length ? allBullets.filter((b) => VERBS.test(b)).length / allBullets.length : 0;
  const quantRatio = allBullets.length ? allBullets.filter((b) => /\d|%/.test(b)).length / allBullets.length : 0;
  const long = allBullets.filter((b) => b.length > 220).length;
  const checks = [];
  const add = (id, weight, pass, label, tip, partial = null) => checks.push({ id, weight, status: pass ? 'pass' : partial ? 'warn' : 'fail', label, tip: pass ? '' : tip, earned: pass ? weight : partial ? Math.round(weight / 2) : 0 });
  add('email', 8, f.contact.email, 'Email address', 'Add an email address recruiters can reach.');
  add('phone', 4, f.contact.phone, 'Phone number', 'Add a phone number.');
  add('links', 5, f.contact.link, 'GitHub or LinkedIn link', 'Add your GitHub or LinkedIn so reviewers can see your work.');
  add('education', 8, f.sections.education, 'Education section', 'Add your education with degree and years.');
  add('skills', 8, d.skills.length >= 5, 'Skills section with 5+ skills', 'List at least 5 relevant skills, comma separated.', d.skills.length > 0);
  add('experience', 12, d.projects.length + d.experience.length >= 2, 'Two or more projects or roles', 'Add at least two projects or internships.', d.projects.length + d.experience.length === 1);
  add('summary', 5, Boolean(d.summary), 'Short summary', 'Add a 2-line summary of who you are and what you want.');
  add('verbs', 12, verbRatio >= 0.7, 'Bullets start with action verbs', 'Start bullets with verbs like Built, Reduced, Led.', verbRatio >= 0.4);
  add('numbers', 12, quantRatio >= 0.35, 'Bullets show numbers or results', 'Add numbers: users, percent faster, size of data, time saved.', quantRatio > 0);
  add('length', 8, f.words >= 250 && f.words <= 900, 'Length 250-900 words', f.words < 250 ? 'Too short: add detail to projects and experience.' : 'Too long: trim to one page.', f.words >= 150 && f.words <= 1100);
  add('bullets', 6, long === 0, 'Bullets are concise', 'Shorten bullets longer than about two lines.', long <= 1);
  let missingKeywords = [];
  let coveredKeywords = [];
  if (jobText.trim()) {
    const want = extractSkills(jobText);
    const have = new Set(extractSkills(text).map((s) => s.id));
    missingKeywords = want.filter((s) => !have.has(s.id)).map((s) => s.name);
    coveredKeywords = want.filter((s) => have.has(s.id)).map((s) => s.name);
    const ratio = want.length ? coveredKeywords.length / want.length : 1;
    add('keywords', 12, ratio >= 0.7, 'Covers the job\'s keywords', `Missing from your resume: ${missingKeywords.slice(0, 6).join(', ')}. Add them only where they are true.`, ratio >= 0.4);
  }
  const max = checks.reduce((s, c) => s + c.weight, 0);
  const score = Math.round((checks.reduce((s, c) => s + c.earned, 0) / max) * 100);
  return { score, words: f.words, checks, missingKeywords, coveredKeywords, jobChecked: Boolean(jobText.trim()) };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** One-column printable page. Use the browser's Save as PDF; no tables or images so it also parses cleanly. */
export function toHtml(d) {
  const sec = (t, inner) => (inner ? `<h2>${t}</h2>${inner}` : '');
  const ul = (b) => (b.length ? `<ul>${b.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(d.name || 'Resume')}</title><style>
@page{margin:16mm}body{font:11pt/1.4 Arial,Helvetica,sans-serif;color:#111;max-width:780px;margin:24px auto;padding:0 16px}h1{font-size:20pt;margin:0}h2{font-size:11pt;letter-spacing:.08em;border-bottom:1px solid #999;margin:16px 0 6px;padding-bottom:2px}.c{color:#444;margin:2px 0 8px}.r{display:flex;justify-content:space-between;gap:12px;font-weight:bold}.r span+span{font-weight:normal;color:#444}ul{margin:4px 0 8px 18px;padding:0}li{margin:2px 0}</style></head><body>
<h1>${esc(d.name)}</h1><p class="c">${[d.email, d.phone, ...d.links].filter(Boolean).map(esc).join(' &middot; ')}</p>
${sec('SUMMARY', d.summary ? `<p>${esc(d.summary)}</p>` : '')}
${sec('EDUCATION', d.education.map((e) => `<div class="r"><span>${esc(e.school)}${e.degree ? `, ${esc(e.degree)}` : ''}</span><span>${esc(e.years)}</span></div>${e.detail ? `<p>${esc(e.detail)}</p>` : ''}`).join(''))}
${sec('SKILLS', d.skills.length ? `<p>${d.skills.map(esc).join(', ')}</p>` : '')}
${sec('PROJECTS', d.projects.map((p) => `<div class="r"><span>${esc(p.name)}</span><span>${esc(p.tech)}</span></div>${ul(p.bullets)}`).join(''))}
${sec('EXPERIENCE', d.experience.map((x) => `<div class="r"><span>${esc(x.role)}${x.org ? `, ${esc(x.org)}` : ''}</span><span>${esc(x.years)}</span></div>${ul(x.bullets)}`).join(''))}
</body></html>`;
}

