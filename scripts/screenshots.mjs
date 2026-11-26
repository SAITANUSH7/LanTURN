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
      if (role !== 'public') {
        // A failed login used to abort the whole capture with no evidence. Dump what the page really contained first.
        try { await login(page, app.base, role); } catch (e) {
          const info = await page.evaluate(() => ({
            url: location.href,
            inputs: [...document.querySelectorAll('input')].map((i) => ({ type: i.type, name: i.name, visible: !!i.offsetParent })),
            mainHtml: (document.getElementById('main')?.innerHTML || '').slice(0, 1200),
            bodyText: (document.body.innerText || '').slice(0, 600),
          })).catch(() => ({ url: page.url() }));
          await fs.promises.writeFile(path.join(out, `debug-login-${role}.txt`),
            [`error: ${e.message}`, `theme: ${theme}`, JSON.stringify(info, null, 2)].join('\n')).catch(() => {});
          throw e;
        }
      }
      for (const [name, route] of routes) {
        await page.goto(`${app.base}/#${route}`);
        await settle(page);
        await shoot(page, `${theme}--${role}--${name}.jpg`);
        count += 1;
      }
      await page.context().close();
    }
    // Tablet: the width where the dual-column sign-in collapses and the sidebar becomes a drawer. Layout problems
    // live exactly there, and neither the desktop pass nor the 390px pass ever showed it.
    const tab = await newPage(browser, { width: 808, height: 908, theme });
    for (const [name, route] of [['tablet-login', '/login'], ['tablet-register', '/register']]) {
      await tab.goto(`${app.base}/#${route}`);
      await settle(tab);
      await shoot(tab, `${theme}--${name}.jpg`);
      count += 1;
    }
    await login(tab, app.base, 'student');
    for (const [name, route] of [['tablet-home', '/student'], ['tablet-jobs', '/student/jobs']]) {
      await tab.goto(`${app.base}/#${route}`);
      await settle(tab);
      await shoot(tab, `${theme}--${name}.jpg`);
      count += 1;
    }
    await tab.context().close();

    // The employer dashboard carries six stat tiles where the student home carries four, and it is the screen where a
    // four-column grid leaves two holes. It had no tablet shot.
    const tabEmp = await newPage(browser, { width: 808, height: 908, theme });
    await login(tabEmp, app.base, 'employer');
    for (const [name, route] of [['tablet-employer-home', '/employer'], ['tablet-employer-candidates', '/employer/jobs/1/candidates']]) {
      await tabEmp.goto(`${app.base}/#${route}`);
      await settle(tabEmp);
      await shoot(tabEmp, `${theme}--${name}.jpg`);
      count += 1;
    }
    await tabEmp.context().close();

    // Phone: the drawer and the tab bar only exist at this width.
    const phone = await newPage(browser, { width: 390, height: 844, theme });
    // The landing bar before signing in carries more controls than any other bar - brand, theme, language, two calls
    // to action - which is why it was the one bar that did not fit. No pass captured it at this width until now.
    await phone.goto(`${app.base}/#/`);
    await settle(phone);
    await shoot(phone, `${theme}--phone-landing.jpg`);
    count += 1;
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

    // An employer's single application: a form inside a split column, which is where a grid track that will not shrink
    // pushes the content off the side of a phone.
    const empPhone = await newPage(browser, { width: 390, height: 844, theme });
    await login(empPhone, app.base, 'employer');
    await empPhone.goto(`${app.base}/#/employer/applications/1`);
    await settle(empPhone);
    await shoot(empPhone, `${theme}--phone-employer-candidate.jpg`);
    count += 1;
    await empPhone.context().close();
  }
} finally {
  console.log(`captured ${count} screenshots into ${out}`);
  await browser.close();
  await app.stop();
}
