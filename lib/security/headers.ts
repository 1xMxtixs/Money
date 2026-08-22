/**
 * Security headers configuration and Origin validation (F0-07 / doc 7 §2, §7, §8).
 */

/**
 * Builds the strict Content-Security-Policy with per-request nonce (SP-02).
 */
export function buildCspHeader(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self' https://*.ingest.sentry.io`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'none'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

/**
 * Strict-Transport-Security value without preload for initial deployment (T1 / doc 7 §7).
 *
 * NOTE (T1 / doc 7 §7):
 * 'preload' is intentionally omitted for the initial deployment.
 * It will be added after 1 month of production HTTPS serving without incidents
 * because browser HSTS preload list inclusion takes months to reverse.
 */
export const HSTS_HEADER_VALUE = 'max-age=63072000; includeSubDomains';

export const X_CONTENT_TYPE_OPTIONS_VALUE = 'nosniff';
export const X_FRAME_OPTIONS_VALUE = 'DENY';
export const REFERRER_POLICY_VALUE = 'strict-origin-when-cross-origin';
export const PERMISSIONS_POLICY_VALUE =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()';
export const CROSS_ORIGIN_OPENER_POLICY_VALUE = 'same-origin';
export const CROSS_ORIGIN_RESOURCE_POLICY_VALUE = 'same-origin';
export const X_XSS_PROTECTION_VALUE = '0';
export const API_CACHE_CONTROL_VALUE = 'no-store';

export interface SecurityHeadersOptions {
  nonce: string;
  isApi?: boolean;
}

/**
 * Returns the exact 10 literal security headers mandated by doc 7 §7.
 */
export function getSecurityHeaders(
  options: SecurityHeadersOptions
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': buildCspHeader(options.nonce),
    'Strict-Transport-Security': HSTS_HEADER_VALUE,
    'X-Content-Type-Options': X_CONTENT_TYPE_OPTIONS_VALUE,
    'X-Frame-Options': X_FRAME_OPTIONS_VALUE,
    'Referrer-Policy': REFERRER_POLICY_VALUE,
    'Permissions-Policy': PERMISSIONS_POLICY_VALUE,
    'Cross-Origin-Opener-Policy': CROSS_ORIGIN_OPENER_POLICY_VALUE,
    'Cross-Origin-Resource-Policy': CROSS_ORIGIN_RESOURCE_POLICY_VALUE,
    'X-XSS-Protection': X_XSS_PROTECTION_VALUE,
  };

  // Cache-Control: no-store is scoped strictly to /api/* requests (T3 / doc 7 §7)
  if (options.isApi) {
    headers['Cache-Control'] = API_CACHE_CONTROL_VALUE;
  }

  return headers;
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface RequestOriginContext {
  method: string;
  headers: Headers;
  url: string;
}

export interface OriginVerificationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Anti-CSRF Origin verification on all state-mutating requests (doc 7 §8 / SP-05 / T5).
 *
 * Implements the three distinct verification branches:
 * 1. Origin header present and equals canonical origin -> PASS.
 * 2. Origin header present but does NOT match canonical origin -> REJECT (403 FORBIDDEN_ORIGIN).
 * 3. Origin header missing -> Fallback to Sec-Fetch-Site:
 *    - Sec-Fetch-Site === 'same-origin' -> PASS.
 *    - Sec-Fetch-Site missing or different -> REJECT (403 FORBIDDEN_ORIGIN).
 */
export function verifyMutationOrigin(
  req: RequestOriginContext
): OriginVerificationResult {
  const method = req.method.toUpperCase();
  if (!MUTATION_METHODS.has(method)) {
    return { isValid: true };
  }

  const originHeader = req.headers.get('origin');
  // NOTA (F0-17): El origen canónico se deduce actualmente de req.url (new URL(req.url).origin).
  // En F0-17 (dominio de producción) se validará contra una variable de entorno
  // configurada para el origen canónico y evitar inyección de Host a través de un proxy mal configurado.
  const canonicalOrigin = new URL(req.url).origin;

  // Branch 1 & 2: Origin header present
  if (originHeader) {
    if (originHeader === canonicalOrigin) {
      return { isValid: true };
    }
    return {
      isValid: false,
      reason: `Origin '${originHeader}' does not match canonical origin '${canonicalOrigin}'`,
    };
  }

  // Branch 3: Origin missing -> fallback to Sec-Fetch-Site
  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite === 'same-origin') {
    return { isValid: true };
  }

  return {
    isValid: false,
    reason: secFetchSite
      ? `Sec-Fetch-Site '${secFetchSite}' is not same-origin`
      : 'Neither Origin nor Sec-Fetch-Site: same-origin headers are present',
  };
}
