import { z } from 'zod';

/**
 * Creates a strict Zod object schema where unknown keys are rejected by construction (T2 / RNF-SE-04).
 *
 * CRITICAL:
 * Every API request object schema must use strictObject or .strict() so unknown fields fail with 422.
 */
export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}

/**
 * Creates a bounded string schema with a mandatory upper limit (T2 / doc 7 §6).
 *
 * CRITICAL:
 * Prevents memory saturation from unbounded payload strings.
 */
export function boundedString(
  max: number,
  min = 0,
  options?: { message?: string }
) {
  if (typeof max !== 'number' || max <= 0) {
    throw new Error('boundedString requires a positive max length.');
  }

  let schema = z.string();
  if (min > 0) {
    schema = schema.min(min, options?.message);
  }
  return schema.max(max, options?.message);
}

// ---------- Standard Primitives ----------

export const uuidSchema = boundedString(36, 36).regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  'Invalid UUID format'
);

export const currencyCodeSchema = z.enum(['CLP', 'USD']);

export const moneyAmountSchema = strictObject({
  minor: z
    .number()
    .int('Amount in minor units must be an integer')
    .positive('Amount must be positive'),
  currency: currencyCodeSchema,
});

export const dateStringSchema = boundedString(10, 10).regex(
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  'Date must be in YYYY-MM-DD format'
);

export const isoDateTimeSchema = boundedString(64, 1).datetime({
  message: 'Timestamp must be ISO-8601 UTC string',
});

export const paginationCursorSchema = boundedString(500, 1).optional();

/**
 * Inspects whether a given Zod schema enforces strict object validation.
 */
export function isStrictSchema(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodEffects) {
    return isStrictSchema(schema.innerType());
  }

  if (schema instanceof z.ZodObject) {
    return schema._def.unknownKeys === 'strict';
  }

  return true;
}
