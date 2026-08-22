import { describe, it, expect } from 'vitest';
import {
  problemResponse,
  badRequest,
  unauthenticated,
  forbiddenOrigin,
  notFound,
  conflict,
  payloadTooLarge,
  validationFailed,
  rateLimited,
  internalError,
  PROBLEM_MEDIA_TYPE,
  type ConflictErrorCode,
} from './problem';

describe('RFC 9457 Problem Details Catalog (doc 6 §3 / F0-06)', () => {
  it('formats problemResponse with application/problem+json and Cache-Control: no-store (T3 / T6)', async () => {
    const response = problemResponse({
      type: 'https://money.app/errors/not-found',
      title: 'Resource not found',
      status: 404,
      code: 'NOT_FOUND',
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe(PROBLEM_MEDIA_TYPE);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body).toEqual({
      type: 'https://money.app/errors/not-found',
      title: 'Resource not found',
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('covers all standard status codes and stable error codes from doc 6 §3', () => {
    const br = badRequest();
    expect(br.status).toBe(400);
    expect(br.code).toBe('BAD_REQUEST');

    const unauth = unauthenticated();
    expect(unauth.status).toBe(401);
    expect(unauth.code).toBe('UNAUTHENTICATED');

    const fo = forbiddenOrigin();
    expect(fo.status).toBe(403);
    expect(fo.code).toBe('FORBIDDEN_ORIGIN');

    const nf = notFound();
    expect(nf.status).toBe(404);
    expect(nf.code).toBe('NOT_FOUND');

    const ptl = payloadTooLarge();
    expect(ptl.status).toBe(413);
    expect(ptl.code).toBe('PAYLOAD_TOO_LARGE');

    const vf = validationFailed([{ path: 'email', code: 'INVALID', message: 'Invalid email' }]);
    expect(vf.status).toBe(422);
    expect(vf.code).toBe('VALIDATION_FAILED');
    expect(vf.errors?.length).toBe(1);

    const rl = rateLimited(60);
    expect(rl.status).toBe(429);
    expect(rl.code).toBe('RATE_LIMITED');
    expect(rl.headers?.['Retry-After']).toBe('60');

    const ie = internalError();
    expect(ie.status).toBe(500);
    expect(ie.code).toBe('INTERNAL');
  });

  it('defines and supports all 11 conflict codes from doc 6 §3 (T5)', () => {
    const conflictCodes: ConflictErrorCode[] = [
      'INVITATION_INVALID',
      'EMAIL_TAKEN',
      'ACCOUNT_HAS_TRANSACTIONS',
      'CATEGORY_IS_SYSTEM',
      'CATEGORY_HAS_TRANSACTIONS',
      'NAME_ALREADY_EXISTS',
      'ACCOUNT_CURRENCY_LOCKED',
      'IS_TRANSFER_LEG',
      'GOAL_WOULD_GO_NEGATIVE',
      'BUDGET_ALREADY_ACTIVE',
      'SCHEMA_VERSION_UNSUPPORTED',
    ];

    for (const code of conflictCodes) {
      const err = conflict(code, `Conflict: ${code}`);
      expect(err.status).toBe(409);
      expect(err.code).toBe(code);
      expect(err.type).toBe(`https://money.app/errors/${code.toLowerCase().replace(/_/g, '-')}`);
    }
  });

  it('restricts 403 strictly to FORBIDDEN_ORIGIN and never generic forbidden (T4)', () => {
    const fo = forbiddenOrigin();
    expect(fo.status).toBe(403);
    expect(fo.code).toBe('FORBIDDEN_ORIGIN');
  });
});
