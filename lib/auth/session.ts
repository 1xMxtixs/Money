import crypto from 'node:crypto';
import { uuidv7 } from '@/lib/domain/id/uuidv7';
import {
  sessionsRepo,
  unscopedFindSessionByTokenHash,
  type Session,
} from '@/lib/repos/sessions';

export const SESSION_COOKIE_NAME = 'session';
export const SESSION_MAX_AGE_SECONDS = 2592000; // 30 days = 30 * 24 * 60 * 60 seconds

const TOUCH_THROTTLE_MS = 900_000; // 15 minutes

const BASE64URL_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

/**
 * Validates that an incoming token is a well-formed 43-character base64url string.
 * Rejects any other format immediately without database invocation.
 */
function isValidSessionToken(token: unknown): token is string {
  return typeof token === 'string' && BASE64URL_TOKEN_REGEX.test(token);
}

/**
 * Derives the SHA-256 hex digest of a session token for storage and lookup.
 * Document 7 §4 explains why SHA-256 (not Argon2id) is used for high-entropy session tokens.
 */
function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates 32 cryptographically secure random bytes encoded as unpadded base64url (43 chars).
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Sanitizes userAgent: truncates to 255 characters before insert to satisfy the CHECK constraint.
 * Returns null if missing or empty after trimming.
 */
function sanitizeUserAgent(userAgent?: string | null): string | null {
  if (userAgent === undefined || userAgent === null) {
    return null;
  }
  const trimmed = userAgent.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return userAgent.length > 255 ? userAgent.slice(0, 255) : userAgent;
}

/**
 * Builds the Set-Cookie string for an active session with the exact attributes from Document 7 §4:
 * session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000
 */
export function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

/**
 * Builds the Set-Cookie string to clear/expire the session cookie (Max-Age=0).
 */
export function buildClearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Creates a new opaque database session for the specified user (AD-05 / doc 7 §4).
 * Returns the cleartext token ONLY in memory for cookie emission; the database
 * exclusively persists sha256(token).
 */
export async function createSession(
  userId: string,
  userAgent?: string | null
): Promise<{ token: string; session: Session; cookie: string }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const id = uuidv7();
  const sanitizedUserAgent = sanitizeUserAgent(userAgent);

  const session = await sessionsRepo(userId).create({
    id,
    tokenHash,
    userAgent: sanitizedUserAgent,
  });

  const cookie = buildSessionCookie(token);

  return { token, session, cookie };
}

/**
 * Resolves an incoming session token: validates token format, hashes it with SHA-256,
 * and verifies that revoked_at IS NULL AND expires_at > now() via database clock.
 *
 * If the session is eligible for sliding expiry touch (> 15 minutes since last_seen_at),
 * it updates last_seen_at and extends expires_at by 30 days, returning refreshedCookie.
 */
export async function resolveSession(
  token: string
): Promise<{ session: Session; refreshedCookie?: string } | null> {
  if (!isValidSessionToken(token)) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const session = await unscopedFindSessionByTokenHash(tokenHash);
  if (!session) {
    return null;
  }

  // JS pre-check avoids a second Neon round-trip on most requests (RNF-RE-05).
  // The SQL condition in touch() stays the authority (DB clock, race-safe).
  if (session.lastSeenAt.getTime() > Date.now() - TOUCH_THROTTLE_MS) {
    return { session };
  }

  const updatedSession = await sessionsRepo(session.userId).touch(session.id);
  if (updatedSession) {
    return {
      session: updatedSession,
      refreshedCookie: buildSessionCookie(token),
    };
  }

  return { session };
}

/**
 * Atomically rotates a session: creates a new session and revokes the old one
 * within a single interactive transaction via poolDb (Criterion 5 / doc 7 §4).
 * Returns the new cleartext token, new session record, and fresh Set-Cookie header.
 */
export async function rotateSession(
  userId: string,
  oldSessionId: string,
  userAgent?: string | null
): Promise<{ token: string; session: Session; cookie: string }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const id = uuidv7();
  const sanitizedUserAgent = sanitizeUserAgent(userAgent);

  const newSession = await sessionsRepo(userId).rotate(oldSessionId, {
    id,
    tokenHash,
    userAgent: sanitizedUserAgent,
  });

  const cookie = buildSessionCookie(token);

  return { token, session: newSession, cookie };
}
