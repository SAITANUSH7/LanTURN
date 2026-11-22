// Starts the real server on a free port with a throw-away database and the demo seed, and drives it with Playwright.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const require = createRequire(import.meta.url);
// PLAYWRIGHT_MODULE lets a machine that already has browsers point at its own copy; CI uses the dev dependency.
export const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
export const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

export const ACCOUNTS = {
  student: ['student.one@example.test', 'Demo@12345'],
  employer: ['hr@examplecorp.test', 'Demo@12345'],
  admin: ['admin@lanturn.local', 'Admin@12345'],
};

const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); });

export async function startApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanturn-e2e-'));
  const port = await freePort();
  const proc = spawn('node', ['--no-warnings', 'server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), DB_FILE: path.join(dir, 'e2e.db'), UPLOAD_DIR: path.join(dir, 'uploads'), SEED_DEMO: 'true', DISABLE_RATE_LIMIT: '1', NODE_ENV: 'test', NVIDIA_API_KEY: '', DISABLE_NATIVE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ }
    if (proc.exitCode !== null) throw new Error(`server exited early:\n${log}`);
    await new Promise((r) => setTimeout(r, 150));
    if (i === 99) throw new Error(`server did not start:\n${log}`);
  }
  return { base, stop: async () => { proc.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 200)); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** New page with console/page errors collected on `page.errors`. */
export async function newPage(browser, { width = 1280, height = 820, theme } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem('lanturn-theme', t); } catch { /* ignore */ } }, theme);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|ERR_|Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  return page;
}

export async function login(page, base, role) {
  const [email, password] = ACCOUNTS[role];
  await page.goto(`${base}/#/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('button[type=submit]');
  await page.waitForSelector('.side', { timeout: 10000 });
}

export async function audit(page) {
  await page.evaluate(axeSource);
  return page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'], resultTypes: ['violations'] }).then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)));
}
