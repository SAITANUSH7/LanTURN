import { config } from './src/config.js';
import { createApp } from './src/app.js';
import { seedTaxonomy, seedAdmin, seedDemo } from './src/seed.js';

seedTaxonomy();
seedAdmin();
if (config.seedDemo) seedDemo();

createApp().listen(config.port, () => {
  console.log(`LanTURN running on http://localhost:${config.port}`);
  console.log(`AI mode: ${config.anthropicKey && config.llmModel ? 'LLM + rules' : 'rules engine (set ANTHROPIC_API_KEY and LLM_MODEL to enable the LLM)'}`);
  if (config.seedDemo) console.log('Demo logins (password Demo@12345): student.one@example.test, hr@examplecorp.test | admin:', config.adminEmail);
});
