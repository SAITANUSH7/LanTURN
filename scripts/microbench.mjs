// JS vs C++ on the two native kernels.   node scripts/microbench.mjs
process.env.NODE_ENV = 'test'; process.env.DB_FILE = ':memory:';
const { loadNative } = await import('../src/native.js');
const { matchManyJs, pack } = await import('../src/match.js');
const { seedTaxonomy } = await import('../src/seed.js');
const { extractSkills } = await import('../src/ai/skills.js');
seedTaxonomy();
const native = loadNative();
if (!native) { console.log('native core not built: node native/build.mjs'); process.exit(0); }
const time = (f, n) => { f(); const t = performance.now(); for (let i = 0; i < n; i++) f(); return (performance.now() - t) / n; };
const rows = [];

const N = 100_000;
const students = Array.from({ length: N }, (_, i) => Array.from({ length: 10 }, (_, k) => (i * 31 + k * 17) % 400));
const { skillIds, offsets } = pack(students);
const rid = Int32Array.from([3, 17, 90, 120, 250, 301]); const rw = Int32Array.from([3, 2, 1, 3, 2, 1]);
const js = time(() => matchManyJs(skillIds, offsets, rid, rw), 5), nat = time(() => native.matchMany(skillIds, offsets, rid, rw), 5);
rows.push({ kernel: `matchMany ${N / 1000}k students`, 'JS ms': +js.toFixed(2), 'C++ ms': +nat.toFixed(2), speedup: `${(js / nat).toFixed(1)}x` });

const resume = ('Skills: Kotlin, Jetpack Compose, Android, MVVM, Retrofit, REST APIs, Git, SQL, Python, React, Node.js, Docker\n'
  + 'Built a placement tracker app in Kotlin and Jetpack Compose used by 120 students across two colleges and reduced load time by 35 percent\n'
  + 'Collaborated with a team of four to ship the app, wrote documentation and led weekly code reviews for interns\n').repeat(60);
const a = time(() => extractSkills(resume, { forceJs: true }), 30), b = time(() => extractSkills(resume), 30);
rows.push({ kernel: `extractSkills ${(resume.length / 1000).toFixed(0)} KB resume`, 'JS ms': +a.toFixed(2), 'C++ ms': +b.toFixed(2), speedup: `${(a / b).toFixed(1)}x` });
console.table(rows);
