import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generate/validate can run without credentials. Database commands still fail
  // unless an actual DATABASE_URL is supplied.
  datasource: { url: process.env.DATABASE_URL || 'postgresql://localhost:5432/pocket_doctor_unconfigured' },
});
