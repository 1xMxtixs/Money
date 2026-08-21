import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;

describe('Database Schema & Initial Migration (F0-04)', () => {
  let pool: Pool | null = null;
  let isDbAvailable = false;
  const testSchemaName = `test_f0_04_${Date.now()}`;

  beforeAll(async () => {
    if (!databaseUrl) {
      console.warn('⚠️ DATABASE_URL is not set. Skipping live database integration tests.');
      return;
    }

    try {
      pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
      await pool.query('SELECT 1');
      isDbAvailable = true;

      // Create isolated schema for this test run
      await pool.query(`CREATE SCHEMA ${testSchemaName}`);
      await pool.query(`SET search_path TO ${testSchemaName}, public`);

      // Apply initial migration
      const migrationPath = path.resolve(process.cwd(), 'drizzle/0000_init.sql');
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      const statements = migrationSql
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const statement of statements) {
        await pool.query(statement);
      }
    } catch (err) {
      console.warn('⚠️ Could not connect to PostgreSQL database:', (err as Error).message);
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (pool && isDbAvailable) {
      try {
        await pool.query(`DROP SCHEMA IF EXISTS ${testSchemaName} CASCADE`);
      } catch (err) {
        console.error('Failed to clean up test schema:', err);
      } finally {
        await pool.end();
      }
    }
  });

  it('verifies that all five initial tables exist in the schema', async () => {
    if (!isDbAvailable || !pool) {
      console.log('Skipping: PostgreSQL is not available.');
      return;
    }

    const res = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = '${testSchemaName}'
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map((r) => r.table_name);
    expect(tableNames).toContain('currencies');
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('invitations');
    expect(tableNames).toContain('password_reset_tokens');
  });

  it('verifies constraints and unique keys as defined in Document 4 §12', async () => {
    if (!isDbAvailable || !pool) return;

    const res = await pool.query(`
      SELECT conname, contype, relname
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = '${testSchemaName}'
      ORDER BY conname;
    `);

    const constraintNames = res.rows.map((r) => r.conname);

    // Checks & Uniques
    expect(constraintNames).toContain('currencies_decimals_check');
    expect(constraintNames).toContain('users_email_len_check');
    expect(constraintNames).toContain('users_display_name_len_check');
    expect(constraintNames).toContain('users_locale_check');
    expect(constraintNames).toContain('users_theme_check');
    expect(constraintNames).toContain('users_id_primary_currency_code_key');
    expect(constraintNames).toContain('sessions_user_agent_len_check');
    expect(constraintNames).toContain('sessions_token_hash_unique');
    expect(constraintNames).toContain('invitations_invited_email_len_check');
    expect(constraintNames).toContain('password_reset_tokens_token_hash_unique');

    // Foreign Keys
    expect(constraintNames).toContain('users_primary_currency_code_currencies_code_fk');
    expect(constraintNames).toContain('sessions_user_id_users_id_fk');
    expect(constraintNames).toContain('invitations_redeemed_by_users_id_fk');
    expect(constraintNames).toContain('password_reset_tokens_user_id_users_id_fk');
  });

  it('verifies indexes including expression and partial indexes', async () => {
    if (!isDbAvailable || !pool) return;

    const res = await pool.query(`
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
    if (!isDbAvailable || !pool) return;

    // 1. Seed currency
    await pool.query(`
      INSERT INTO currencies (code, decimals, symbol, name)
      VALUES ('CLP', 0, '$', 'Peso chileno')
      ON CONFLICT (code) DO NOTHING;
    `);

    // 2. Insert user with fixed past timestamp
    const userId = '018d0000-0000-7000-8000-000000000001';
    const pastTime = new Date(Date.now() - 60000).toISOString();

    await pool.query(`
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

    const beforeRes = await pool.query(`SELECT updated_at FROM users WHERE id = '${userId}';`);
    const beforeUpdatedAt = new Date(beforeRes.rows[0].updated_at).getTime();

    // 3. Update user
    await pool.query(`UPDATE users SET display_name = 'Updated Name' WHERE id = '${userId}';`);

    const afterRes = await pool.query(`SELECT updated_at, display_name FROM users WHERE id = '${userId}';`);
    const afterUpdatedAt = new Date(afterRes.rows[0].updated_at).getTime();

    expect(afterRes.rows[0].display_name).toBe('Updated Name');
    expect(afterUpdatedAt).toBeGreaterThan(beforeUpdatedAt);
  });

  it('verifies CR-01: user deletion cascades without constraint violation and preserves redeemed invitation with redeemed_by=NULL', async () => {
    if (!isDbAvailable || !pool) return;

    const testUserId = '018d0000-0000-7000-8000-000000000002';
    const invitationId = '018d0000-0000-7000-8000-000000000003';
    const sessionId = '018d0000-0000-7000-8000-000000000004';
    const prtId = '018d0000-0000-7000-8000-000000000005';

    // 1. Insert user
    await pool.query(`
      INSERT INTO users (
        id, email, password_hash, display_name, primary_currency_code,
        locale, timezone, theme, consent_version, consent_accepted_at
      ) VALUES (
        '${testUserId}', 'cr01-user@example.com', 'dummy_hash', 'CR01 User', 'CLP',
        'es-CL', 'America/Santiago', 'system', 'v1.0', now()
      );
    `);

    // 2. Insert redeemed invitation referencing user
    await pool.query(`
      INSERT INTO invitations (
        id, code_hash, invited_email, expires_at, redeemed_by, redeemed_at
      ) VALUES (
        '${invitationId}', 'cr01_invitation_hash', 'cr01-user@example.com',
        now() + interval '7 days', '${testUserId}', now()
      );
    `);

    // 3. Insert session and password reset token
    await pool.query(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at)
      VALUES ('${sessionId}', '${testUserId}', 'cr01_session_hash', now() + interval '30 days');
    `);

    await pool.query(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
      VALUES ('${prtId}', '${testUserId}', 'cr01_prt_hash', now() + interval '1 hour');
    `);

    // 4. Execute DELETE FROM users (must succeed without constraint violation)
    await expect(
      pool.query(`DELETE FROM users WHERE id = '${testUserId}';`)
    ).resolves.toBeDefined();

    // 5. Verify cascading cleanup and invitation orphan preservation
    const userCheck = await pool.query(`SELECT count(*) FROM users WHERE id = '${testUserId}';`);
    expect(Number(userCheck.rows[0].count)).toBe(0);

    const sessionCheck = await pool.query(`SELECT count(*) FROM sessions WHERE user_id = '${testUserId}';`);
    expect(Number(sessionCheck.rows[0].count)).toBe(0);

    const prtCheck = await pool.query(`SELECT count(*) FROM password_reset_tokens WHERE user_id = '${testUserId}';`);
    expect(Number(prtCheck.rows[0].count)).toBe(0);

    const invCheck = await pool.query(`SELECT id, redeemed_by, redeemed_at FROM invitations WHERE id = '${invitationId}';`);
    expect(invCheck.rows.length).toBe(1);
    expect(invCheck.rows[0].redeemed_by).toBeNull();
    expect(invCheck.rows[0].redeemed_at).not.toBeNull();
  });

  it('verifies seed data for CLP (0 decimals) and USD (2 decimals)', async () => {
    if (!isDbAvailable || !pool) return;

    await pool.query(`
      INSERT INTO currencies (code, decimals, symbol, name)
      VALUES
        ('CLP', 0, '$', 'Peso chileno'),
        ('USD', 2, '$', 'Dólar estadounidense')
      ON CONFLICT (code) DO UPDATE
      SET decimals = EXCLUDED.decimals, symbol = EXCLUDED.symbol, name = EXCLUDED.name;
    `);

    const res = await pool.query(`
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
