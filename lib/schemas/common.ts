import { z } from 'zod';

/**
 * Creates a strict Zod object schema where unknown keys are rejected by construction (T2 / RNF-SE-04).
 *
 * CRITICAL:
 * Every API request object schema must use strictObject or .strict() so unknown fields fail with 422.
 */
export function strictObject<T extends z.core.$ZodShape>(shape: T) {
  return z.strictObject(shape);
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

export const localeSchema = z.enum(['es-CL', 'en-US']);

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

export const isoDateTimeSchema = boundedString(64, 1).datetime({ error: 'Timestamp must be ISO-8601 UTC string' });

export const paginationCursorSchema = boundedString(500, 1).optional();

/**
 * Recursively inspects whether a given Zod schema enforces strict object validation
 * across its entire shape hierarchy (Hueco 1 / T2 / RNF-SE-04).
 *
 * Zod 4: refinements are checks (no wrapper) and transforms are pipes, so the walk
 * dispatches on the public `_zod.def.type` discriminator.
 */
export function isStrictSchema(schema: z.ZodType): boolean {
  if (!schema || typeof schema !== 'object') {
    return true;
  }

  // Structural view of the zod 4 def; fields vary per type.
  const def = schema._zod.def as unknown as {
    type: string;
    innerType?: z.ZodType;
    element?: z.ZodType;
    valueType?: z.ZodType;
    options?: z.ZodType[];
    items?: z.ZodType[];
    rest?: z.ZodType | null;
    left?: z.ZodType;
    right?: z.ZodType;
    in?: z.ZodType;
    out?: z.ZodType;
    shape?: Record<string, z.ZodType>;
    catchall?: z.ZodType;
  };
  const all = (list: Array<z.ZodType | null | undefined>) =>
    list.every((s) => !s || isStrictSchema(s));

  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'catch':
    case 'readonly':
    case 'nonoptional':
      return all([def.innerType]);
    case 'array':
      return all([def.element]);
    case 'record':
      return all([def.valueType]);
    case 'union':
      return all(def.options ?? []);
    case 'tuple':
      return all([...(def.items ?? []), def.rest]);
    case 'intersection':
      return all([def.left, def.right]);
    case 'pipe':
      return all([def.in, def.out]);
    case 'object':
      // strict <=> catchall is z.never()
      if (def.catchall?._zod.def.type !== 'never') {
        return false;
      }
      return all(Object.values(def.shape ?? {}));
    default:
      return true;
  }
}
