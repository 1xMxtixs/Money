import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import * as commonExports from './common';
import {
  strictObject,
  boundedString,
  uuidSchema,
  currencyCodeSchema,
  moneyAmountSchema,
  dateStringSchema,
  isoDateTimeSchema,
  paginationCursorSchema,
  isStrictSchema,
} from './common';

describe('Shared Zod Schemas & Strict Construction (doc 7 §6 / T2)', () => {
  it('strictObject rejects unknown keys by construction (Criterion 3 / T2)', () => {
    const testSchema = strictObject({
      name: boundedString(50, 1),
      age: z.number().int().positive(),
    });

    // Valid payload
    const validResult = testSchema.safeParse({ name: 'Alice', age: 30 });
    expect(validResult.success).toBe(true);

    // Payload with unknown field -> MUST FAIL with unrecognized_keys
    const invalidResult = testSchema.safeParse({
      name: 'Alice',
      age: 30,
      extraUnauthorizedField: 'malicious payload',
    });

    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.issues[0].code).toBe('unrecognized_keys');
    }
  });

  it('audits that all exported object schemas in lib/schemas/common are strict (T2)', () => {
    let objectSchemaCount = 0;
    for (const [exportName, exportedItem] of Object.entries(commonExports)) {
      if (exportedItem instanceof z.ZodObject || exportedItem instanceof z.ZodType) {
        if (exportedItem instanceof z.ZodObject) {
          objectSchemaCount++;
          expect(
            isStrictSchema(exportedItem),
            `Exported schema "${exportName}" must enforce .strict() by construction (T2 / RNF-SE-04)`
          ).toBe(true);
        }
      }
    }
    expect(objectSchemaCount).toBeGreaterThan(0);
  });

  it('fails audit when an object schema is not strict (T2 regression test)', () => {
    // A non-strict object schema fails the strictness check
    const looseSchema = z.object({
      id: z.string(),
    });
    expect(isStrictSchema(looseSchema)).toBe(false);

    // Testing strict schema passes
    const strictSchema = strictObject({
      id: z.string(),
    });
    expect(isStrictSchema(strictSchema)).toBe(true);
  });

  it('boundedString enforces mandatory upper limit and rejects unbounded values', () => {
    const stringSchema = boundedString(10, 2);

    expect(stringSchema.safeParse('hello').success).toBe(true);
    expect(stringSchema.safeParse('a').success).toBe(false); // too short (< 2)
    expect(stringSchema.safeParse('this is way too long string').success).toBe(false); // too long (> 10)
  });

  it('validates standard Money primitives correctly', () => {
    // UUIDv7 / UUID standard
    expect(uuidSchema.safeParse('0192f8a1-7c3e-7a45-9b21-4d5e6f7a8b9c').success).toBe(true);
    expect(uuidSchema.safeParse('invalid-uuid-string').success).toBe(false);

    // Currency code
    expect(currencyCodeSchema.safeParse('CLP').success).toBe(true);
    expect(currencyCodeSchema.safeParse('USD').success).toBe(true);
    expect(currencyCodeSchema.safeParse('EUR').success).toBe(false);

    // Money amount
    expect(moneyAmountSchema.safeParse({ minor: 1250000, currency: 'CLP' }).success).toBe(true);
    expect(moneyAmountSchema.safeParse({ minor: 0, currency: 'CLP' }).success).toBe(false); // must be positive
    expect(moneyAmountSchema.safeParse({ minor: -50, currency: 'USD' }).success).toBe(false);
    expect(moneyAmountSchema.safeParse({ minor: 12.5, currency: 'USD' }).success).toBe(false); // must be integer
    // Unknown field in money amount
    expect(moneyAmountSchema.safeParse({ minor: 100, currency: 'USD', extra: 1 }).success).toBe(false);

    // Date YYYY-MM-DD
    expect(dateStringSchema.safeParse('2026-03-14').success).toBe(true);
    expect(dateStringSchema.safeParse('2026-13-45').success).toBe(false);
    expect(dateStringSchema.safeParse('14/03/2026').success).toBe(false);

    // ISO DateTime
    expect(isoDateTimeSchema.safeParse('2026-03-14T21:47:03.412Z').success).toBe(true);
    expect(isoDateTimeSchema.safeParse('not-a-datetime').success).toBe(false);

    // Pagination cursor
    expect(paginationCursorSchema.safeParse('eyJkIjoiMjAyNi0wMy0xNCJ9').success).toBe(true);
    expect(paginationCursorSchema.safeParse(undefined).success).toBe(true);
  });
});
