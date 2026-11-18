// Compile the optional C++ core with plain g++ against the Node headers (no node-gyp needed).
//   node native/build.mjs        -> native/build/Release/lanturn_native.node
// Exits 0 even if a compiler is missing: the app then runs on the JS implementations.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const include = path.join(path.dirname(path.dirname(process.execPath)), 'include', 'node');
const outDir = path.join(here, 'build', 'Release');
const out = path.join(outDir, 'lanturn_native.node');
if (!fs.existsSync(path.join(include, 'node_api.h'))) { console.warn(`native: Node headers not found at ${include}; skipping (JS fallback in use)`); process.exit(0); }
fs.mkdirSync(outDir, { recursive: true });
const cxx = process.env.CXX || 'g++';
const args = ['-std=c++17', '-O3', '-shared', '-fPIC', '-Wall', `-I${include}`, '-DNODE_GYP_MODULE_NAME=lanturn_native', '-DNAPI_VERSION=8', path.join(here, 'lanturn_native.cc'), '-o', out];
const r = spawnSync(cxx, args, { stdio: 'inherit' });
if (r.status !== 0) { console.warn('native: compile failed or no compiler; skipping (JS fallback in use)'); process.exit(0); }
// The standalone search executable (no Node headers needed)
const exe = path.join(outDir, 'lanturn-search');
const r2 = spawnSync(cxx, ['-std=c++17', '-O3', '-Wall', path.join(here, 'search', 'lanturn_search.cpp'), '-o', exe], { stdio: 'inherit' });
if (r2.status !== 0) console.warn('native: lanturn-search failed to build; job search falls back to SQL');
else console.log(`native: built ${path.relative(process.cwd(), exe)}`);
console.log(`native: built ${path.relative(process.cwd(), out)}`);
