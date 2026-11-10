import { seedTaxonomy, seedAdmin, seedDemo } from './seed.js';
seedTaxonomy();
seedAdmin();
seedDemo();
console.log('Seeded taxonomy, admin and demo data.');
