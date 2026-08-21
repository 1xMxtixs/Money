import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { migrate as migrateNeon } from 'drizzle-orm/neon-serverless/migrator';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import ws from 'ws';

if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

export async function runMigrations() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured in environment variables.');
  }

  console.log('Running database migrations from ./drizzle...');

  if (url.includes('neon.tech')) {
    const pool = new NeonPool({ connectionString: url });
    const db = drizzleWs({ client: pool });
    await migrateNeon(db, { migrationsFolder: './drizzle' });
    await pool.end();
  } else {
    const pool = new PgPool({ connectionString: url });
    const db = drizzleNodePg({ client: pool });
    await migrateNodePg(db, { migrationsFolder: './drizzle' });
    await pool.end();
  }

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
