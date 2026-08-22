// Fixture: Case 2 - Computed property access z['object'] from 'zod'
import { z } from 'zod';

export const computedPropertySchemaViolation = z['object']({
  a: z.string(),
});
