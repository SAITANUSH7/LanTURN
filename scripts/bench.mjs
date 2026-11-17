// Load benchmark: seeds a synthetic dataset into a throwaway database, boots the real server, and hammers key endpoints.
//   node scripts/bench.mjs [students=3000] [jobs=400] [seconds=4] [concurrency=24]
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const [S = 3000, J = 400, SECS = 4, CONC = 24] = process.argv.slice(2).map(Number);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanturn-bench-'));
const env = { ...process.env, NODE_ENV: 'production', SEED_DEMO: 'false', PORT: '4290', DB_FILE: path.join(dir, 'b.db'), UPLOAD_DIR: path.join(dir, 'up'), JWT_ACCESS_SECRET: 'x'.repeat(40), JWT_REFRESH_SECRET: 'y'.repeat(40), ADMIN_PASSWORD: 'Bench@12345', NVIDIA_API_KEY: '', DISABLE_RATE_LIMIT: '1' };
const base = `http://127.0.0.1:${env.PORT}`;

// 1. boot once so the schema and taxonomy exist, then stop, then bulk-insert
const boot = () => spawn('node', ['--no-warnings', 'server.js'], { env, stdio: 'ignore' });
let srv = boot();
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${base}/api/health/live`)).ok) return; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 200)); } throw new Error('server did not start'); };
await up(); srv.kill('SIGTERM'); await new Promise((r) => srv.once('exit', r));

const db = new DatabaseSync(env.DB_FILE);
const hash = bcrypt.hashSync('Bench@12345', 4);
const skills = db.prepare('SELECT id FROM skills').all().map((r) => r.id);
const rnd = (n) => Math.floor(Math.random() * n);
db.exec('BEGIN');
const insU = db.prepare("INSERT INTO users (email, password_hash, role, verification) VALUES (?,?,?, 'VERIFIED')");
const insP = db.prepare('INSERT INTO student_profiles (user_id, full_name) VALUES (?,?)');
const insSS = db.prepare('INSERT OR IGNORE INTO student_skills (user_id, skill_id, source) VALUES (?,?,?)');
for (let i = 0; i < S; i++) {
  const id = Number(insU.run(`bench${i}@example.test`, hash, 'STUDENT').lastInsertRowid);
  insP.run(id, `Bench Student ${i}`);
  for (let k = 0; k < 8; k++) insSS.run(id, skills[rnd(skills.length)], 'MANUAL');
}
const emp = Number(insU.run('bench-hr@example.test', hash, 'EMPLOYER').lastInsertRowid);
db.prepare('INSERT INTO employer_profiles (user_id, company_name) VALUES (?,?)').run(emp, 'Bench Co');
const insJ = db.prepare("INSERT INTO jobs (employer_id, title, description, type, location, remote) VALUES (?,?,?,?,?,?)");
const insJS = db.prepare('INSERT OR IGNORE INTO job_skills (job_id, skill_id, weight) VALUES (?,?,?)');
for (let j = 0; j < J; j++) {
  const id = Number(insJ.run(emp, `Bench Role ${j}`, 'Synthetic description for load testing. '.repeat(8), ['INTERNSHIP', 'FULL_TIME'][j % 2], ['Hyderabad', 'Bengaluru', 'Pune'][j % 3], j % 4 === 0 ? 1 : 0).lastInsertRowid);
  for (let k = 0; k < 5; k++) insJS.run(id, skills[rnd(skills.length)], 1 + rnd(3));
}
db.exec('COMMIT'); db.close();

srv = boot(); await up();
const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bench7@example.test', password: 'Bench@12345' }) })).json();
const auth = { authorization: `Bearer ${login.accessToken}` };

async function hit(name, p, headers = auth) {
  const lat = []; let errors = 0; const end = Date.now() + SECS * 1000;
  const worker = async () => { while (Date.now() < end) { const t = performance.now(); try { const r = await fetch(base + p, { headers }); await r.arrayBuffer(); if (r.status >= 400) errors++; } catch { errors++; } lat.push(performance.now() - t); } };
  await Promise.all(Array.from({ length: CONC }, worker));
  lat.sort((a, b) => a - b);
  const q = (x) => lat[Math.min(lat.length - 1, Math.floor(lat.length * x))].toFixed(1);
  return { endpoint: name, rps: Math.round(lat.length / SECS), p50: +q(0.5), p95: +q(0.95), p99: +q(0.99), errors };
}
const rows = [];
rows.push(await hit('GET /api/health/live', '/api/health/live', {}));
rows.push(await hit('GET /api/platform/stats', '/api/platform/stats', {}));
rows.push(await hit('GET /api/jobs (page)', '/api/jobs?pageSize=20'));
rows.push(await hit('GET /api/jobs?q=role', '/api/jobs?q=Role%2012'));
rows.push(await hit('GET /api/jobs/recommended', '/api/jobs/recommended'));
rows.push(await hit('GET /api/me', '/api/me'));
rows.push(await hit('GET /api/career/map', '/api/career/map'));
console.log(`\ndataset: ${S} students, ${J} jobs | ${CONC} connections x ${SECS}s | node ${process.version} | ${os.cpus().length} cpu`);
console.table(rows);
srv.kill('SIGTERM');
if (process.env.BENCH_JSON) fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(rows, null, 2));
if (process.env.BENCH_KEEP) console.log('kept', dir); else fs.rmSync(dir, { recursive: true, force: true });
