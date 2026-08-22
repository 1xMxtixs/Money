import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  apiHandler,
  jsonResponse,
  createdResponse,
  noContentResponse,
  readBoundedJsonBody,
} from './handler';
import {
  HttpError,
  badRequest,
  unauthenticated,
  forbiddenOrigin,
  notFound,
  conflict,
  rateLimited,
  PROBLEM_MEDIA_TYPE,
} from './problem';
import { strictObject, boundedString } from '@/lib/schemas/common';

describe('API Route Handler Wrapper (F0-06 / lib/api/handler.ts)', () => {
  describe('Criterion: 422 Validation Error on Unknown Field (T2 / RNF-SE-04)', () => {
    const testBodySchema = strictObject({
      amount: z.number().int().positive(),
      categoryId: boundedString(50, 1),
    });

    const handler = apiHandler(
      async ({ body }) => {
        return { success: true, received: body };
      },
      { bodySchema: testBodySchema }
    );

    it('returns 422 VALIDATION_FAILED when payload contains unknown field', async () => {
      const payload = {
        amount: 1000,
        categoryId: '018d0000-0000-7000-8000-000000000001',
        unknownField: 'unauthorized_extra_value',
      };

      const req = new Request('https://money.app/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const response = await handler(req);

      expect(response.status).toBe(422);
      expect(response.headers.get('Content-Type')).toBe(PROBLEM_MEDIA_TYPE);
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      const body = await response.json();
      expect(body).toMatchObject({
        type: 'https://money.app/errors/validation-failed',
        title: 'Validation failed',
        status: 422,
        code: 'VALIDATION_FAILED',
      });
      expect(Array.isArray(body.errors)).toBe(true);
      expect(body.errors.some((e: { code: string }) => e.code === 'UNRECOGNIZED_KEYS')).toBe(true);
    });

    it('accepts valid payload without extra fields', async () => {
      const payload = {
        amount: 1000,
        categoryId: '018d0000-0000-7000-8000-000000000001',
      };

      const req = new Request('https://money.app/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const response = await handler(req);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = await response.json();
      expect(body).toEqual({ success: true, received: payload });
    });
  });

  describe('Criterion: 413 Payload Too Large at 100 KB Boundary (T1 / doc 7 §6)', () => {
    // Generate 200 KB string (200 * 1024 bytes)
    const largePayload = JSON.stringify({
      data: 'x'.repeat(200 * 1024),
    });

    it('rejects 200 KB payload with early 413 when Content-Length header is present (Variant A)', async () => {
      const req = new Request('https://money.app/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(largePayload.length),
        },
        body: largePayload,
      });

      const handler = apiHandler(async () => ({ ok: true }));
      const response = await handler(req);

      expect(response.status).toBe(413);
      expect(response.headers.get('Content-Type')).toBe(PROBLEM_MEDIA_TYPE);
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      const body = await response.json();
      expect(body.code).toBe('PAYLOAD_TOO_LARGE');
      expect(body.status).toBe(413);
    });

    it('rejects 200 KB payload with streaming 413 when Content-Length header is missing (Variant B - Chunked/Streamed)', async () => {
      // Create a ReadableStream without Content-Length header
      const encoder = new TextEncoder();
      const chunk1 = encoder.encode('{"data":"' + 'a'.repeat(60 * 1024));
      const chunk2 = encoder.encode('b'.repeat(60 * 1024));
      const chunk3 = encoder.encode('c'.repeat(80 * 1024) + '"}');

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(chunk1);
          controller.enqueue(chunk2);
          controller.enqueue(chunk3);
          controller.close();
        },
      });

      const req = new Request('https://money.app/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Explicitly omit Content-Length
        },
        body: stream,
        // @ts-expect-error duplex required for streaming in Node fetch
        duplex: 'half',
      });

      const handler = apiHandler(async () => ({ ok: true }));
      const response = await handler(req);

      expect(response.status).toBe(413);
      expect(response.headers.get('Content-Type')).toBe(PROBLEM_MEDIA_TYPE);
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      const body = await response.json();
      expect(body.code).toBe('PAYLOAD_TOO_LARGE');
      expect(body.status).toBe(413);
    });

    it('readBoundedJsonBody allows payloads <= 100 KB', async () => {
      const validPayload = JSON.stringify({ message: 'within bounds', data: 'x'.repeat(10 * 1024) });
      const req = new Request('https://money.app/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: validPayload,
      });

      const parsed = await readBoundedJsonBody(req);
      expect(parsed).toEqual(JSON.parse(validPayload));
    });
  });

  describe('Criterion: 500 Internal Error Leak Prevention (T7)', () => {
    it('returns generic INTERNAL error without leaking exception text or traces in the response body', async () => {
      const secretExceptionText = 'FATAL_SQL_CRASH_users_table_password_hash_column_compromised';

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const throwingHandler = apiHandler(async () => {
        throw new Error(secretExceptionText);
      });

      const req = new Request('https://money.app/api/test', { method: 'GET' });
      const response = await throwingHandler(req);

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe(PROBLEM_MEDIA_TYPE);
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      const rawText = await response.text();
      const jsonBody = JSON.parse(rawText);

      // Verify that secret text is nowhere in the response text
      expect(rawText).not.toContain(secretExceptionText);
      expect(rawText).not.toContain('users_table');
      expect(rawText).not.toContain('password_hash');

      // Verify standardized problem shape
      expect(jsonBody).toEqual({
        type: 'https://money.app/errors/internal',
        title: 'An unexpected error occurred',
        status: 500,
        code: 'INTERNAL',
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Universal Cache-Control: no-store Enforcement (T3)', () => {
    it('enforces Cache-Control: no-store across all successful response helpers (200, 201, 204)', async () => {
      const res200 = jsonResponse({ data: 'ok' });
      expect(res200.status).toBe(200);
      expect(res200.headers.get('Cache-Control')).toBe('no-store');

      const res201 = createdResponse({ id: '018d0000-0000-7000-8000-000000000001' });
      expect(res201.status).toBe(201);
      expect(res201.headers.get('Cache-Control')).toBe('no-store');

      const res204 = noContentResponse();
      expect(res204.status).toBe(204);
      expect(res204.headers.get('Cache-Control')).toBe('no-store');
    });

    it('enforces Cache-Control: no-store across all HttpError problem details responses', async () => {
      const errorCases: HttpError[] = [
        badRequest(),
        unauthenticated(),
        forbiddenOrigin(),
        notFound(),
        conflict('NAME_ALREADY_EXISTS'),
        rateLimited(30),
      ];

      for (const err of errorCases) {
        const handler = apiHandler(async () => {
          throw err;
        });

        const res = await handler(new Request('https://money.app/api/test', { method: 'GET' }));
        expect(res.status).toBe(err.status);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(res.headers.get('Content-Type')).toBe(PROBLEM_MEDIA_TYPE);
      }
    });
  });

  describe('Malformed JSON Handling', () => {
    it('returns 400 BAD_REQUEST on invalid JSON body', async () => {
      const req = new Request('https://money.app/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ malformed json :: ',
      });

      const handler = apiHandler(async ({ body }) => body);
      const response = await handler(req);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe('BAD_REQUEST');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
  });
});
