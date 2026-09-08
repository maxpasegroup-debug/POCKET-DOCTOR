import 'dotenv/config';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';
const env = readEnvironment();
if (!env.DATABASE_URL || env.PAYMENT_MODE !== 'development' || !['development', 'test'].includes(env.APP_ENV) || env.NODE_ENV === 'production') throw new Error('Membership seed requires an isolated development database and development payments.');
const database = createDatabase(env.DATABASE_URL); const db = database.client!;
try {
  const programs = await db.program.findMany({ where: { isDemo: true, published: true }, select: { id: true }, take: 2, orderBy: { id: 'asc' } });
  const doctors = await db.doctor.findMany({ where: { isDemo: true }, select: { id: true }, take: 2, orderBy: { id: 'asc' } });
  const products = await db.wellnessProduct.findMany({ where: { isDemo: true, contentApproved: true, status: 'ACTIVE' }, select: { id: true }, take: 2, orderBy: { id: 'asc' } });
  const benefits = [
    ...(programs.length ? [{ key: 'PROGRAM_ACCESS', label: 'Access to selected DEMO learning programs', resourceIds: programs.map(p => p.id), value: 0 }] : []),
    ...(doctors.length ? [{ key: 'CONSULTATION_DISCOUNT', label: '10% off selected DEMO consultation fees', resourceIds: doctors.map(p => p.id), value: 10 }] : []),
    ...(products.length ? [{ key: 'WELLNESS_MEMBER_PRICING', label: '10% off selected DEMO wellness products at checkout', resourceIds: products.map(p => p.id), value: 10 }] : []),
    { key: 'AI_WELLNESS_FEATURES', label: '50 additional daily assistant requests in this demo', resourceIds: [], value: 50 },
  ];
  for (const interval of ['MONTH', 'YEAR'] as const) {
    const slug = `demo-pocket-doctor-plus-${interval.toLowerCase()}`;
    await db.membershipPlan.upsert({ where: { slug }, create: { slug, name: 'Pocket Doctor Plus · DEMO', description: 'Explore how optional membership connects your learning, support and wellness space. Demo prices are not a commercial offer.', pricePaise: interval === 'MONTH' ? 19900 : 199000, interval, active: true, isDemo: true, trialDays: 7, benefits: { create: benefits } }, update: {} });
  }
  console.log('DEMO membership plans ready. Prices are test configuration, not a published commercial offer.');
} finally { await database.close(); }
