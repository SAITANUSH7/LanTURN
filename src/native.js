import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from './config.js';

const require = createRequire(import.meta.url);
/** The compiled C++ addon is optional. Returns null (and the JS code is used) if it was not built or fails to load. */
export function loadNative() {
  if (process.env.DISABLE_NATIVE === '1') return null;
  const file = path.join(ROOT, 'native', 'build', 'Release', 'lanturn_native.node');
  if (!fs.existsSync(file)) return null;
  try { return require(file); } catch (e) { console.warn(`native core not loaded (${e.message}); using JS`); return null; }
}
