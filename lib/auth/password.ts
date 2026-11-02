import crypto from 'node:crypto';
import type { Algorithm } from '@node-rs/argon2';
import { hash, verify } from '@node-rs/argon2';
import { COMMON_PASSWORDS_SET } from './common-passwords';

/**
 * Argon2id password hashing and constant-time verification parameters (SP-01 / RF-002 / doc 7 §2, §3).
 *
 * PARAMETERS:
 * - Algorithm: Argon2id (hybrid data-dependent / data-independent memory-hard function) = 2
 * - Memory: 19456 KiB (19 MiB) — OWASP recommended baseline for t=2
 * - Time / Iterations: 2 passes
 * - Parallelism: 1 thread (tailored for serverless environments)
 * - Output Length: 32 bytes (256 bits)
 * - Salt: 16 cryptographically secure random bytes generated per hash
 */
export const ARGON2_PARAMS = Object.freeze({
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
  algorithm: 2 as Algorithm,
});


export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Decoy hash initialized on module load (SP-01 / T-05 / RF-010).
 *
 * Serves dual purposes:
 * 1. Startup baseline check: ensures runtime environment has >= 19 MiB memory allocated.
 * 2. Constant-time dummy verification: when an invalid/non-existent user logs in,
 *    `verifyPassword` verifies against this precomputed decoy hash to eliminate timing differences.
 */
const DECOY_HASH_PROMISE: Promise<string> = (async () => {
  const randomSecret = crypto.randomBytes(32).toString('hex');
  return hash(randomSecret, ARGON2_PARAMS);
})();

// Suppress unhandled promise rejection at startup; re-thrown on first await
DECOY_HASH_PROMISE.catch(() => {});

export type PasswordValidationResult =
  | { valid: true }
  | { valid: false; code: 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' };

/**
 * Validates password length constraints on the raw input string before Unicode normalization (T-05 / doc 7 §3).
 * Rejecting oversized raw inputs cuts off Denial of Service (DoS) attacks prior to normalization overhead.
 * Counts Unicode code points so surrogate pairs / multi-byte characters are accurately counted.
 */
export function validatePasswordLength(plain: string): PasswordValidationResult {
  if (typeof plain !== 'string') {
    return { valid: false, code: 'PASSWORD_TOO_SHORT' };
  }
  const length = [...plain].length;
  if (length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      code: 'PASSWORD_TOO_SHORT',
    };
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return {
      valid: false,
      code: 'PASSWORD_TOO_LONG',
    };
  }
  return { valid: true };
}

/**
 * Checks whether a given password is among the top 10,000 most commonly leaked passwords (RF-002 / doc 7 §3).
 *
 * NOTE: Non-blocking warning only. Warns user without impeding account creation.
 */
export function isCommonPassword(plain: string): boolean {
  if (typeof plain !== 'string' || plain.length === 0) {
    return false;
  }
  const normalized = plain.normalize('NFKC');
  return (
    COMMON_PASSWORDS_SET.has(plain) ||
    COMMON_PASSWORDS_SET.has(normalized) ||
    COMMON_PASSWORDS_SET.has(plain.toLowerCase()) ||
    COMMON_PASSWORDS_SET.has(normalized.toLowerCase())
  );
}

/**
 * Hashes a plaintext password using Argon2id with strict parameters (SP-01 / RF-002).
 *
 * 1. Validates raw length against bounds [8, 128].
 * 2. Applies Unicode NFKC normalization.
 * 3. Hashes with per-invocation 16-byte random salt and returns the PHC-formatted string.
 */
export async function hashPassword(plain: string): Promise<string> {
  const validation = validatePasswordLength(plain);
  if (!validation.valid) {
    throw new Error(validation.code);
  }

  const normalized = plain.normalize('NFKC');
  return hash(normalized, ARGON2_PARAMS);
}

/**
 * Verifies a plaintext password against a stored PHC hash (or dummy decoy hash) in constant time (T-05 / RF-010).
 *
 * CRITICAL DEFENSE AGAINST USER ENUMERATION:
 * If `hashValue` is null, undefined, empty, or malformed, this function does NOT return early.
 * Instead, it executes a complete Argon2id verification against `DECOY_HASH_PROMISE` and returns `false`.
 */
export async function verifyPassword(
  hashValue: string | null | undefined,
  plain: string
): Promise<boolean> {
  if (typeof plain !== 'string') {
    return false;
  }

  const normalized = plain.normalize('NFKC');

  if (!hashValue || typeof hashValue !== 'string') {
    const decoy = await DECOY_HASH_PROMISE;
    await verify(decoy, normalized).catch(() => false);
    return false;
  }

  try {
    return await verify(hashValue, normalized);
  } catch {
    // If the hash is corrupted or malformed, fall back to decoy verification to maintain constant time
    const decoy = await DECOY_HASH_PROMISE;
    await verify(decoy, normalized).catch(() => false);
    return false;
  }
}
