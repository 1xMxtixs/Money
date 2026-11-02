import { describe, it, expect } from 'vitest';
import { uuidv7, isValidUuidv7 } from './uuidv7';

describe('UUIDv7 Generator (RFC 9562 / AD-09)', () => {
  it('generates well-formed 36-character UUID strings', () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(isValidUuidv7(id)).toBe(true);
  });

  it('sets version field to 7 (nibble 13 / 0-indexed char 14 is 7)', () => {
    for (let i = 0; i < 50; i++) {
      const id = uuidv7();
      // Format: 8-4-4-4-12 -> chars 14 is the version nibble
      expect(id.charAt(14)).toBe('7');
    }
  });

  it('sets variant field to 10xx (RFC 4122 / 9562 variant, char 19 is 8, 9, a, or b)', () => {
    const validVariantChars = new Set(['8', '9', 'a', 'b']);
    for (let i = 0; i < 50; i++) {
      const id = uuidv7();
      // Format: 8-4-4-4-12 -> char 19 is variant nibble
      expect(validVariantChars.has(id.charAt(19))).toBe(true);
    }
  });

  it('guarantees strictly increasing monotonic order across 1000 IDs generated sequentially', () => {
    const count = 1000;
    const ids = new Array<string>(count);

    for (let i = 0; i < count; i++) {
      ids[i] = uuidv7();
    }

    for (let i = 1; i < count; i++) {
      const prev = ids[i - 1];
      const curr = ids[i];

      // Lexicographical comparison must be strictly increasing
      expect(curr > prev).toBe(true);
    }
  });

  it('rejects invalid or malformed UUID strings with isValidUuidv7', () => {
    expect(isValidUuidv7('')).toBe(false);
    expect(isValidUuidv7('not-a-uuid')).toBe(false);
    // UUIDv4 (version 4)
    expect(isValidUuidv7('018d0000-0000-4000-8000-000000000001')).toBe(false);
    // Invalid variant (char 19 is 'c' -> 1100)
    expect(isValidUuidv7('018d0000-0000-7000-c000-000000000001')).toBe(false);
  });

  it('handles sequence counter overflow when generating more than 4096 IDs in the same millisecond', () => {
    // Force Date.now to return constant value to test rollover logic
    const originalNow = Date.now;
    const fixedTime = 1774450000000;
    try {
      Date.now = () => fixedTime;
      const count = 4200;
      let prev = uuidv7();
      for (let i = 1; i < count; i++) {
        const curr = uuidv7();
        expect(curr > prev).toBe(true);
        prev = curr;
      }
    } finally {
      Date.now = originalNow;
    }
  });
});
