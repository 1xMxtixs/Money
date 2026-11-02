import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { inArray, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, sessions } from '@/lib/db/schema';
import { uuidv7 } from '@/lib/domain/id/uuidv7';
import {
  createSession,
  resolveSession,
  rotateSession,
  buildSessionCookie,
} from '@/lib/auth/session';
import { sessionsRepo, unscopedFindSessionByTokenHash } from './sessions';

// Wraps the real repo so tests can count touch() invocations without changing behavior.
const touchSpy = vi.hoisted(() => vi.fn());
vi.mock('./sessions', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./sessions')>();
  return {
    ...mod,
    sessionsRepo: (id: string) => {
      const repo = mod.sessionsRepo(id);
      return {
        ...repo,
        touch: (sessionId: string) => {
          touchSpy(sessionId);
          return repo.touch(sessionId);
        },
      };
    },
  };
});

const databaseUrl = process.env.DATABASE_URL;
const ONE_DAY_MS = 86_400_000;
const TWENTY_NINE_DAYS_MS = 29 * ONE_DAY_MS;

describe('sessionsRepo Unit & Argument Enforcement', () => {
  it('throws when sessionsRepo is instantiated with empty or invalid userId', () => {
    expect(() => sessionsRepo('')).toThrow(/requires a valid non-empty userId string/);
    // @ts-expect-error Testing runtime defense against undefined
    expect(() => sessionsRepo(undefined)).toThrow(/requires a valid non-empty userId string/);
    // @ts-expect-error Testing runtime defense against null
    expect(() => sessionsRepo(null)).toThrow(/requires a valid non-empty userId string/);
  });
});

describe('Opaque Sessions & Repository PostgreSQL Integration Tests', () => {
  const userAId = '018d0000-0000-7000-8000-0000000001a1';
  const userBId = '018d0000-0000-7000-8000-0000000001b1';

  beforeEach(() => {
    // Infrastructure-dependent tests FAIL (never skip) when the infrastructure is missing.
    // Checked per test (not in beforeAll) because vitest reports tests as "skipped" when beforeAll throws.
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is not set in environment variables. Integration tests require a valid PostgreSQL instance.'
      );
    }
    touchSpy.mockClear();
  });

  beforeAll(async () => {
    if (!databaseUrl) return;
    await db.delete(users).where(inArray(users.id, [userAId, userBId]));

    await db.insert(users).values([
      {
        id: userAId,
        email: 'repos-session-a@example.com',
        passwordHash: 'dummy_hash_a',
        displayName: 'User A Repos',
        primaryCurrencyCode: 'CLP',
        locale: 'es-CL',
        timezone: 'America/Santiago',
        theme: 'system',
        consentVersion: 'v1.0',
        consentAcceptedAt: new Date(),
      },
      {
        id: userBId,
        email: 'repos-session-b@example.com',
        passwordHash: 'dummy_hash_b',
        displayName: 'User B Repos',
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
    if (!databaseUrl) return;
    await db.delete(users).where(inArray(users.id, [userAId, userBId]));
  });

  it('createSession persists ONLY sha256(token) in hex and never stores cleartext token in DB', async () => {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestBrowser/1.0';
    const { token, session, cookie } = await createSession(userAId, userAgent);

    expect(token).toBeDefined();
    expect(token.length).toBe(43);
    expect(session.userId).toBe(userAId);
    expect(cookie).toBe(buildSessionCookie(token));

    // Verify row directly in database
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id));

    expect(row).toBeDefined();
    const expectedHash = crypto.createHash('sha256').update(token).digest('hex');
    expect(row.tokenHash).toBe(expectedHash);

    // Verify that NO column in the database row contains the cleartext token
    expect(row.tokenHash).not.toBe(token);
    expect(row.id).not.toBe(token);
    expect(row.userId).not.toBe(token);
    expect(row.userAgent).toBe(userAgent);
    expect(row.userAgent).not.toContain(token);
  });

  it('truncates user_agent to 255 chars before insert and stores null if empty or missing', async () => {
    // 1. Long user agent (> 255 characters)
    const longUserAgent = 'A'.repeat(300);
    const { session: longSession } = await createSession(userAId, longUserAgent);
    expect(longSession.userAgent?.length).toBe(255);
    expect(longSession.userAgent).toBe('A'.repeat(255));

    // 2. Null user agent
    const { session: nullSession } = await createSession(userAId, null);
    expect(nullSession.userAgent).toBeNull();

    // 3. Empty string / whitespace user agent
    const { session: emptySession } = await createSession(userAId, '   ');
    expect(emptySession.userAgent).toBeNull();
  });

  it('revoking a session causes resolveSession to return null immediately on next call', async () => {
    const { token, session } = await createSession(userAId, 'Revocation Test Browser');

    // Initially resolves successfully
    const resolvedBefore = await resolveSession(token);
    expect(resolvedBefore).not.toBeNull();
    expect(resolvedBefore?.session.id).toBe(session.id);

    // Revoke the session via repository
    const revoked = await sessionsRepo(userAId).revoke(session.id);
    expect(revoked).toBe(true);

    // Subsequent resolution must return null
    const resolvedAfter = await resolveSession(token);
    expect(resolvedAfter).toBeNull();
  });

  it('returns null when session expires_at is in the past (using database clock)', async () => {
    const { token, session } = await createSession(userAId, 'Expiry Test Browser');

    // Force expires_at into the past directly in the database
    await db
      .update(sessions)
      .set({ expiresAt: sql`now() - interval '1 hour'` })
      .where(eq(sessions.id, session.id));

    const resolved = await resolveSession(token);
    expect(resolved).toBeNull();
  });

  it('sliding expiry: last_seen_at < 15 min produces no update, but > 15 min extends expires_at and emits refreshedCookie', async () => {
    const { token, session } = await createSession(userAId, 'Sliding Expiry Browser');

    // Case 1: last_seen_at is 5 minutes ago (within 15-minute throttle)
    await db
      .update(sessions)
      .set({
        lastSeenAt: sql`now() - interval '5 minutes'`,
        expiresAt: sql`now() + interval '20 days'`,
      })
      .where(eq(sessions.id, session.id));

    const [beforeTouch] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id));

    const result5Min = await resolveSession(token);
    expect(result5Min).not.toBeNull();
    expect(result5Min?.refreshedCookie).toBeUndefined();
    // JS pre-check must skip the extra round-trip entirely (RNF-RE-05)
    expect(touchSpy).toHaveBeenCalledTimes(0);

    const [afterTouch5Min] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id));

    // Timestamps must NOT have changed
    expect(afterTouch5Min.lastSeenAt.getTime()).toBe(beforeTouch.lastSeenAt.getTime());
    expect(afterTouch5Min.expiresAt.getTime()).toBe(beforeTouch.expiresAt.getTime());

    // Case 2: last_seen_at is 20 minutes ago (> 15 minutes throttle elapsed)
    await db
      .update(sessions)
      .set({
        lastSeenAt: sql`now() - interval '20 minutes'`,
        expiresAt: sql`now() + interval '10 days'`,
      })
      .where(eq(sessions.id, session.id));

    const result20Min = await resolveSession(token);
    expect(result20Min).not.toBeNull();
    // Must re-emit cookie with full 30-day Max-Age
    expect(result20Min?.refreshedCookie).toBe(buildSessionCookie(token));

    const [afterTouch20Min] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id));

    // Database expires_at must be extended to ~30 days in the future
    const expectedExpiryMinMs = Date.now() + TWENTY_NINE_DAYS_MS;
    expect(afterTouch20Min.expiresAt.getTime()).toBeGreaterThan(expectedExpiryMinMs);
    expect(afterTouch20Min.lastSeenAt.getTime()).toBeGreaterThan(beforeTouch.lastSeenAt.getTime());
  });

  it('rotateSession revokes old session and activates new session in atomic transaction; fails atomically', async () => {
    const { token: oldToken, session: oldSession } = await createSession(
      userAId,
      'Old Rotating Browser'
    );

    // Rotate session
    const { token: newToken, session: newSession, cookie } = await rotateSession(
      userAId,
      oldSession.id,
      'New Rotated Browser'
    );

    expect(newToken).not.toBe(oldToken);
    expect(newSession.id).not.toBe(oldSession.id);
    expect(cookie).toBe(buildSessionCookie(newToken));

    // Old token must now be revoked
    const resolvedOld = await resolveSession(oldToken);
    expect(resolvedOld).toBeNull();

    // New token resolves active session
    const resolvedNew = await resolveSession(newToken);
    expect(resolvedNew).not.toBeNull();
    expect(resolvedNew?.session.id).toBe(newSession.id);

    // Rotating an already revoked session fails and leaves the new session intact
    await expect(
      rotateSession(userAId, oldSession.id, 'Failure Browser')
    ).rejects.toThrow();

    const activeSessions = await sessionsRepo(userAId).listActive();
    const activeIds = activeSessions.map((s) => s.id);
    expect(activeIds).toContain(newSession.id);
    expect(activeIds).not.toContain(oldSession.id);
  });

  it('rotate rolls back the revoke when the INSERT fails after the UPDATE succeeded', async () => {
    const { token: oldToken, session: oldSession } = await createSession(userAId, 'Rollback Old');
    const { session: other } = await createSession(userAId, 'Rollback Collision');

    // The UPDATE revokes oldSession, then the INSERT collides with an existing PK.
    await expect(
      sessionsRepo(userAId).rotate(oldSession.id, {
        id: other.id,
        tokenHash: crypto.randomBytes(32).toString('hex'),
      })
    ).rejects.toThrow();

    // Without a real transaction the revoke would persist and this would be null.
    const resolved = await resolveSession(oldToken);
    expect(resolved).not.toBeNull();
    expect(resolved?.session.id).toBe(oldSession.id);
  });

  it('touch does not resurrect an expired session', async () => {
    const { session } = await createSession(userAId, 'Expired Touch');
    await db
      .update(sessions)
      .set({
        expiresAt: sql`now() - interval '1 minute'`,
        lastSeenAt: sql`now() - interval '20 minutes'`,
      })
      .where(eq(sessions.id, session.id));

    expect(await sessionsRepo(userAId).touch(session.id)).toBeNull();

    const [row] = await db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(row.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('isolation: userB cannot revoke userA session and userA session remains active', async () => {
    const { token: tokenA, session: sessionA } = await createSession(userAId, 'User A Browser');

    // User B attempts to revoke User A's session
    const revokeResult = await sessionsRepo(userBId).revoke(sessionA.id);
    expect(revokeResult).toBe(false);

    // User A session must remain completely active and valid
    const resolvedA = await resolveSession(tokenA);
    expect(resolvedA).not.toBeNull();
    expect(resolvedA?.session.id).toBe(sessionA.id);
  });

  it('create sets default expiresAt (sql`now() + interval "30 days"`) when omitted', async () => {
    const repoA = sessionsRepo(userAId);
    const sessionId = uuidv7();
    const tokenHash = 'repos_token_hash_default_expiry_test_12345678901234567890123456789012';

    const session = await repoA.create({
      id: sessionId,
      tokenHash,
      userAgent: 'Test Agent',
    });

    expect(session.id).toBe(sessionId);
    expect(session.userId).toBe(userAId);
    expect(session.expiresAt).toBeInstanceOf(Date);

    // Verify expiresAt is ~30 days in the future
    const expectedMinMs = Date.now() + TWENTY_NINE_DAYS_MS;
    expect(session.expiresAt.getTime()).toBeGreaterThan(expectedMinMs);
  });

  it('listActive filters expired sessions using sql`now()` and excludes revoked sessions', async () => {
    const repoA = sessionsRepo(userAId);
    const activeId = uuidv7();
    const expiredId = uuidv7();
    const revokedId = uuidv7();

    // 1. Active session
    await repoA.create({
      id: activeId,
      tokenHash: 'hash_active_list_test_12345678901234567890123456789012345678901234',
      userAgent: 'Active Browser',
    });

    // 2. Expired session (expires_at in past)
    await repoA.create({
      id: expiredId,
      tokenHash: 'hash_expired_list_test_1234567890123456789012345678901234567890123',
      expiresAt: new Date(Date.now() - 60000),
    });

    // 3. Revoked session
    const revokedSession = await repoA.create({
      id: revokedId,
      tokenHash: 'hash_revoked_list_test_1234567890123456789012345678901234567890123',
    });
    await repoA.revoke(revokedSession.id);

    const activeList = await repoA.listActive();
    const activeIds = activeList.map((s) => s.id);

    expect(activeIds).toContain(activeId);
    expect(activeIds).not.toContain(expiredId);
    expect(activeIds).not.toContain(revokedId);
  });

  it('unscopedFindSessionByTokenHash evaluates expires_at > sql`now()`', async () => {
    const repoA = sessionsRepo(userAId);
    const activeHash = 'unscoped_hash_active_12345678901234567890123456789012345678901234';
    const expiredHash = 'unscoped_hash_expired_1234567890123456789012345678901234567890123';

    await repoA.create({
      id: uuidv7(),
      tokenHash: activeHash,
    });

    await repoA.create({
      id: uuidv7(),
      tokenHash: expiredHash,
      expiresAt: new Date(Date.now() - 30000),
    });

    const foundActive = await unscopedFindSessionByTokenHash(activeHash);
    expect(foundActive).not.toBeNull();
    expect(foundActive?.tokenHash).toBe(activeHash);

    const foundExpired = await unscopedFindSessionByTokenHash(expiredHash);
    expect(foundExpired).toBeNull();
  });
});
