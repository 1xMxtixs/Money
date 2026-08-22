import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import {
  getSecurityHeaders,
  buildCspHeader,
  verifyMutationOrigin,
  HSTS_HEADER_VALUE,
  X_CONTENT_TYPE_OPTIONS_VALUE,
  X_FRAME_OPTIONS_VALUE,
  REFERRER_POLICY_VALUE,
  PERMISSIONS_POLICY_VALUE,
  CROSS_ORIGIN_OPENER_POLICY_VALUE,
  CROSS_ORIGIN_RESOURCE_POLICY_VALUE,
  X_XSS_PROTECTION_VALUE,
  API_CACHE_CONTROL_VALUE,
} from './headers';
import { forbiddenOrigin, problemResponse } from '@/lib/api/problem';

describe('Security Headers Suite (F0-07 / doc 7 §2, §7, §8)', () => {
  const dummyNonce = 'dGVzdE5vbmNlMTIzNDU2Nw==';

  describe('Criterion 1 & T1 & T8: Ten Literal Headers Verification (doc 7 §7)', () => {
    it('matches exact literal values for all security headers on non-api responses', () => {
      const headers = getSecurityHeaders({ nonce: dummyNonce, isApi: false });

      // 1. Content-Security-Policy (with nonce and strict-dynamic)
      expect(headers['Content-Security-Policy']).toBe(
        `default-src 'self'; script-src 'self' 'nonce-${dummyNonce}' 'strict-dynamic'; style-src 'self' 'nonce-${dummyNonce}'; style-src-attr 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://*.ingest.sentry.io; worker-src 'self'; manifest-src 'self'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'; upgrade-insecure-requests`
      );

      // 2. Strict-Transport-Security (without preload for initial deployment - T1)
      expect(headers['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
      expect(headers['Strict-Transport-Security']).toBe(HSTS_HEADER_VALUE);
      expect(headers['Strict-Transport-Security']).not.toContain('preload');

      // 3. X-Content-Type-Options
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Content-Type-Options']).toBe(X_CONTENT_TYPE_OPTIONS_VALUE);

      // 4. X-Frame-Options (T8: DENY along with frame-ancestors 'none')
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-Frame-Options']).toBe(X_FRAME_OPTIONS_VALUE);

      // 5. Referrer-Policy
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['Referrer-Policy']).toBe(REFERRER_POLICY_VALUE);

      // 6. Permissions-Policy
      expect(headers['Permissions-Policy']).toBe(
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
      );
      expect(headers['Permissions-Policy']).toBe(PERMISSIONS_POLICY_VALUE);

      // 7. Cross-Origin-Opener-Policy
      expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
      expect(headers['Cross-Origin-Opener-Policy']).toBe(CROSS_ORIGIN_OPENER_POLICY_VALUE);

      // 8. Cross-Origin-Resource-Policy
      expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
      expect(headers['Cross-Origin-Resource-Policy']).toBe(CROSS_ORIGIN_RESOURCE_POLICY_VALUE);

      // 9. X-XSS-Protection (explicit 0 to disable legacy vulnerable auditor)
      expect(headers['X-XSS-Protection']).toBe('0');
      expect(headers['X-XSS-Protection']).toBe(X_XSS_PROTECTION_VALUE);

      // 10. Cache-Control (omitted for static/pages, non-api)
      expect(headers['Cache-Control']).toBeUndefined();
    });

    it('emits Cache-Control: no-store strictly when isApi is true (T3 / doc 7 §7)', () => {
      const apiHeaders = getSecurityHeaders({ nonce: dummyNonce, isApi: true });
      expect(apiHeaders['Cache-Control']).toBe('no-store');
      expect(apiHeaders['Cache-Control']).toBe(API_CACHE_CONTROL_VALUE);
    });
  });

  describe('Criterion 2: CSP Structure and Directives (SP-02)', () => {
    it('includes all mandatory directives matching SP-02', () => {
      const csp = buildCspHeader('unique-nonce-abc');

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'nonce-unique-nonce-abc' 'strict-dynamic'");
      expect(csp).toContain("style-src 'self' 'nonce-unique-nonce-abc'");
      expect(csp).toContain("style-src-attr 'unsafe-inline'");
      expect(csp).toContain("img-src 'self' blob: data:");
      expect(csp).toContain("font-src 'self'");
      expect(csp).toContain('connect-src \'self\' https://*.ingest.sentry.io');
      expect(csp).toContain("worker-src 'self'");
      expect(csp).toContain("manifest-src 'self'");
      expect(csp).toContain("frame-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain('upgrade-insecure-requests');
    });
  });

  describe('Criterion 4 & T5: Origin Verification on State Mutations (doc 7 §8 / SP-05)', () => {
    const canonicalUrl = 'https://money.app/api/transactions';

    it('bypasses GET requests unconditionally (AC-01 / doc 7 §8)', () => {
      const req = {
        method: 'GET',
        headers: new Headers({ origin: 'https://evil.com' }),
        url: canonicalUrl,
      };

      const result = verifyMutationOrigin(req);
      expect(result.isValid).toBe(true);
    });

    it('Branch 1: accepts mutation when Origin matches canonical origin (doc 7 §8)', () => {
      const req = {
        method: 'POST',
        headers: new Headers({ origin: 'https://money.app' }),
        url: canonicalUrl,
      };

      const result = verifyMutationOrigin(req);
      expect(result.isValid).toBe(true);
    });

    it('Branch 2: rejects mutation with 403 when Origin does NOT match canonical origin (doc 7 §8)', () => {
      const req = {
        method: 'POST',
        headers: new Headers({ origin: 'https://attacker.site' }),
        url: canonicalUrl,
      };

      const result = verifyMutationOrigin(req);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('does not match canonical origin');
    });

    it('Branch 3a: accepts mutation when Origin is missing but Sec-Fetch-Site is same-origin (doc 7 §8)', () => {
      const req = {
        method: 'PUT',
        headers: new Headers({ 'sec-fetch-site': 'same-origin' }),
        url: canonicalUrl,
      };

      const result = verifyMutationOrigin(req);
      expect(result.isValid).toBe(true);
    });

    it('Branch 3b: rejects mutation when Origin is missing and Sec-Fetch-Site is cross-site or absent (doc 7 §8)', () => {
      // Sec-Fetch-Site cross-site
      const crossSiteReq = {
        method: 'DELETE',
        headers: new Headers({ 'sec-fetch-site': 'cross-site' }),
        url: canonicalUrl,
      };
      expect(verifyMutationOrigin(crossSiteReq).isValid).toBe(false);

      // Both Origin and Sec-Fetch-Site missing
      const absentHeadersReq = {
        method: 'PATCH',
        headers: new Headers(),
        url: canonicalUrl,
      };
      const absentResult = verifyMutationOrigin(absentHeadersReq);
      expect(absentResult.isValid).toBe(false);
      expect(absentResult.reason).toContain('Neither Origin nor Sec-Fetch-Site');
    });

    it('T4: Produces RFC 9457 403 FORBIDDEN_ORIGIN problem response on rejection', async () => {
      const err = forbiddenOrigin();
      const response = problemResponse(
        {
          type: err.type || 'https://money.app/errors/forbidden-origin',
          title: err.message,
          status: err.status,
          code: err.code,
        },
        err.headers
      );

      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('application/problem+json; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      const body = await response.json();
      expect(body).toEqual({
        type: 'https://money.app/errors/forbidden-origin',
        title: 'Request origin is not allowed',
        status: 403,
        code: 'FORBIDDEN_ORIGIN',
      });
    });

    it('returns 403 with all 9 security headers and Cache-Control when mutation origin verification fails in middleware', async () => {
      const req = new NextRequest('https://money.app/api/transactions', {
        method: 'POST',
        headers: {
          origin: 'https://evil.com',
        },
      });

      const response = middleware(req);

      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('application/problem+json; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      // Verify all 9 security headers are present on the 403 rejection response
      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains');
      expect(response.headers.get('Strict-Transport-Security')).not.toContain('preload');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('Permissions-Policy')).toBe(
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
      );
      expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
      expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
      expect(response.headers.get('X-XSS-Protection')).toBe('0');

      // Verify Content-Security-Policy contains nonce and strict-dynamic
      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('strict-dynamic');
      expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{24}' 'strict-dynamic'/);

      const body = await response.json();
      expect(body).toEqual({
        type: 'https://money.app/errors/forbidden-origin',
        title: 'Request origin is not allowed',
        status: 403,
        code: 'FORBIDDEN_ORIGIN',
      });
    });
  });
});
