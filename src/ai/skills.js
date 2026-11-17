import { db } from '../db.js';
import { loadNative } from '../native.js';

// Aliases that are also ordinary English words or single letters. They only count when
// the line looks like a skills list (several separators), which avoids "go to market" -> Go.
const AMBIGUOUS = new Set(['c', 'go', 'rest', 'node', 'compose', 'spring', 'express', 'excel', 'torch', 'spring', 'mongo', 'ml', 'dl', 'os concepts']);

let cache = null;

export function resetSkillCache() {
  cache = null;
  scannerFor = null;
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

let scanner = null;
let scannerFor = null;
const native = loadNative();
function nativeScanner(entries) {
  if (!native?.buildScanner) return null;
  if (scannerFor !== entries) { scanner = native.buildScanner(entries.map((e) => e.alias)); scannerFor = entries; }
  return scanner;
}
/** Which entries mention which line, via the C++ Aho-Corasick scan. Returns Map(lineIndex -> sorted entry indices) or null. */
function scanNative(entries, text) {
  const sc = nativeScanner(entries);
  if (!sc) return null;
  const hits = native.scanLines(sc, text);
  const byLine = new Map();
  for (let i = 0; i < hits.length; i += 2) { const l = hits[i]; if (!byLine.has(l)) byLine.set(l, []); byLine.get(l).push(hits[i + 1]); }
  for (const v of byLine.values()) v.sort((a, b) => a - b); // entries are sorted longest-first, so index order = priority order
  return byLine;
}

/** Find taxonomy skills mentioned in free text. Returns [{id, name, evidence}] unique by id. */
export function extractSkills(text, { forceJs = false } = {}) {
  const entries = load();
  const found = new Map();
  const lines = text.split(/\r?\n/);
  const byLine = forceJs ? null : scanNative(entries, text);
  if (byLine) {
    // Same rules as the JS loop below, but only over the entries the native scan says are present on each line.
    for (let li = 0; li < lines.length; li++) {
      const cand = byLine.get(li);
      if (!cand) continue;
      for (const ei of cand) {
        const e = entries[ei];
        if (found.has(e.id)) continue;
        if (e.ambiguous && !looksLikeList(lines[li])) continue;
        found.set(e.id, { id: e.id, name: e.name, evidence: lines[li].trim().slice(0, 120) });
      }
    }
    return [...found.values()];
  }
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
