import { describe, it, expect } from 'vitest';
import {
  resolveSession,
  buildSessionCookie,
  buildClearedSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from './session';

describe('Session Authentication Unit Tests (AD-05 / doc 7 §4)', () => {
  describe('buildSessionCookie', () => {
    it('contains exactly the 5 attributes and Max-Age=2592000 without __Host- prefix', () => {
      const token = 'sample_test_token_43_characters_long_val';
      const cookie = buildSessionCookie(token);

      // Literal format: session=<testigo>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000
      expect(cookie.startsWith(`${SESSION_COOKIE_NAME}=${token}`)).toBe(true);
      expect(cookie).not.toContain('__Host-');

      // 5 mandatory security attributes
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
      expect(SESSION_MAX_AGE_SECONDS).toBe(2592000);

      const parts = cookie.split(';').map((p) => p.trim());
      expect(parts[0]).toBe(`${SESSION_COOKIE_NAME}=${token}`);
      expect(parts).toContain('HttpOnly');
      expect(parts).toContain('Secure');
      expect(parts).toContain('SameSite=Lax');
      expect(parts).toContain('Path=/');
      expect(parts).toContain('Max-Age=2592000');
      expect(parts.length).toBe(6); // name=value + 5 attributes
    });
  });

  describe('buildClearedSessionCookie', () => {
    it('produces Set-Cookie with Max-Age=0', () => {
      const cleared = buildClearedSessionCookie();
      expect(cleared.startsWith(`${SESSION_COOKIE_NAME}=;`)).toBe(true);
      expect(cleared).toContain('Max-Age=0');
      expect(cleared).toContain('HttpOnly');
      expect(cleared).toContain('Secure');
      expect(cleared).toContain('SameSite=Lax');
      expect(cleared).toContain('Path=/');
    });
  });

  describe('resolveSession input validation', () => {
    it('immediately rejects malformed tokens without database lookup', async () => {
      // Non-43 characters or invalid base64url characters
      expect(await resolveSession('')).toBeNull();
      expect(await resolveSession('too_short')).toBeNull();
      expect(await resolveSession('toolong_token_with_more_than_43_characters_value_123456')).toBeNull();
      expect(await resolveSession('token_with_invalid_char_+_not_base64url_123')).toBeNull();
      expect(await resolveSession('token_with_invalid_char_/_not_base64url_123')).toBeNull();
      expect(await resolveSession('token_with_padding_equals_character_1234==')).toBeNull();
      // @ts-expect-error Testing runtime defense against undefined
      expect(await resolveSession(undefined)).toBeNull();
      // @ts-expect-error Testing runtime defense against null
      expect(await resolveSession(null)).toBeNull();
    });
  });
});
