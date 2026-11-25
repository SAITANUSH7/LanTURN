// Turns a failing test log into GitHub check-run annotations.
//
// Why this exists: the Actions *log* for a failed job can only be downloaded from
// results-receiver.githubusercontent.com, which is not reachable from every environment, while check-run
// annotations go through api.github.com and are readable everywhere. When the browser tests fail we want the
// first failure in front of us, not a 2-minute round trip and a guess.
//
// Usage: node scripts/ci-annotate.mjs <logfile> [maxAnnotations]
// Emits `::error::` workflow commands: the job still fails on its own, we only add the why.

import fs from 'node:fs';

const file = process.argv[2];
const limit = Number(process.argv[3] || 20);
if (!file || !fs.existsSync(file)) {
  console.log(`::warning::ci-annotate: no log at ${file}`);
  process.exit(0);
}

const raw = fs.readFileSync(file, 'utf8');
const lines = raw.split('\n');

// TAP: "not ok 7 - some test name", followed by a YAML detail block with error/expected/actual/stack.
const failures = [];
for (let i = 0; i < lines.length && failures.length < limit; i++) {
  if (!/^not ok \d+ - /.test(lines[i])) continue;
  const detail = lines.slice(i + 1, i + 40).filter((l) => !/^\s*(duration_ms|type|location|failureType|code):/.test(l)).join('\n');
  failures.push({ title: lines[i].replace(/^not ok \d+ - /, ''), body: `${lines[i]}\n${detail}`.trim() });
}

const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').slice(0, 60000);

if (failures.length) {
  for (const f of failures) console.log(`::error title=${esc(f.title).slice(0, 200)}::${esc(f.body)}`);
} else {
  // No TAP "not ok": the failure came from the runner itself (install, crash, timeout). Surface the tail.
  const tail = lines.filter((l) => l.trim()).slice(-40).join('\n');
  console.log(`::error title=e2e run failed before reporting tests::${esc(tail)}`);
}
console.log(`ci-annotate: reported ${failures.length} failing test(s) from ${file}`);
