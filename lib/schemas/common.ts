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
 * Recursively inspects whether a given Zod schema enforces strict object validation
 * across its entire shape hierarchy (Hueco 1 / T2 / RNF-SE-04).
 */
export function isStrictSchema(schema: z.ZodTypeAny): boolean {
  if (!schema || typeof schema !== 'object') {
    return true;
  }

  // ZodEffects (.refine, .transform)
  if (schema instanceof z.ZodEffects) {
    return isStrictSchema(schema.innerType());
  }

  // ZodOptional / ZodNullable / ZodDefault / ZodCatch / ZodReadonly
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodCatch ||
    schema instanceof z.ZodReadonly
  ) {
    return isStrictSchema(schema._def.innerType);
  }

  // ZodArray
  if (schema instanceof z.ZodArray) {
    return isStrictSchema(schema.element);
  }

  // ZodRecord
  if (schema instanceof z.ZodRecord) {
    return isStrictSchema(schema.valueSchema);
  }

  // ZodUnion / ZodDiscriminatedUnion
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    return (schema.options as z.ZodTypeAny[]).every((opt: z.ZodTypeAny) =>
      isStrictSchema(opt)
    );
  }

  // ZodPipeline
  if (schema instanceof z.ZodPipeline) {
    return isStrictSchema(schema._def.in) && isStrictSchema(schema._def.out);
  }

  // ZodObject: MUST have unknownKeys === 'strict' AND all properties in shape must be strict
  if (schema instanceof z.ZodObject) {
    if (schema._def.unknownKeys !== 'strict') {
      return false;
    }

    const shape =
      typeof schema._def.shape === 'function'
        ? schema._def.shape()
        : schema.shape;

    for (const key of Object.keys(shape)) {
      if (!isStrictSchema(shape[key])) {
        return false;
      }
    }

    return true;
  }

  return true;
}
