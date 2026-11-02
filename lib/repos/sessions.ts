import { eq, and, isNull, gt, lt, ne, sql, type SQL } from 'drizzle-orm';
import { db, poolDb } from '@/lib/db';
import { sessions, type Session, type NewSession } from '@/lib/db/schema';

export type { Session };

/** La sesión a rotar no existe, no es del usuario o ya está revocada. */
export class SessionNotRotatableError extends Error {
  constructor(oldSessionId: string) {
    super(`Cannot rotate session ${oldSessionId}: not found or already revoked.`);
    this.name = 'SessionNotRotatableError';
  }
}

export type CreateSessionInput = Omit<NewSession, 'userId' | 'expiresAt'> & {
  expiresAt?: Date | SQL;
};

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
     * Uses database clock sql`now()` for expiration evaluation (Criterion 4 / doc 7 §4).
     */
    async listActive(): Promise<Session[]> {
      return db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, sql`now()`)
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
          expiresAt: data.expiresAt ?? sql`now() + interval '30 days'`,
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
        .set({ revokedAt: sql`now()` })
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
        .set({ revokedAt: sql`now()` })
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
        .set({ revokedAt: sql`now()` })
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

    /**
     * Conditionally touches the session with sliding expiry (Criterion 3 / doc 7 §4).
     * Single UPDATE enforcing the 15-minute throttle rule directly in SQL:
     * SET last_seen_at = now(), expires_at = now() + interval '30 days'
     * WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()
     *   AND last_seen_at < now() - interval '15 minutes'
     *
     * Returns the updated Session if touched, or null if within the 15-minute window.
     */
    async touch(sessionId: string): Promise<Session | null> {
      const [updated] = await db
        .update(sessions)
        .set({
          lastSeenAt: sql`now()`,
          expiresAt: sql`now() + interval '30 days'`,
        })
        .where(
          and(
            eq(sessions.id, sessionId),
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, sql`now()`),
            lt(sessions.lastSeenAt, sql`now() - interval '15 minutes'`)
          )
        )
        .returning();

      return updated ?? null;
    },

    /**
     * Atomically rotates a session: revokes the previous session and inserts the new session
     * in a single interactive transaction via poolDb (Criterion 5 / doc 7 §4).
     * Throws if oldSessionId does not exist or is already revoked for this user.
     */
    async rotate(
      oldSessionId: string,
      data: CreateSessionInput
    ): Promise<Session> {
      return poolDb.transaction(async (tx) => {
        const revoked = await tx
          .update(sessions)
          .set({ revokedAt: sql`now()` })
          .where(
            and(
              eq(sessions.id, oldSessionId),
              eq(sessions.userId, userId),
              isNull(sessions.revokedAt)
            )
          )
          .returning({ id: sessions.id });

        if (revoked.length === 0) {
          throw new SessionNotRotatableError(oldSessionId);
        }

        const [newSession] = await tx
          .insert(sessions)
          .values({
            ...data,
            expiresAt: data.expiresAt ?? sql`now() + interval '30 days'`,
            userId,
          })
          .returning();

        return newSession;
      });
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
 *
 * Criterion 4: Uses database clock sql`now()` for expiration evaluation.
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
        gt(sessions.expiresAt, sql`now()`)
      )
    )
    .limit(1);

  return session ?? null;
}
