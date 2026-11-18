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

// Full-text search: SQL LIKE scan vs the lanturn-search executable, 50k synthetic jobs
const { searchJobs, searchAvailable, stopSearch } = await import('../src/searchEngine.js');
if (searchAvailable()) {
  const { DatabaseSync } = await import('node:sqlite');
  const words = 'backend frontend kotlin android react node python sql docker kubernetes cloud data ml design intern engineer developer analyst platform mobile security testing devops'.split(' ');
  const pick = (i, n) => Array.from({ length: n }, (_, k) => words[(i * 7 + k * 13) % words.length]).join(' ');
  const rowsJ = Array.from({ length: 50_000 }, (_, i) => ({ id: i + 1, title: `${pick(i, 3)} role`, company_name: `Co${i % 500}`, description: pick(i, 40) }));
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE j (id INTEGER, title TEXT, company TEXT, description TEXT)');
  const ins = sql.prepare('INSERT INTO j VALUES (?,?,?,?)');
  sql.exec('BEGIN'); for (const r of rowsJ) ins.run(r.id, r.title, r.company_name, r.description); sql.exec('COMMIT');
  const bundle = { v: 1, rows: rowsJ, skills: new Map() };
  await searchJobs(bundle, 'kotlin'); // warm: builds the index
  const q = 'kotlin android';
  const likeStmt = sql.prepare("SELECT COUNT(*) FROM j WHERE (title LIKE ? OR description LIKE ? OR company LIKE ?) AND (title LIKE ? OR description LIKE ? OR company LIKE ?)");
  const sqlMs = time(() => likeStmt.all('%kotlin%', '%kotlin%', '%kotlin%', '%android%', '%android%', '%android%'), 5);
  let n = 0; const t0 = performance.now(); for (let i = 0; i < 20; i++) { await searchJobs(bundle, q); n++; }
  const engMs = (performance.now() - t0) / n;
  rows.push({ kernel: 'job search, 50k jobs (SQL LIKE full scan, unranked vs lanturn-search, ranked)', 'JS ms': +sqlMs.toFixed(2), 'C++ ms': +engMs.toFixed(2), speedup: `${(sqlMs / engMs).toFixed(1)}x` });
  stopSearch();
}
console.table(rows);
process.exit(0);
