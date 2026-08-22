import { z } from 'zod';
import {
  problemResponse,
  HttpError,
  payloadTooLarge,
  badRequest,
  validationFailed,
  internalError,
  type FieldError,
} from './problem';

export const MAX_BODY_BYTES = 102_400; // 100 KB strict limit (doc 7 §6 / RNF-SE-04)

/**
 * Reads a JSON request body with strict bounded byte limit (T1 / doc 7 §6).
 *
 * Enforces two-tier defense:
 * 1. Immediate 413 rejection if Content-Length header is present and exceeds maxBytes.
 * 2. Streaming reader abort if incoming chunk stream exceeds maxBytes (protects chunked/unbounded transfers).
 */
export async function readBoundedJsonBody(
  req: Request,
  maxBytes = MAX_BODY_BYTES
): Promise<unknown> {
  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
      throw payloadTooLarge();
    }
  }

  if (!req.body) {
    return undefined;
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel('PAYLOAD_TOO_LARGE');
          throw payloadTooLarge();
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder('utf-8').decode(merged);
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw badRequest('Malformed JSON payload in request body');
  }
}

/**
 * Maps Zod validation issues into stable FieldError items (AC-04).
 */
export function formatZodErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    const code = issue.code.toUpperCase();
    return {
      path: path || '_root',
      code,
      message: issue.message,
    };
  });
}

/**
 * Standard successful JSON response with Cache-Control: no-store (AC-11 / T3).
 */
export function jsonResponse(
  data: unknown,
  status = 200,
  customHeaders?: HeadersInit
): Response {
  const headers = new Headers(customHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

/**
 * 201 Created response for PUT/POST resource creations with Cache-Control: no-store (AC-08 / T3).
 */
export function createdResponse(
  data: unknown,
  customHeaders?: HeadersInit
): Response {
  return jsonResponse(data, 201, customHeaders);
}

/**
 * 204 No Content response for deletions and void actions with Cache-Control: no-store (AC-11 / T3).
 */
export function noContentResponse(customHeaders?: HeadersInit): Response {
  const headers = new Headers(customHeaders);
  headers.set('Cache-Control', 'no-store');

  return new Response(null, {
    status: 204,
    headers,
  });
}

export interface ApiHandlerContext<TBody = unknown, TParams = Record<string, string>> {
  req: Request;
  body: TBody;
  params: TParams;
}

export interface ApiHandlerOptions<TBody> {
  bodySchema?: z.ZodType<TBody>;
  maxBodyBytes?: number;
}

/**
 * Central API route wrapper ensuring strict error handling, 100 KB payload bounds,
 * Zod validation with 422 problem details, and universal Cache-Control: no-store (F0-06).
 */
export function apiHandler<TBody = unknown, TParams = Record<string, string>>(
  handler: (ctx: ApiHandlerContext<TBody, TParams>) => Promise<Response | unknown>,
  options?: ApiHandlerOptions<TBody>
) {
  return async (
    req: Request,
    routeContext?: { params?: Promise<TParams> | TParams }
  ): Promise<Response> => {
    try {
      const resolvedParams = routeContext?.params
        ? await Promise.resolve(routeContext.params)
        : ({} as TParams);

      let body: TBody = undefined as unknown as TBody;

      const hasBody =
        req.method === 'POST' ||
        req.method === 'PUT' ||
        req.method === 'PATCH' ||
        Boolean(options?.bodySchema);

      if (hasBody) {
        const rawBody = await readBoundedJsonBody(
          req,
          options?.maxBodyBytes ?? MAX_BODY_BYTES
        );

        if (options?.bodySchema) {
          const parseResult = options.bodySchema.safeParse(rawBody);
          if (!parseResult.success) {
            throw validationFailed(formatZodErrors(parseResult.error));
          }
          body = parseResult.data;
        } else {
          body = rawBody as TBody;
        }
      }

      const result = await handler({ req, body, params: resolvedParams });

      if (result instanceof Response) {
        result.headers.set('Cache-Control', 'no-store');
        return result;
      }

      return jsonResponse(result);
    } catch (error: unknown) {
      if (error instanceof HttpError) {
        return problemResponse(
          {
            type:
              error.type ||
              `https://money.app/errors/${error.code.toLowerCase().replace(/_/g, '-')}`,
            title: error.message,
            status: error.status,
            code: error.code,
            errors: error.errors,
          },
          error.headers
        );
      }

      if (error instanceof z.ZodError) {
        return problemResponse({
          type: 'https://money.app/errors/validation-failed',
          title: 'Validation failed',
          status: 422,
          code: 'VALIDATION_FAILED',
          errors: formatZodErrors(error),
        });
      }

      // T7: Sanitize 500 internal errors: log internally, never leak message or trace
      console.error('Unhandled internal API error:', error);

      const internalErr = internalError();
      return problemResponse({
        type: internalErr.type || 'https://money.app/errors/internal',
        title: internalErr.message,
        status: internalErr.status,
        code: internalErr.code,
      });
    }
  };
}
