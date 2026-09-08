import 'dotenv/config';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';

export async function seedPrograms() {
  const env = readEnvironment();
  if (env.DEMO_PROGRAMS !== 'true' || !['development', 'test'].includes(env.APP_ENV) || !env.DATABASE_URL) {
    throw new Error('Demo seed requires an isolated development/test database and DEMO_PROGRAMS=true.');
  }
  const database = createDatabase(env.DATABASE_URL);
  const db = database.client!;
  try {
    const categories = ['Weight Management', 'Diabetes & Lifestyle', 'Mental Wellness', 'Nutrition', 'Sleep', 'Fitness',
      "Women's Health", "Men's Health", 'Preventive Wellness', 'Heart Health', 'Family Health', 'Stress Management'];
    for (const [position, name] of categories.entries()) {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await db.programCategory.upsert({ where: { id }, create: { id, name, position,
        interest: name === 'Diabetes & Lifestyle' ? 'Diabetes & Lifestyle Health' : name }, update: {} });
    }
    const doctorId = '20000000-0000-4000-8000-000000000001';
    await db.doctor.upsert({ where: { id: doctorId }, create: { id: doctorId, name: 'DEMO professional profile',
      qualification: 'Not a real credential', specialty: 'Sample education profile', biography: 'Demonstration profile only. No real doctor or qualification is represented.', isDemo: true }, update: {} });
    const samples = [
      { id: '20000000-0000-4000-8000-000000000011', title: 'Weight Management: a learning journey', categoryId: 'weight-management', type: 'RECORDED' as const, pricePaise: 0 },
      { id: '20000000-0000-4000-8000-000000000012', title: 'Diabetes & Lifestyle: foundations', categoryId: 'diabetes-lifestyle', type: 'RECORDED' as const, pricePaise: 49900 },
      { id: '20000000-0000-4000-8000-000000000013', title: 'Weight & Wellness: live conversations', categoryId: 'weight-management', type: 'LIVE' as const, pricePaise: 0 },
    ];
    for (const sample of samples) {
      if (await db.program.findUnique({ where: { id: sample.id } })) continue;
      await db.program.create({ data: { ...sample, doctorId, isDemo: true, published: true, featured: true, durationMinutes: sample.type === 'LIVE' ? 60 : 10,
        description: 'DEMO content for testing the learning experience. This is not a published health program.',
        audience: 'People exploring how structured health education will work in Pocket Doctor.',
        outcomes: ['Explore a structured learning journey', 'Practice using lessons and saved progress'],
        ...(sample.type === 'RECORDED' ? { modules: { create: [{ title: 'Getting started', position: 1, lessons: { create: [
          { title: 'Welcome to your learning space', description: 'DEMO playback test. The sample nature clip is not medical education.', position: 1, durationSeconds: 5, mediaRef: 'demo:bee',
            keyPoints: ['This sample demonstrates video controls.', 'Your lesson position can be saved.'], supportingMaterial: 'Demo reflection: what would you like to learn from a professionally reviewed program?' },
          { title: 'Reflect and continue', description: 'DEMO reading lesson. Future content will be reviewed by qualified professionals.', position: 2, durationSeconds: 60,
            keyPoints: ['Education does not replace personal medical advice.', 'Discuss personal medical decisions with a qualified healthcare professional.'], supportingMaterial: 'Use this space to reflect privately. No response is collected.' },
        ] } }] } } : { liveSessions: { create: [{ title: 'DEMO live introduction', startsAt: new Date(Date.now() + 7 * 86400000), durationMinutes: 60,
          information: 'This is a demonstration schedule. No real session will take place. Provider access will be added before live programs launch.' }] } }),
      } });
    }
    console.log('Three clearly labelled demo programs are ready. No real credentials or medical courses were created.');
  } finally { await database.close(); }
}
await seedPrograms();
