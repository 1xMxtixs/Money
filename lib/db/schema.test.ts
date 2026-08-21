import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;

describe('Database Schema & Initial Migration (F0-04)', () => {
  let client: Client;
  const testSchemaName = `test_f0_04_${Date.now()}`;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is not set in environment variables. Integration tests require a valid PostgreSQL instance.'
      );
    }

    client = new Client({ connectionString: databaseUrl });
    await client.connect();

    // 1. Create and bind dedicated schema for this isolated test run
    await client.query(`CREATE SCHEMA ${testSchemaName}`);
    await client.query(`SET search_path TO ${testSchemaName}`);

    // 2. Read and apply the initial migration file
    const migrationPath = path.resolve(process.cwd(), 'drizzle/0000_init.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await client.query(statement);
    }
  });

  afterAll(async () => {
    if (client) {
      try {
        await client.query(`DROP SCHEMA IF EXISTS ${testSchemaName} CASCADE`);
      } catch (err) {
        console.error('Failed to clean up test schema:', err);
      } finally {
        await client.end();
      }
    }
  });

  it('verifies that all five initial tables exist in the schema', async () => {
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = '${testSchemaName}'
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map((r) => r.table_name);
    expect(tableNames).toEqual([
      'currencies',
      'invitations',
      'password_reset_tokens',
      'sessions',
      'users',
    ]);
  });

  it('verifies constraints, checks, and foreign keys as defined in Document 4 §12', async () => {
    const res = await client.query(`
      SELECT conname, contype, relname
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = '${testSchemaName}'
      ORDER BY conname;
    `);

    const constraintNames = res.rows.map((r) => r.conname);

    // Domain checks and unique constraints
    expect(constraintNames).toContain('currencies_decimals_check');
    expect(constraintNames).toContain('users_email_len_check');
    expect(constraintNames).toContain('users_display_name_len_check');
    expect(constraintNames).toContain('users_locale_check');
    expect(constraintNames).toContain('users_theme_check');
    expect(constraintNames).toContain('users_id_primary_currency_code_key');
    expect(constraintNames).toContain('sessions_user_agent_len_check');
    expect(constraintNames).toContain('sessions_token_hash_unique');
    expect(constraintNames).toContain('invitations_invited_email_len_check');
    expect(constraintNames).toContain('invitations_redeemed_check');
    expect(constraintNames).toContain('password_reset_tokens_token_hash_unique');

    // Foreign Keys
    expect(constraintNames).toContain('users_primary_currency_code_currencies_code_fk');
    expect(constraintNames).toContain('sessions_user_id_users_id_fk');
    expect(constraintNames).toContain('invitations_redeemed_by_users_id_fk');
    expect(constraintNames).toContain('password_reset_tokens_user_id_users_id_fk');
  });

  it('verifies indexes including expression and partial indexes', async () => {
    const res = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = '${testSchemaName}'
      ORDER BY indexname;
    `);

    const indexMap = new Map(res.rows.map((r) => [r.indexname, r.indexdef]));

    expect(indexMap.has('uq_users_email')).toBe(true);
    expect(indexMap.get('uq_users_email')).toContain('lower(email)');

    expect(indexMap.has('idx_sessions_user')).toBe(true);
    expect(indexMap.get('idx_sessions_user')).toContain('WHERE (revoked_at IS NULL)');

    expect(indexMap.has('idx_sessions_expiry')).toBe(true);

    expect(indexMap.has('uq_invitations_code')).toBe(true);

    expect(indexMap.has('idx_prt_user')).toBe(true);
    expect(indexMap.get('idx_prt_user')).toContain('WHERE (used_at IS NULL)');
  });

  it('verifies touch_updated_at trigger automatically updates updated_at on users', async () => {
    // 1. Seed base currency
    await client.query(`
      INSERT INTO currencies (code, decimals, symbol, name)
      VALUES ('CLP', 0, '$', 'Peso chileno')
      ON CONFLICT (code) DO NOTHING;
    `);

    // 2. Insert user with fixed past timestamp
    const userId = '018d0000-0000-7000-8000-000000000001';
    const pastTime = new Date(Date.now() - 60000).toISOString();

    await client.query(`
      INSERT INTO users (
        id, email, password_hash, display_name, primary_currency_code,
        locale, timezone, theme, consent_version, consent_accepted_at,
        created_at, updated_at
      ) VALUES (
        '${userId}', 'test-trigger@example.com', 'dummy_hash', 'Initial Name', 'CLP',
        'es-CL', 'America/Santiago', 'system', 'v1.0', now(),
        '${pastTime}', '${pastTime}'
      );
    `);

    const beforeRes = await client.query(`SELECT updated_at FROM users WHERE id = '${userId}';`);
    const beforeUpdatedAt = new Date(beforeRes.rows[0].updated_at).getTime();

    // 3. Perform update without touching updated_at
    await client.query(`UPDATE users SET display_name = 'Updated Name' WHERE id = '${userId}';`);

    const afterRes = await client.query(`SELECT updated_at, display_name FROM users WHERE id = '${userId}';`);
    const afterUpdatedAt = new Date(afterRes.rows[0].updated_at).getTime();

    expect(afterRes.rows[0].display_name).toBe('Updated Name');
    expect(afterUpdatedAt).toBeGreaterThan(beforeUpdatedAt);
  });

  it('verifies CR-01: one-sided check rejects redeemed_by without redeemed_at, but allows user deletion with ON DELETE SET NULL', async () => {
    const testUserId = '018d0000-0000-7000-8000-000000000002';
    const invalidInvId = '018d0000-0000-7000-8000-00000000000a';
    const validInvId = '018d0000-0000-7000-8000-00000000000b';
    const sessionId = '018d0000-0000-7000-8000-000000000003';
    const prtId = '018d0000-0000-7000-8000-000000000004';

    // 1. Insert user
    await client.query(`
      INSERT INTO users (
        id, email, password_hash, display_name, primary_currency_code,
        locale, timezone, theme, consent_version, consent_accepted_at
      ) VALUES (
        '${testUserId}', 'cr01-user@example.com', 'dummy_hash', 'CR01 User', 'CLP',
        'es-CL', 'America/Santiago', 'system', 'v1.0', now()
      );
    `);

    // 2. Verify invalid state (redeemed_by NOT NULL, redeemed_at NULL) is rejected by invitations_redeemed_check
    await expect(
      client.query(`
        INSERT INTO invitations (
          id, code_hash, invited_email, expires_at, redeemed_by, redeemed_at
        ) VALUES (
          '${invalidInvId}', 'invalid_inv_hash', 'cr01-user@example.com',
          now() + interval '7 days', '${testUserId}', NULL
        );
      `)
    ).rejects.toThrow(/invitations_redeemed_check/);

    // 3. Insert valid redeemed invitation
    await client.query(`
      INSERT INTO invitations (
        id, code_hash, invited_email, expires_at, redeemed_by, redeemed_at
      ) VALUES (
        '${validInvId}', 'valid_inv_hash', 'cr01-user@example.com',
        now() + interval '7 days', '${testUserId}', now()
      );
    `);

    // 4. Insert session and password reset token
    await client.query(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at)
      VALUES ('${sessionId}', '${testUserId}', 'cr01_session_hash', now() + interval '30 days');
    `);

    await client.query(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
      VALUES ('${prtId}', '${testUserId}', 'cr01_prt_hash', now() + interval '1 hour');
    `);

    // 5. Execute DELETE FROM users (must succeed without constraint violation)
    await client.query(`DELETE FROM users WHERE id = '${testUserId}';`);

    // 6. Verify cascading cleanup and invitation orphan preservation
    const userCheck = await client.query(`SELECT count(*) FROM users WHERE id = '${testUserId}';`);
    expect(Number(userCheck.rows[0].count)).toBe(0);

    const sessionCheck = await client.query(`SELECT count(*) FROM sessions WHERE user_id = '${testUserId}';`);
    expect(Number(sessionCheck.rows[0].count)).toBe(0);

    const prtCheck = await client.query(`SELECT count(*) FROM password_reset_tokens WHERE user_id = '${testUserId}';`);
    expect(Number(prtCheck.rows[0].count)).toBe(0);

    const invCheck = await client.query(`SELECT id, redeemed_by, redeemed_at FROM invitations WHERE id = '${validInvId}';`);
    expect(invCheck.rows.length).toBe(1);
    expect(invCheck.rows[0].redeemed_by).toBeNull();
    expect(invCheck.rows[0].redeemed_at).not.toBeNull();
  });

  it('verifies seed data for CLP (0 decimals) and USD (2 decimals)', async () => {
    await client.query(`
      INSERT INTO currencies (code, decimals, symbol, name)
      VALUES
        ('CLP', 0, '$', 'Peso chileno'),
        ('USD', 2, '$', 'Dólar estadounidense')
      ON CONFLICT (code) DO UPDATE
      SET decimals = EXCLUDED.decimals, symbol = EXCLUDED.symbol, name = EXCLUDED.name;
    `);

    const res = await client.query(`
      SELECT code, decimals, symbol, name
      FROM currencies
      WHERE code IN ('CLP', 'USD')
      ORDER BY code;
    `);

    expect(res.rows).toEqual([
      { code: 'CLP', decimals: 0, symbol: '$', name: 'Peso chileno' },
      { code: 'USD', decimals: 2, symbol: '$', name: 'Dólar estadounidense' },
    ]);
  });
});
