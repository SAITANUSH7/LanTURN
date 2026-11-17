// Prep guide for a topic: what to do and where, in order, with links. Pure and deterministic.
import { CURATED, CHANNELS } from '../data/prepLinks.js';

const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const ytChannel = (handleUrl, q) => `${handleUrl}/search?query=${encodeURIComponent(q)}`;

export function guideFor(topic, extraResources = []) {
  const name = String(topic).trim();
  const hit = CURATED.filter(([re]) => re.test(name)).slice(0, 2);
  const docs = [...new Map(hit.flatMap(([, links]) => links).map((l) => [l.url, l])).values()];
  const channels = [...new Set(hit.flatMap(([, , ch]) => ch))].slice(0, 3).map((k) => CHANNELS[k]).filter(Boolean);
  const stageRes = extraResources.filter((r) => r?.url && !docs.some((d) => d.url === r.url)).map((r) => ({ title: r.title || r.url, url: r.url, kind: 'docs' }));
  const videos = [
    { title: `${name}: full course (English)`, url: yt(`${name} full course for beginners`), kind: 'video', source: 'YouTube search' },
    { title: `${name} in Hindi`, url: yt(`${name} tutorial in hindi`), kind: 'video', source: 'YouTube search' },
    { title: `${name} in Telugu`, url: yt(`${name} tutorial in telugu`), kind: 'video', source: 'YouTube search' },
    ...channels.map(([label, url]) => ({ title: `${name} on ${label}`, url: ytChannel(url, name), kind: 'video', source: label })),
  ];
  const learn = docs.filter((d) => d.kind === 'course');
  const read = [...docs.filter((d) => d.kind === 'docs'), ...stageRes];
  const practice = docs.filter((d) => d.kind === 'practice');
  const steps = [
    { step: 'Watch', what: `Pick one beginner video on ${name} and follow along while coding. Do not just watch.`, links: videos },
    ...(learn.length ? [{ step: 'Study', what: 'Work through one structured course, in order.', links: learn }] : []),
    ...(read.length ? [{ step: 'Read', what: 'Keep the official docs open as reference. Look things up as you build.', links: read }] : []),
    { step: 'Practice', what: practice.length ? 'Solve small exercises until the basics feel automatic.' : `Write 5 small programs or notes that use ${name} without copying.`, links: practice },
    { step: 'Prove it', what: `Add ${name} to a real project, push it to GitHub with a README, and list it on your resume.`, links: [] },
  ];
  return { topic: name, curated: docs.length > 0, steps };
}
