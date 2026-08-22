import { NextResponse, type NextRequest } from 'next/server';
import { generateNonce } from '@/lib/security/nonce';
import { getSecurityHeaders, verifyMutationOrigin } from '@/lib/security/headers';
import { forbiddenOrigin, problemResponse } from '@/lib/api/problem';

export function middleware(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith('/api');

  // Anti-CSRF Origin verification on mutations (doc 7 §8 / SP-05 / T5)
  const originCheck = verifyMutationOrigin({
    method: req.method,
    headers: req.headers,
    url: req.url,
  });

  if (!originCheck.isValid) {
    const err = forbiddenOrigin();
    return problemResponse(
      {
        type: err.type || 'https://money.app/errors/forbidden-origin',
        title: err.message,
        status: err.status,
        code: err.code,
      },
      err.headers
    );
  }

  const nonce = generateNonce();
  const securityHeaders = getSecurityHeaders({ nonce, isApi });

  // Propagate nonce and CSP to Next.js internals via request headers (T2)
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(
    'content-security-policy',
    securityHeaders['Content-Security-Policy']
  );

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Apply all security headers to the outgoing response (doc 7 §7)
  for (const [key, value] of Object.entries(securityHeaders)) {
    res.headers.set(key, value);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
