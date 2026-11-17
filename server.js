import { providerSummary } from './src/ai/providers.js';
import { config } from './src/config.js';
import { createApp } from './src/app.js';
import { startupWarnings } from './src/security.js';
import { seedTaxonomy, seedAdmin, seedDemo } from './src/seed.js';

seedTaxonomy();
seedAdmin();
if (config.seedDemo) seedDemo();

const server = createApp().listen(config.port, () => {
  for (const w of startupWarnings()) console.warn(`SECURITY: ${w}`);
  console.log(`LanTURN running on http://localhost:${config.port}`);
  const ps = providerSummary();
  console.log(ps.length ? `AI providers ready: ${ps.map((x) => `${x.label} (${x.model})`).join(' -> ')} -> rules engine` : 'AI mode: rules engine only. Add a key at /#/admin/ai (admin) or in .env');
  if (config.seedDemo) console.log('Demo logins (password Demo@12345): student.one@example.test, hr@examplecorp.test | admin:', config.adminEmail);
});

// Slowloris and idle-connection limits
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
server.keepAliveTimeout = 65_000; // above Railway's proxy idle timeout
