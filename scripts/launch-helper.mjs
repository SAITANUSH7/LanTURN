// Helper used by launch.bat. Usage: node scripts/launch-helper.mjs <command>
//   check    exit 0 if Node >= 22.5
//   env      create .env from .env.example with fresh random JWT secrets (only if .env is missing)
//   port     print the first free TCP port starting at 3000
//   lan      print this machine's LAN IPv4 address(es)
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import crypto from 'node:crypto';

const cmd = process.argv[2];

if (cmd === 'check') {
  const [a, b] = process.versions.node.split('.').map(Number);
  process.exit(a > 22 || (a === 22 && b >= 5) ? 0 : 1);
} else if (cmd === 'env') {
  if (!fs.existsSync('.env')) {
    const rnd = () => crypto.randomBytes(48).toString('hex');
    const txt = fs.readFileSync('.env.example', 'utf8')
      .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${rnd()}`)
      .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${rnd()}`);
    fs.writeFileSync('.env', txt);
    console.log('created');
  } else console.log('exists');
} else if (cmd === 'port') {
  const free = (p) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p); });
  let p = Number(process.argv[3]) || 3000;
  while (!(await free(p)) && p < 3100) p++;
  console.log(p);
} else if (cmd === 'lan') {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(ips[0] || '');
} else process.exit(2);
