import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { getPoolDb, schema } from '../lib/db';
import { SUPPORTED_CURRENCIES } from '../lib/domain/money/currencies';

export const DEFAULT_CURRENCIES = SUPPORTED_CURRENCIES;

export async function seed() {
  const db = getPoolDb();
  console.log('Seeding initial currencies (CLP, USD)...');

  for (const curr of DEFAULT_CURRENCIES) {
    await db
      .insert(schema.currencies)
      .values(curr)
      .onConflictDoUpdate({
        target: schema.currencies.code,
        set: {
          decimals: curr.decimals,
          symbol: curr.symbol,
          name: curr.name,
        },
      });
  }

  console.log('✓ Seeding complete.');
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seed failed:', err);
      process.exit(1);
    });
}
