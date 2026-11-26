// Capture every screen, for design review rather than for assertions.
//
// The browser suite proves pages do not throw, overflow or fail WCAG; it cannot tell you that a card is 40px too tall
// or that two headings are fighting for the same line. This walks the real app (throw-away database, demo seed) and
// writes one PNG per route per theme, plus a phone-sized pass over the shell.
//
//   node scripts/screenshots.mjs [outDir]        # default: ui-shots
//
// CI runs it when the repository variable UI_SHOTS is 1 and uploads the folder as an artifact.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, startApp, newPage, login } from '../e2e/harness.js';

const out = path.resolve(process.argv[2] || 'ui-shots');
fs.mkdirSync(out, { recursive: true });

const ROUTES = {
  public: [['landing', '/'], ['login', '/login'], ['register', '/register']],
  student: [
    ['home', '/student'], ['jobs', '/student/jobs'], ['job-detail', '/student/jobs/1'],
    ['applications', '/student/applications'], ['messages', '/student/messages'],
    ['resume', '/student/resume'], ['builder', '/student/builder'], ['career', '/student/career?jobId=1'],
    ['roadmap', '/student/roadmap'], ['map', '/student/map'], ['dna', '/student/dna'],
    ['arena', '/student/arena'], ['coach', '/student/coach'], ['profile', '/student/profile'],
    ['setup', '/student/setup'], ['notifications', '/notifications'],
  ],
  employer: [
    ['home', '/employer'], ['jobs', '/employer/jobs'], ['job-new', '/employer/jobs/new'],
    ['candidates', '/employer/jobs/1/candidates'], ['candidate', '/employer/applications/1'],
    ['messages', '/employer/messages'], ['company', '/employer/company'],
    ['assistant', '/employer/assistant'], ['board', '/employer/jobs/1/board'],
  ],
  admin: [['employers', '/admin'], ['ai', '/admin/ai'], ['system', '/admin/system']],
};

const PHONE_ROUTES = [['phone-home', '/student'], ['phone-jobs', '/student/jobs'], ['phone-roadmap', '/student/roadmap']];

const settle = (page) => page.waitForFunction(() => {
  const main = document.querySelector('#main');
  return main && main.children.length > 0 && !main.querySelector('.skeleton, .loading');
}, null, { timeout: 15000 }).catch(() => {});

async function shoot(page, file) {
  await page.waitForTimeout(450); // let layout and the specular highlight settle
  // JPEG at 55: these are for reading layout and colour, not for print, and a fifth of the bytes matters when the
  // only way out of CI is a commit.
  await page.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 55, fullPage: false });
}

const app = await startApp();
const browser = await chromium.launch();
let count = 0;
try {
  for (const theme of ['dark', 'light']) {
    for (const [role, routes] of Object.entries(ROUTES)) {
      const page = await newPage(browser, { theme });
      if (role !== 'public') await login(page, app.base, role);
      for (const [name, route] of routes) {
        await page.goto(`${app.base}/#${route}`);
        await settle(page);
        await shoot(page, `${theme}--${role}--${name}.jpg`);
        count += 1;
      }
      await page.context().close();
    }
    // Phone: the drawer and the tab bar only exist at this width.
    const phone = await newPage(browser, { width: 390, height: 844, theme });
    await phone.goto(`${app.base}/#/login`);
    await settle(phone);
    await shoot(phone, `${theme}--phone-login.jpg`);
    count += 1;
    await login(phone, app.base, 'student');
    for (const [name, route] of PHONE_ROUTES.filter(([, r]) => r.startsWith('/student'))) {
      await phone.goto(`${app.base}/#${route}`);
      await settle(phone);
      await shoot(phone, `${theme}--${name}.jpg`);
      count += 1;
    }
    await phone.context().close();
  }
} finally {
  console.log(`captured ${count} screenshots into ${out}`);
  await browser.close();
  await app.stop();
}
