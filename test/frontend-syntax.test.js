import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// A syntax error in any browser module blanks the whole site (main.js imports them all), so catch it here.
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
for (const f of walk('public')) {
  test(`browser module parses: ${f}`, () => {
    const src = fs.readFileSync(f);
    const tmp = path.join('data', `syntax-${path.basename(f)}.mjs`);
    fs.writeFileSync(tmp, src);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } catch (e) { assert.fail(String(e.stderr || e)); } finally { fs.rmSync(tmp, { force: true }); }
  });
}
