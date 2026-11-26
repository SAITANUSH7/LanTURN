import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, startApp, newPage, login, audit } from './harness.js';

let app; let browser;
before(async () => { app = await startApp(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await app?.stop(); });

const settle = (page) => page.waitForSelector('#main .container, #main .auth2, .auth2, .lp', { timeout: 10000 });
const noOverflow = async (page) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'page must not scroll sideways');

test('landing page renders, and the theme choice sticks across reloads', async () => {
  const page = await newPage(browser);
  await page.goto(`${app.base}/#/`); await page.waitForSelector('.lp-hero h1');
  assert.match(await page.textContent('.lp-hero h1'), /skills into offers/i);
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('.topbar .iconbtn[aria-label^="Switch to"]');
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.notEqual(before, after);
  await page.reload(); await page.waitForSelector('.lp-hero h1');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), after);
  await noOverflow(page); assert.deepEqual(page.errors, []);
});

test('sign-in rejects a wrong password and accepts the demo student', async () => {
  const page = await newPage(browser);
  await page.goto(`${app.base}/#/login`);
  await page.fill('input[type=email]', 'student.one@example.test'); await page.fill('input[type=password]', 'wrong-password'); await page.click('button[type=submit]');
  await page.waitForSelector('[role=alert], .alert--danger, .toast', { timeout: 8000 });
  assert.equal(await page.locator('.side').count(), 0, 'must stay signed out');
  await login(page, app.base, 'student');
  await page.waitForSelector('h1:has-text("Hi,")');
  assert.deepEqual(page.errors.filter((e) => !/401/.test(e)), []);
});

test('student journey: onboarding, sidebar navigation, job filters live in the URL', async () => {
  const page = await newPage(browser);
  await login(page, app.base, 'student');
  await page.waitForSelector('.ob'); // first-run checklist is visible until all three steps are done
  await page.click('.side a[href="#/student/jobs"]');
  await page.waitForSelector('input[type=search]');
  await page.fill('input[type=search]', 'engineer'); await page.click('button[type=submit]');
  await page.waitForFunction(() => location.hash.includes('q=engineer'));
  await page.reload(); await page.waitForSelector('input[type=search]');
  assert.equal(await page.inputValue('input[type=search]'), 'engineer', 'filter survives a reload');
  await page.click('.side a[href="#/student/applications"]'); await page.waitForSelector('.filter');
  await page.click('.filter:nth-child(2)');
  await page.waitForFunction(() => location.hash.includes('status=active'));
  assert.equal(await page.locator('.filter[aria-pressed=true]').count(), 1);
  assert.deepEqual(page.errors, []);
});

test('roadmap: guide drawer opens, arrows move between topics, Escape closes, ticking updates progress', async () => {
  const page = await newPage(browser);
  await login(page, app.base, 'student');
  await page.goto(`${app.base}/#/student/roadmap`); await page.waitForSelector('.rm-panel');
  const known = async () => Number((await page.textContent('[data-testid=rm-known]')).match(/(\d+) of/)[1]);
  const start = await known();
  await page.locator('.rm-stage.is-open .rm-topic .rm-check:has(input:not(:checked):not(:disabled))').first().click();
  await page.waitForFunction((n) => Number(document.querySelector('[data-testid=rm-known]').textContent.match(/(\d+) of/)[1]) === n + 1, start);
  await page.locator('.rm-topic [data-topic]').first().click();
  await page.waitForSelector('.rm-drawer');
  const title = await page.textContent('.rm-drawer h2');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((t) => document.querySelector('.rm-drawer h2').textContent !== t, title);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.rm-drawer', { state: 'detached' });
  assert.deepEqual(page.errors, []);
});

test('employer: dashboard charts render and candidate filters persist in the URL', async () => {
  const page = await newPage(browser);
  await login(page, app.base, 'employer');
  await page.waitForSelector('.chart'); await page.waitForSelector('.funnel li');
  assert.equal(await page.locator('.chart__col').count(), 14);
  assert.equal(await page.locator('.funnel li').count(), 6);
  await page.goto(`${app.base}/#/employer/jobs/1/candidates`); await page.waitForSelector('.segmented');
  await page.click('.segmented button:nth-child(2)');
  await page.waitForFunction(() => location.hash.includes('sort=match'));
  await page.waitForSelector('.filter'); await page.click('.filter:nth-child(2)');
  await page.waitForFunction(() => location.hash.includes('status=APPLIED'));
  assert.deepEqual(page.errors, []);
});

test('employer: attention card, job filters, private rating and note, CSV export', async () => {
  const page = await newPage(browser);
  await login(page, app.base, 'employer');
  await page.waitForSelector('.attention');
  await page.goto(`${app.base}/#/employer/jobs`); await page.waitForSelector('.filter');
  await page.click('.filter:nth-child(3)');
  await page.waitForFunction(() => location.hash.includes('status=CLOSED'));
  await page.click('.filter:nth-child(2)');
  assert.ok(await page.locator('.card h3').count() > 0);
  await page.fill('input[type=search]', 'zzzz-no-such-job');
  await page.waitForSelector('.empty');
  await page.goto(`${app.base}/#/employer/jobs/1/candidates`); await page.waitForSelector('.cand');
  const dl = page.waitForEvent('download');
  await page.click('text=Export CSV');
  assert.match((await dl).suggestedFilename(), /^candidates-job-1\.csv$/);
  await page.click('.cand a[href*="/employer/applications/"]'); await page.waitForSelector('.rating');
  await page.click('.rating__star:nth-child(3)');
  await page.fill('textarea[aria-label="Private note"]', 'e2e note');
  await page.click('text=Save note'); await page.waitForSelector('.toast');
  await page.reload(); await page.waitForSelector('.rating');
  assert.equal(await page.locator('.rating__star.is-on').count(), 3);
  assert.equal(await page.inputValue('textarea[aria-label="Private note"]'), 'e2e note');
  assert.deepEqual(page.errors.filter((e) => !/ERR_|Failed to load resource/.test(e)), []);
});

test('admin system: stat tiles carry their own trend, and the queue is a strip not four cards', async () => {
  const page = await newPage(browser);
  await login(page, app.base, 'admin');
  await page.goto(`${app.base}/#/admin/system`);
  await page.waitForSelector('.stat--tile', { timeout: 15000 });

  assert.equal(await page.locator('.stat--tile').count(), 4, 'uptime, memory, in flight, queue depth');
  // Every tile says what its number means. On a fresh process there is only one sample, so the sparkline is absent
  // by design and the hint explains that instead of drawing a flat line through a single point.
  assert.equal(await page.locator('.stat--tile .stat__hint').count(), 4);
  // textContent, not innerText: the label is uppercased by CSS and innerText reflects that.
  assert.match(await page.locator('.stat--tile').nth(1).textContent(), /Memory \(RSS\)/);

  const queueCard = page.locator('.card').filter({ has: page.locator('h3', { hasText: 'Background queue' }) });
  assert.equal(await queueCard.count(), 1);
  assert.equal(await queueCard.locator('.statstrip').count(), 1, 'the four queue numbers live in one strip');
  assert.equal(await queueCard.locator('.statstrip__c').count(), 4);
  assert.equal(await queueCard.locator('.stat').count(), 0, 'and they are no longer cards nested in a card');

  await noOverflow(page);
  assert.deepEqual(page.errors, []);
});

test('students are kept out of employer and admin pages', async () => {
  const page = await newPage(browser);
  await login(page, app.base, 'student');
  await page.goto(`${app.base}/#/admin`);
  await page.waitForFunction(() => !location.hash.startsWith('#/admin'));
  await page.goto(`${app.base}/#/employer`);
  await page.waitForFunction(() => !location.hash.startsWith('#/employer'));
});

test('phone layout: tab bar is visible, More opens the menu, nothing overflows', async () => {
  const page = await newPage(browser, { width: 390, height: 800 });
  await login(page, app.base, 'student');
  await page.waitForSelector('.tabbar');
  assert.ok(await page.locator('.tabbar').isVisible());
  await page.click('.tabbar button');
  await page.waitForFunction(() => document.querySelector('.app').classList.contains('is-open'));
  await page.keyboard.press('Escape');
  for (const r of ['/student', '/student/jobs', '/student/roadmap', '/student/applications']) { await page.goto(`${app.base}/#${r}`); await page.waitForSelector('.tabbar'); await page.waitForTimeout(300); await noOverflow(page); }
  assert.deepEqual(page.errors, []);
});

for (const theme of ['dark', 'light']) {
  test(`accessibility: no WCAG A/AA violations on key pages (${theme})`, async () => {
    const found = [];
    const pub = await newPage(browser, { theme });
    for (const r of ['/', '/login', '/register']) { await pub.goto(`${app.base}/#${r}`); await pub.waitForTimeout(500); found.push(...(await audit(pub)).map((v) => `${r} ${v}`)); }
    for (const [role, routes] of [['student', ['/student', '/student/applications', '/student/jobs', '/student/roadmap', '/student/career?jobId=1', '/student/messages', '/student/arena', '/student/dna']], ['employer', ['/employer', '/employer/jobs', '/employer/jobs/1/candidates', '/employer/applications/1', '/employer/jobs/new?from=1']], ['admin', ['/admin', '/admin/system', '/admin/ai']]]) {
      const page = await newPage(browser, { theme });
      try { await login(page, app.base, role); } catch (e) {
        const fs = await import('node:fs/promises');
        const html = await page.content().catch(() => '');
        await fs.mkdir('ui-shots', { recursive: true }).catch(() => {});
        await fs.writeFile(`ui-shots/debug-login-${theme}-${role}.txt`,
          [`url: ${page.url()}`, `theme: ${theme}`, `errors: ${JSON.stringify(page.errors)}`, '--- html ---', html.slice(0, 4000)].join('\n')).catch(() => {});
        throw e;
      }
      for (const r of routes) { await page.goto(`${app.base}/#${r}`); await page.waitForTimeout(700); found.push(...(await audit(page)).map((v) => `${r} ${v}`)); }
    }
    assert.deepEqual(found, []);
  });
}
