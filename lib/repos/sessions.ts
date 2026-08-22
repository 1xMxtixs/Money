import { eq, and, isNull, gt, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions, type Session, type NewSession } from '@/lib/db/schema';

export type CreateSessionInput = Omit<NewSession, 'userId'>;

/**
 * Scoped repository for session management (AD-11 / doc 3 §AD-11).
 *
 * CRITICAL (R-03 / RNF-SE-08):
 * All operations are strictly scoped to the authenticated userId provided at instantiation.
 */
export function sessionsRepo(userId: string) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('sessionsRepo requires a valid non-empty userId string.');
  }

  return {
    /**
     * Lists active (non-revoked, non-expired) sessions for the bound user.
     */
    async listActive(): Promise<Session[]> {
      return db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date())
          )
        );
    },

    /**
     * Lists all sessions (active, expired, and revoked) for the bound user.
     */
    async listAll(): Promise<Session[]> {
      return db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, userId));
    },

    /**
     * Creates a new session bound to the authenticated user.
     */
    async create(data: CreateSessionInput): Promise<Session> {
      const [session] = await db
        .insert(sessions)
        .values({
          ...data,
          userId,
        })
        .returning();

      return session;
    },

    /**
     * Revokes a specific session belonging to the bound user.
     * Guarantees that a user cannot revoke another user's session (AD-11 / AC-05).
     */
    async revoke(sessionId: string): Promise<boolean> {
      const result = await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.id, sessionId),
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt)
          )
        )
        .returning({ id: sessions.id });

      return result.length > 0;
    },

    /**
     * Revokes all active sessions for the bound user.
     */
    async revokeAll(): Promise<number> {
      const result = await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt)
          )
        )
        .returning({ id: sessions.id });

      return result.length;
    },

    /**
     * Revokes all active sessions for the bound user EXCEPT the specified session.
     * Used when changing password or logging out other devices (RF-008, doc 7 §3).
     */
    async revokeAllExcept(currentSessionId: string): Promise<number> {
      const result = await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.userId, userId),
            ne(sessions.id, currentSessionId),
            isNull(sessions.revokedAt)
          )
        )
        .returning({ id: sessions.id });

      return result.length;
    },
  };
}

/**
 * Unscoped session resolution by token hash.
 *
 * RATIONALE (T2 - Option B):
 * Resolving an authentication session occurs on incoming HTTP requests via cookie token hash
 * BEFORE the user identity is known. Therefore, it cannot be scoped by userId at query time.
 * This function is explicitly isolated and named `unscopedFindSessionByTokenHash` to clearly signal
 * its exception to the standard scoped repository pattern while keeping db imports encapsulated in lib/repos.
 */
export async function unscopedFindSessionByTokenHash(
  tokenHash: string
): Promise<Session | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  return session ?? null;
}
