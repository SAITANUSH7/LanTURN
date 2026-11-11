import { providerSummary } from './src/ai/providers.js';
import { config } from './src/config.js';
import { createApp } from './src/app.js';
import { seedTaxonomy, seedAdmin, seedDemo } from './src/seed.js';

seedTaxonomy();
seedAdmin();
if (config.seedDemo) seedDemo();

createApp().listen(config.port, () => {
  console.log(`LanTURN running on http://localhost:${config.port}`);
  const ps = providerSummary();
  console.log(ps.length ? `AI providers ready: ${ps.map((x) => `${x.label} (${x.model})`).join(' -> ')} -> rules engine` : 'AI mode: rules engine only. Add a key at /#/admin/ai (admin) or in .env');
  if (config.seedDemo) console.log('Demo logins (password Demo@12345): student.one@example.test, hr@examplecorp.test | admin:', config.adminEmail);
});
