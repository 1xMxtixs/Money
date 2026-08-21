import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { getPoolDb } from '../lib/db';

export async function runMigrations() {
  const db = getPoolDb();
  console.log('Running database migrations from ./drizzle...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('✓ Migrations applied successfully.');
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}
