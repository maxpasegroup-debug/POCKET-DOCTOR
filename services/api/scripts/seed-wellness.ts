import 'dotenv/config';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';
const env = readEnvironment();
if (!env.DATABASE_URL || env.DEMO_WELLNESS !== 'true' || !['development', 'test'].includes(env.APP_ENV)) throw new Error('Wellness seed requires an isolated development/test database and DEMO_WELLNESS=true.');
const database = createDatabase(env.DATABASE_URL);
try {
  await database.client!.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(740004)`;
    const categories = ['Weight Management', 'Diabetes Lifestyle Support', 'Nutrition & Wellness', 'Daily Wellness', 'Sleep & Relaxation', 'Stress & Mental Wellness', "Women's Wellness", "Men's Wellness", 'Preventive Wellness'];
    for (const [position, name] of categories.entries()) {
      const id = name.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/ +/g, '-');
      await tx.wellnessCategory.upsert({ where: { id }, create: { id, name, position }, update: {} });
    }
    for (const [index, item] of [{ name: 'DEMO Everyday Water Bottle', slug: 'demo-everyday-water-bottle', categoryId: 'daily-wellness', pricePaise: 35000, quantityLabel: '1 bottle · 500 ml', ingredients: 'DEMO material description: stainless steel.', usage: 'Sample catalogue copy: wash before use and follow the final manufacturer instructions.' },
      { name: 'DEMO Daily Reflection Journal', slug: 'demo-daily-reflection-journal', categoryId: 'stress-mental-wellness', pricePaise: 25000, quantityLabel: '1 journal · 80 pages', ingredients: 'DEMO material description: paper.', usage: 'Sample catalogue copy: a place to write your own daily reflections.' }].entries()) {
      const id = `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      const existing = await tx.wellnessProduct.findUnique({ where: { id } });
      if (existing && !existing.isDemo) throw new Error('Refusing to alter a real product.');
      await tx.wellnessProduct.upsert({ where: { id }, update: {}, create: { ...item, id, sku: `DEMO-WELLNESS-${index + 1}`, shortDescription: 'A sample everyday essential for interface testing. Not a real offer.', description: 'This clearly marked demonstration product is used to validate shopping, inventory and order screens. No real product, manufacturer claim or medical benefit is represented.',
        brand: 'DEMO collection', manufacturer: 'DEMO only; no real manufacturer represented', warnings: 'DEMO only. Do not treat sample catalogue information as product advice.', storage: 'Sample information only. Final storage instructions require catalogue review.',
        returnPolicy: 'DEMO policy: cancellation before processing; no goods are shipped. Real return terms must be approved before launch.', status: 'ACTIVE', shippingEligible: true, requiresEligibility: false, contentApproved: true,
        isDemo: true, featured: index === 0, collection: 'Everyday care', stockQuantity: 25 } });
    }
  });
  console.log('Two clearly marked, unrestricted DEMO wellness products seeded. Existing stock and orders were preserved.');
} finally { await database.close(); }
