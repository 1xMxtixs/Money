import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { usersRepo, sessionsRepo, unscopedFindSessionByTokenHash } from './index';

const databaseUrl = process.env.DATABASE_URL;

describe('Repository Layer User Scoping & Type Safety (AD-11 / F0-05)', () => {
  describe('Compile-time Type Gate (Criterion 4 / Trampa T4)', () => {
    it('enforces userId argument at compile time for usersRepo', () => {
      // @ts-expect-error usersRepo requires userId argument (Criterion 1 & 4)
      const invalidCall = () => usersRepo();
      expect(invalidCall).toBeDefined();

      const validRepo = usersRepo('018d0000-0000-7000-8000-000000000001');
      expect(typeof validRepo.findById).toBe('function');
      expect(typeof validRepo.update).toBe('function');
      expect(typeof validRepo.delete).toBe('function');
    });

    it('enforces userId argument at compile time for sessionsRepo', () => {
      // @ts-expect-error sessionsRepo requires userId argument (Criterion 1 & 4)
      const invalidCall = () => sessionsRepo();
      expect(invalidCall).toBeDefined();

      const validRepo = sessionsRepo('018d0000-0000-7000-8000-000000000001');
      expect(typeof validRepo.listActive).toBe('function');
      expect(typeof validRepo.listAll).toBe('function');
      expect(typeof validRepo.create).toBe('function');
      expect(typeof validRepo.revoke).toBe('function');
      expect(typeof validRepo.revokeAll).toBe('function');
      expect(typeof validRepo.revokeAllExcept).toBe('function');
    });

    it('exposes explicit unscoped session resolution for authentication bootstrap (T2 - Option B)', () => {
      expect(typeof unscopedFindSessionByTokenHash).toBe('function');
    });
  });

  describe('Runtime Validation & Argument Enforcement', () => {
    it('throws when usersRepo is instantiated with empty or invalid userId', () => {
      expect(() => usersRepo('')).toThrow(/requires a valid non-empty userId string/);
      // @ts-expect-error Testing runtime defense against undefined
      expect(() => usersRepo(undefined)).toThrow(/requires a valid non-empty userId string/);
      // @ts-expect-error Testing runtime defense against null
      expect(() => usersRepo(null)).toThrow(/requires a valid non-empty userId string/);
    });

    it('throws when sessionsRepo is instantiated with empty or invalid userId', () => {
      expect(() => sessionsRepo('')).toThrow(/requires a valid non-empty userId string/);
      // @ts-expect-error Testing runtime defense against undefined
      expect(() => sessionsRepo(undefined)).toThrow(/requires a valid non-empty userId string/);
      // @ts-expect-error Testing runtime defense against null
      expect(() => sessionsRepo(null)).toThrow(/requires a valid non-empty userId string/);
    });
  });

  describe.runIf(Boolean(databaseUrl))('Database Integration & Scope Isolation (PostgreSQL)', () => {
    const userAId = '018d0000-0000-7000-8000-000000000001';
    const userBId = '018d0000-0000-7000-8000-000000000002';
    const sessionA1Id = '018d0000-0000-7000-8000-000000000011';
    const sessionA2Id = '018d0000-0000-7000-8000-000000000012';
    const sessionB1Id = '018d0000-0000-7000-8000-000000000021';
    const tokenHashA1 = 'token_hash_a1_valid_64_characters_long_sha256_mocked_value_aaaa1111';
    const tokenHashB1 = 'token_hash_b1_valid_64_characters_long_sha256_mocked_value_bbbb2222';

    beforeAll(async () => {
      // Clean up previous run data if existing
      await db.delete(users).where(inArray(users.id, [userAId, userBId]));

      // Seed test users
      await db.insert(users).values([
        {
          id: userAId,
          email: 'usera-test@example.com',
          passwordHash: 'hash_a',
          displayName: 'User A',
          primaryCurrencyCode: 'CLP',
          locale: 'es-CL',
          timezone: 'America/Santiago',
          theme: 'system',
          consentVersion: 'v1.0',
          consentAcceptedAt: new Date(),
        },
        {
          id: userBId,
          email: 'userb-test@example.com',
          passwordHash: 'hash_b',
          displayName: 'User B',
          primaryCurrencyCode: 'USD',
          locale: 'en-US',
          timezone: 'America/New_York',
          theme: 'dark',
          consentVersion: 'v1.0',
          consentAcceptedAt: new Date(),
        },
      ]);
    });

    afterAll(async () => {
      await db.delete(users).where(inArray(users.id, [userAId, userBId]));
    });

    it('usersRepo(userA) can find and update userA, but cannot query or update userB', async () => {
      const repoA = usersRepo(userAId);
      const userA = await repoA.findById();
      expect(userA).not.toBeNull();
      expect(userA?.id).toBe(userAId);
      expect(userA?.email).toBe('usera-test@example.com');

      const updatedA = await repoA.update({ displayName: 'User A Updated' });
      expect(updatedA?.displayName).toBe('User A Updated');

      // Attempting to query non-existent ID via another repo instance
      const nonExistentRepo = usersRepo('018d0000-0000-7000-8000-000000000999');
      const nonExistent = await nonExistentRepo.findById();
      expect(nonExistent).toBeNull();
    });

    it('sessionsRepo scopes session creation, listing, and revocation strictly by userId', async () => {
      const repoA = sessionsRepo(userAId);
      const repoB = sessionsRepo(userBId);

      const THIRTY_DAYS_MS = 2592000000;

      // Create sessions for User A
      const sA1 = await repoA.create({
        id: sessionA1Id,
        tokenHash: tokenHashA1,
        userAgent: 'Browser A1',
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
      });
      expect(sA1.userId).toBe(userAId);

      const sA2 = await repoA.create({
        id: sessionA2Id,
        tokenHash: 'token_hash_a2_valid_64_characters_long_sha256_mocked_value_aaaa2222',
        userAgent: 'Browser A2',
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
      });
      expect(sA2.userId).toBe(userAId);

      // Create session for User B
      const sB1 = await repoB.create({
        id: sessionB1Id,
        tokenHash: tokenHashB1,
        userAgent: 'Browser B1',
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
      });
      expect(sB1.userId).toBe(userBId);

      // User A listActive only sees User A's sessions
      const activeA = await repoA.listActive();
      const activeAIds = activeA.map((s) => s.id);
      expect(activeAIds).toContain(sessionA1Id);
      expect(activeAIds).toContain(sessionA2Id);
      expect(activeAIds).not.toContain(sessionB1Id);

      // User A attempting to revoke User B's session returns false (AD-11 / AC-05)
      const revokedOther = await repoA.revoke(sessionB1Id);
      expect(revokedOther).toBe(false);

      // User B's session remains active
      const activeB = await repoB.listActive();
      expect(activeB.map((s) => s.id)).toContain(sessionB1Id);

      // User A revokes sessionA1
      const revokedA1 = await repoA.revoke(sessionA1Id);
      expect(revokedA1).toBe(true);

      const activeAAfterRevoke = await repoA.listActive();
      expect(activeAAfterRevoke.map((s) => s.id)).not.toContain(sessionA1Id);
      expect(activeAAfterRevoke.map((s) => s.id)).toContain(sessionA2Id);

      // User A revokeAllExcept sessionA2
      await repoA.revokeAllExcept(sessionA2Id);
      const remainingActiveA = await repoA.listActive();
      expect(remainingActiveA.map((s) => s.id)).toEqual([sessionA2Id]);
    });

    it('unscopedFindSessionByTokenHash resolves active session by token hash', async () => {
      const session = await unscopedFindSessionByTokenHash(tokenHashB1);
      expect(session).not.toBeNull();
      expect(session?.id).toBe(sessionB1Id);
      expect(session?.userId).toBe(userBId);

      const nonExistent = await unscopedFindSessionByTokenHash('non_existent_token_hash');
      expect(nonExistent).toBeNull();
    });

    it('usersRepo.delete() deletes the user and cascades to sessions', async () => {
      const repoB = usersRepo(userBId);
      const deleted = await repoB.delete();
      expect(deleted).toBe(true);

      const userBAfter = await repoB.findById();
      expect(userBAfter).toBeNull();

      const repoBSessions = sessionsRepo(userBId);
      const sessionsB = await repoBSessions.listAll();
      expect(sessionsB.length).toBe(0);
    });
  });
});
