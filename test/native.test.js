import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop } from './helpers.js';
import { loadNative } from '../src/native.js';
import { matchManyJs, pack } from '../src/match.js';
import { extractSkills, resetSkillCache } from '../src/ai/skills.js';

before(start);
after(stop);
const native = loadNative();
const skip = native ? false : 'native core not built (run: node native/build.mjs)';

test('native matchMany equals JS on random data (incl. rounding edge cases)', { skip }, () => {
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let round = 0; round < 200; round++) {
    const students = Array.from({ length: 1 + rnd(40) }, () => Array.from({ length: rnd(12) }, () => rnd(30)));
    const nReq = rnd(8);
    const reqIds = Int32Array.from({ length: nReq }, () => rnd(30));
    const reqW = Int32Array.from({ length: nReq }, () => 1 + rnd(3));
    const { skillIds, offsets } = pack(students);
    assert.deepEqual([...native.matchMany(skillIds, offsets, reqIds, reqW)], [...matchManyJs(skillIds, offsets, reqIds, reqW)], `round ${round}`);
  }
  // 29/200 = 0.145: float math gives 14, true rounding gives 15; both implementations must agree on 15
  const ids = Int32Array.from({ length: 29 }, (_, i) => i), w = new Int32Array(29).fill(1);
  const o = Int32Array.from([0, 29]); const all = Int32Array.from({ length: 29 }, (_, i) => i);
  assert.equal(native.matchMany(all, o, ids, w)[0], matchManyJs(all, o, ids, w)[0]);
});

test('native skill scan matches the regex implementation exactly', { skip }, () => {
  resetSkillCache();
  const samples = [
    'Skills: Kotlin, Jetpack Compose, Android, MVVM, Retrofit, REST APIs, Git, SQL, Python',
    'Built apps with React Native and React; used Node.js, Express, C++ and C# daily. go to market strategy',
    'Languages: C, Go, Rust | Tools: Docker; Kubernetes/CI/CD • GitHub Actions',
    'worked on node.js. node.\nreact.js and next.js (not nodejs!) java, javascript, JAVA script',
    'Skilled in SQL.\r\nPostgreSQL/MySQL; mongo, spring, express, excel, torch\r\nTensorFlow, PyTorch, scikit-learn, pandas.numpy',
    'c++ c# .net f# objective-c TypeScript-based tooling git-lfs',
    'Résumé: python3 python-based café Kotlin—Android “React” ünicode Docker',
  ];
  // plus random token soup from the alias list itself
  const aliases = [...new Set(extractSkills(samples.join('\n'), { forceJs: true }).map((s) => s.name))];
  const soup = Array.from({ length: 60 }, (_, i) => `${aliases[i % aliases.length] || 'x'}${['', ',', '.', '+', '#', ' ', '-', '/'][i % 8]}${['a', ' ', '1', '.js', '\n', ', go, c, rest'][i % 6]} ${aliases[(i * 7) % (aliases.length || 1)] || ''}`).join('\n');
  for (const t of [...samples, soup, samples.join('\n')]) {
    const a = extractSkills(t, { forceJs: true });
    const b = extractSkills(t);
    assert.deepEqual(b, a, `mismatch for: ${t.slice(0, 80)}`);
  }
  assert.ok(extractSkills(samples[0]).some((s) => s.name === 'Kotlin'));
});
