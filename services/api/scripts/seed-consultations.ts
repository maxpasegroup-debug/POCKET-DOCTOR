import 'dotenv/config';
import { createDatabase } from '../src/database/database.js';
import { readEnvironment } from '../src/config/env.js';

const env = readEnvironment();
if (!env.DATABASE_URL || env.DEMO_CONSULTATIONS !== 'true' || !['development', 'test'].includes(env.APP_ENV)) {
  throw new Error('Consultation seed requires an isolated development/test database and DEMO_CONSULTATIONS=true.');
}
const database = createDatabase(env.DATABASE_URL);
try {
  const db = database.client!;
  await db.$transaction(async tx => {
    const userId = '30000000-0000-4000-8000-000000000001';
    const doctorId = '20000000-0000-4000-8000-000000000001';
    // Fixed synthetic local identity. A conflicting existing phone fails rather
    // than escalating an arbitrary user's account to the doctor role.
    await tx.user.upsert({ where: { id: userId }, create: { id: userId, phone: '+919999900303', fullName: 'DEMO professional', profileCompletedAt: new Date(),
      roles: { create: [{ role: 'USER' }, { role: 'DOCTOR' }] } }, update: {} });
    const existing = await tx.doctor.findUnique({ where: { id: doctorId } });
    if (existing && !existing.isDemo) throw new Error('Refusing to modify a real doctor profile.');
    if (existing?.userId && existing.userId !== userId) throw new Error('Refusing to replace a doctor account assignment.');
    const doctor = await tx.doctor.upsert({ where: { id: doctorId }, create: { id: doctorId, name: 'DEMO professional profile', qualification: 'Not a real credential', specialty: 'Sample education profile', biography: 'Demonstration profile only. No real doctor or qualification is represented.', isDemo: true, userId,
      verificationStatus: 'VERIFIED', acceptingAppointments: true, languages: ['english', 'hindi'], feePaise: 50000, featured: true },
      update: existing?.userId ? {} : { userId, verificationStatus: 'VERIFIED', acceptingAppointments: true, languages: ['english', 'hindi'], feePaise: 50000, featured: true } });
    if (await tx.doctorAvailability.count({ where: { doctorId } }) === 0) await tx.doctorAvailability.createMany({ data: Array.from({ length: 7 }, (_, i) => [
      { doctorId: doctor.id, weekday: i + 1, startMinute: 540, endMinute: 780 },
      { doctorId: doctor.id, weekday: i + 1, startMinute: 900, endMinute: 1080 },
    ]).flat() });
  });
  console.log('Local DEMO doctor account ready: +919999900303. Request a random development OTP. No real credentials, verification or consultation is represented.');
} finally { await database.close(); }
