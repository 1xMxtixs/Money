/**
 * Problem Details for HTTP APIs (RFC 9457 / AC-04 / doc 6 §3).
 *
 * Provides standard error responses with stable machine-readable error codes
 * and field-level validation error mappings.
 */

export const PROBLEM_MEDIA_TYPE = 'application/problem+json; charset=utf-8';

export type ConflictErrorCode =
  | 'CONFLICT'
  | 'INVITATION_INVALID'
  | 'EMAIL_TAKEN'
  | 'ACCOUNT_HAS_TRANSACTIONS'
  | 'CATEGORY_IS_SYSTEM'
  | 'CATEGORY_HAS_TRANSACTIONS'
  | 'NAME_ALREADY_EXISTS'
  | 'ACCOUNT_CURRENCY_LOCKED'
  | 'IS_TRANSFER_LEG'
  | 'GOAL_WOULD_GO_NEGATIVE'
  | 'BUDGET_ALREADY_ACTIVE'
  | 'SCHEMA_VERSION_UNSUPPORTED';

export type StandardErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_ORIGIN'
  | 'NOT_FOUND'
  | ConflictErrorCode
  | 'PAYLOAD_TOO_LARGE'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface FieldError {
  path: string;
  code: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: StandardErrorCode;
  errors?: FieldError[];
  [key: string]: unknown;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: StandardErrorCode;
  readonly errors?: FieldError[];
  readonly type?: string;
  readonly headers?: Record<string, string>;

  constructor(options: {
    status: number;
    code: StandardErrorCode;
    title?: string;
    message?: string;
    errors?: FieldError[];
    type?: string;
    headers?: Record<string, string>;
  }) {
    const message = options.title || options.message || options.code;
    super(message);
    this.name = 'HttpError';
    this.status = options.status;
    this.code = options.code;
    this.errors = options.errors;
    this.type = options.type;
    this.headers = options.headers;
  }
}

/**
 * Creates an RFC 9457 compliant Problem Details Response with Cache-Control: no-store (AC-04 / T3 / T6).
 */
export function problemResponse(
  details: ProblemDetails,
  customHeaders?: HeadersInit
): Response {
  const headers = new Headers(customHeaders);
  headers.set('Content-Type', PROBLEM_MEDIA_TYPE);
  headers.set('Cache-Control', 'no-store');

  return new Response(JSON.stringify(details), {
    status: details.status,
    headers,
  });
}

function resolveProblemType(code: StandardErrorCode): string {
  return `https://money.app/errors/${code.toLowerCase().replace(/_/g, '-')}`;
}

export function badRequest(
  title = 'Malformed or invalid request',
  errors?: FieldError[]
): HttpError {
  return new HttpError({
    status: 400,
    code: 'BAD_REQUEST',
    title,
    errors,
    type: resolveProblemType('BAD_REQUEST'),
  });
}

export function unauthenticated(title = 'Authentication required'): HttpError {
  return new HttpError({
    status: 401,
    code: 'UNAUTHENTICATED',
    title,
    type: resolveProblemType('UNAUTHENTICATED'),
  });
}

/**
 * 403 Forbidden Origin (T4).
 * Used exclusively for mutation origin verification (doc 6 §3 / doc 7 §8).
 * Never used for other users' resources (which must return 404 NOT_FOUND).
 */
export function forbiddenOrigin(
  title = 'Request origin is not allowed'
): HttpError {
  return new HttpError({
    status: 403,
    code: 'FORBIDDEN_ORIGIN',
    title,
    type: resolveProblemType('FORBIDDEN_ORIGIN'),
  });
}

/**
 * 404 Not Found (AC-05 / T4).
 * Returned when a resource does not exist OR belongs to another user.
 */
export function notFound(title = 'Resource not found'): HttpError {
  return new HttpError({
    status: 404,
    code: 'NOT_FOUND',
    title,
    type: resolveProblemType('NOT_FOUND'),
  });
}

export function conflict(
  code: ConflictErrorCode = 'CONFLICT',
  title = 'Request conflict'
): HttpError {
  return new HttpError({
    status: 409,
    code,
    title,
    type: resolveProblemType(code),
  });
}

export function payloadTooLarge(
  title = 'Payload exceeds maximum limit of 100 KB'
): HttpError {
  return new HttpError({
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    title,
    type: resolveProblemType('PAYLOAD_TOO_LARGE'),
  });
}

export function validationFailed(
  errors: FieldError[],
  title = 'Validation failed'
): HttpError {
  return new HttpError({
    status: 422,
    code: 'VALIDATION_FAILED',
    title,
    errors,
    type: resolveProblemType('VALIDATION_FAILED'),
  });
}

export function rateLimited(
  retryAfterSeconds?: number,
  title = 'Too many requests'
): HttpError {
  const headers: Record<string, string> = {};
  if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
    headers['Retry-After'] = String(Math.ceil(retryAfterSeconds));
  }

  return new HttpError({
    status: 429,
    code: 'RATE_LIMITED',
    title,
    headers,
    type: resolveProblemType('RATE_LIMITED'),
  });
}

/**
 * 500 Internal Server Error (T7).
 * Strictly generic title without leaking internal details, traces, or identifiers.
 */
export function internalError(): HttpError {
  return new HttpError({
    status: 500,
    code: 'INTERNAL',
    title: 'An unexpected error occurred',
    type: resolveProblemType('INTERNAL'),
  });
}
