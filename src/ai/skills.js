import { db } from '../db.js';

// Aliases that are also ordinary English words or single letters. They only count when
// the line looks like a skills list (several separators), which avoids "go to market" -> Go.
const AMBIGUOUS = new Set(['c', 'go', 'rest', 'node', 'compose', 'spring', 'express', 'excel', 'torch', 'spring', 'mongo', 'ml', 'dl', 'os concepts']);

let cache = null;

export function resetSkillCache() {
  cache = null;
}

function load() {
  if (cache) return cache;
  const rows = db.prepare(`SELECT a.alias, s.id, s.name FROM skill_aliases a JOIN skills s ON s.id = a.skill_id`).all();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  cache = rows
    .map((r) => ({
      alias: r.alias,
      id: r.id,
      name: r.name,
      ambiguous: AMBIGUOUS.has(r.alias),
      re: new RegExp(`(?<![A-Za-z0-9+#])${esc(r.alias)}(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])`, 'i'),
    }))
    // longest aliases first so "react native" is tried before "react"
    .sort((a, b) => b.alias.length - a.alias.length);
  return cache;
}

const looksLikeList = (line) => (line.match(/[,|•·/;]/g) || []).length >= 2;

/** Find taxonomy skills mentioned in free text. Returns [{id, name, evidence}] unique by id. */
export function extractSkills(text) {
  const entries = load();
  const found = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    for (const e of entries) {
      if (found.has(e.id)) continue;
      if (e.ambiguous && !looksLikeList(line)) continue;
      if (e.re.test(line)) {
        found.set(e.id, { id: e.id, name: e.name, evidence: line.trim().slice(0, 120) });
      }
    }
  }
  return [...found.values()];
}

export function skillByName(name) {
  const n = String(name || '').trim().toLowerCase();
  const row = db.prepare('SELECT s.id, s.name FROM skill_aliases a JOIN skills s ON s.id = a.skill_id WHERE a.alias = ?').get(n);
  return row || null;
}
