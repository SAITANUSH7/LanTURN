import { providerSummary } from './src/ai/providers.js';
import { config } from './src/config.js';
import { createApp } from './src/app.js';
import { startWorker, stopWorker } from './src/queue.js';
import { startScheduler, stopScheduler } from './src/tasks.js';
import { setDraining } from './src/routes/ops.js';
import { db } from './src/db.js';
import { startMonitor, stopMonitor, reportError } from './src/monitor.js';
import { stopSearch } from './src/searchEngine.js';
import { startupWarnings } from './src/security.js';
import { emailEnabled } from './src/email.js';
import { seedTaxonomy, seedAdmin, seedDemo } from './src/seed.js';

seedTaxonomy();
seedAdmin();
if (config.seedDemo) seedDemo();

startWorker();
startScheduler();
startMonitor();

const server = createApp().listen(config.port, () => {
  for (const w of startupWarnings()) console.warn(`SECURITY: ${w}`);
  console.log(`LanTURN running on http://localhost:${config.port}`);
  const ps = providerSummary();
  console.log(ps.length ? `AI providers ready: ${ps.map((x) => `${x.label} (${x.model})`).join(' -> ')} -> rules engine` : 'AI mode: rules engine only. Add a key at /#/admin/ai (admin) or in .env');
  if (config.seedDemo) console.log('Demo logins (password Demo@12345): student.one@example.test, hr@examplecorp.test | admin:', config.adminEmail);
  console.log(`Password reset: ${emailEnabled() ? 'emails are on' : 'no email provider (set EMAIL_API_KEY + EMAIL_FROM); password reset links are printed to this log'}`);
});

// Slowloris and idle-connection limits
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
server.keepAliveTimeout = 65_000; // above Railway's proxy idle timeout

// Graceful shutdown (Railway sends SIGTERM on every deploy): stop taking traffic, finish in-flight requests and
// tasks, checkpoint the WAL, then exit. Hard exit after 10 s so a stuck connection can never block a deploy.
let closing = false;
async function shutdown(signal, code = 0) {
  if (closing) return;
  closing = true;
  console.log(`${signal} received: draining`);
  setDraining(true);
  stopScheduler();
  stopMonitor();
  const force = setTimeout(() => { console.error('forced exit after 10s'); process.exit(1); }, 10_000);
  force.unref();
  server.close();
  server.closeIdleConnections?.();
  await stopWorker(7000);
  stopSearch();
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); } catch { /* already closed */ }
  console.log('shutdown complete');
  process.exit(code);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// One handler per event, registered once. A rejected promise is a bug to fix, not a reason to drop traffic; an
// uncaught exception means the process state is unknown, so it drains and exits non-zero.
process.on('unhandledRejection', (e) => {
  console.error('unhandledRejection', e);
  reportError(e, { tags: { kind: 'unhandledRejection' } }).catch(() => {});
});
process.on('uncaughtException', async (e) => {
  console.error('uncaughtException', e);
  try { await Promise.race([reportError(e, { tags: { kind: 'uncaughtException' } }), new Promise((r) => setTimeout(r, 2000).unref())]); } catch { /* reporting must not block the drain */ }
  await shutdown('uncaughtException', 1);
});
