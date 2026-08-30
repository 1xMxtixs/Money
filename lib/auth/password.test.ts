import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  isCommonPassword,
  validatePasswordLength,
  ARGON2_PARAMS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from './password';

describe('Password Security Module (SP-01 / T-05 / RF-002 / doc 7 §2, §3)', () => {
  describe('Argon2id Parameters and PHC String Integrity', () => {
    it('produces valid PHC hash string matching SP-01 parameters exactly', async () => {
      const password = 'CorrectHorseBatteryStaple!2026';
      const hashStr = await hashPassword(password);

      // Parse PHC formatted string: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
      const parts = hashStr.split('$').filter(Boolean);
      expect(parts[0]).toBe('argon2id');
      expect(parts[1]).toBe('v=19');

      const paramsMap = Object.fromEntries(
        parts[2].split(',').map((pair) => {
          const [k, v] = pair.split('=');
          return [k, Number(v)];
        })
      );

      // Assert parameters read directly from the generated PHC string
      expect(paramsMap.m).toBe(19456);
      expect(paramsMap.t).toBe(2);
      expect(paramsMap.p).toBe(1);

      // Verify that the exported constant matches configuration
      expect(ARGON2_PARAMS.memoryCost).toBe(19456);
      expect(ARGON2_PARAMS.timeCost).toBe(2);
      expect(ARGON2_PARAMS.parallelism).toBe(1);
      expect(ARGON2_PARAMS.outputLen).toBe(32);
    });

    it('generates distinct cryptographic salts for identical plaintext passwords', async () => {
      const plain = 'secret_password_123';
      const hash1 = await hashPassword(plain);
      const hash2 = await hashPassword(plain);

      expect(hash1).not.toBe(hash2);

      // Both hashes must still verify successfully
      expect(await verifyPassword(hash1, plain)).toBe(true);
      expect(await verifyPassword(hash2, plain)).toBe(true);
    });
  });

  describe('Unicode NFKC Normalization', () => {
    it('normalizes Unicode variants before hashing and verification', async () => {
      // Precomposed 'ñ' (U+00F1) vs Decomposed 'n' + combining tilde (U+006E + U+0303)
      const precomposed = 'contrase\u00F1a_segura';
      const decomposed = 'contrasen\u0303a_segura';

      expect(precomposed).not.toBe(decomposed);
      expect(precomposed.normalize('NFKC')).toBe(decomposed.normalize('NFKC'));

      const hashFromPrecomposed = await hashPassword(precomposed);
      expect(await verifyPassword(hashFromPrecomposed, decomposed)).toBe(true);

      const hashFromDecomposed = await hashPassword(decomposed);
      expect(await verifyPassword(hashFromDecomposed, precomposed)).toBe(true);
    });
  });

  describe('Password Length Validation & DoS Prevention', () => {
    it('enforces length boundaries: 7 rejected, 8 accepted, 128 accepted, 129 rejected', async () => {
      const len7 = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);
      const len8 = 'a'.repeat(PASSWORD_MIN_LENGTH);
      const len128 = 'a'.repeat(PASSWORD_MAX_LENGTH);
      const len129 = 'a'.repeat(PASSWORD_MAX_LENGTH + 1);

      expect(validatePasswordLength(len7).valid).toBe(false);
      expect(validatePasswordLength(len8).valid).toBe(true);
      expect(validatePasswordLength(len128).valid).toBe(true);
      expect(validatePasswordLength(len129).valid).toBe(false);

      await expect(hashPassword(len7)).rejects.toThrow(/at least 8 characters/);
      await expect(hashPassword(len8)).resolves.toBeDefined();
      await expect(hashPassword(len128)).resolves.toBeDefined();
      await expect(hashPassword(len129)).rejects.toThrow(/not exceed 128 characters/);
    });
  });

  describe('Common Passwords Detection (SecLists Top 10,000)', () => {
    it('detects common passwords as non-blocking warnings', async () => {
      expect(isCommonPassword('password')).toBe(true);
      expect(isCommonPassword('123456789')).toBe(true);
      expect(isCommonPassword('12345678')).toBe(true);
      expect(isCommonPassword('qwerty')).toBe(true);
      expect(isCommonPassword('dragon')).toBe(true);

      // Unique password is not common
      expect(isCommonPassword('un1qu3_p@ssw0rd_m0n3y_2026_x!')).toBe(false);

      // Warning only: hashing common password STILL succeeds and functions
      const commonHash = await hashPassword('password123');
      expect(typeof commonHash).toBe('string');
      expect(await verifyPassword(commonHash, 'password123')).toBe(true);
    });
  });

  describe('Verification Logic & Malformed Inputs', () => {
    it('returns false for mismatched passwords against real hash', async () => {
      const hashVal = await hashPassword('validPassword123');
      expect(await verifyPassword(hashVal, 'wrongPassword123')).toBe(false);
    });

    it('returns false for null, undefined, empty, or malformed hashes via decoy execution', async () => {
      expect(await verifyPassword(null, 'anyPassword123')).toBe(false);
      expect(await verifyPassword(undefined, 'anyPassword123')).toBe(false);
      expect(await verifyPassword('', 'anyPassword123')).toBe(false);
      expect(await verifyPassword('malformed_corrupted_hash', 'anyPassword123')).toBe(false);
    });
  });

  describe('Timing Defense against User Enumeration (T-05 / RF-010)', () => {
    it('maintains equivalent median execution times between real hash mismatch and decoy null path', async () => {
      const realHash = await hashPassword('realUserSecretPassword123');
      const candidatePassword = 'attackerGuessPassword123';
      const iterations = 10;

      const realHashTimes: number[] = [];
      const decoyHashTimes: number[] = [];

      // Warm-up iteration to ensure JIT / module initialization does not bias samples
      await verifyPassword(realHash, candidatePassword);
      await verifyPassword(null, candidatePassword);

      // Interleave measurements to distribute CPU / thread scheduling jitter evenly
      for (let i = 0; i < iterations; i++) {
        const startReal = performance.now();
        await verifyPassword(realHash, candidatePassword);
        const endReal = performance.now();
        realHashTimes.push(endReal - startReal);

        const startDecoy = performance.now();
        await verifyPassword(null, candidatePassword);
        const endDecoy = performance.now();
        decoyHashTimes.push(endDecoy - startDecoy);
      }

      function getMedian(samples: number[]): number {
        const sorted = [...samples].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
      }

      const medianReal = getMedian(realHashTimes);
      const medianDecoy = getMedian(decoyHashTimes);
      const medianDifference = Math.abs(medianReal - medianDecoy);

      // Log measured times for test reporting and diagnostic transparency
      console.log(
        `[Timing Test] Real Hash Median: ${medianReal.toFixed(2)}ms | Decoy Null Median: ${medianDecoy.toFixed(2)}ms | Difference: ${medianDifference.toFixed(2)}ms`
      );

      /**
       * JUSTIFICATION OF TIMING THRESHOLD:
       * Both paths execute Argon2id with identical cost parameters (m=19456, t=2, p=1).
       * In CI runners and virtualized CPUs, thread scheduling and GC introduce minor jitter.
       * Using medians eliminates outlier spikes. A 30ms margin is robust against CI noise
       * while decisively distinguishing between genuine hashing (~40-80ms) and an insecure early return (<1ms).
       */
      expect(medianDifference).toBeLessThan(30);
    });
  });
});
