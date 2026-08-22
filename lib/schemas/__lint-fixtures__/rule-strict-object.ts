// Fixture: Violation of Rule 8 / Criterion 3 (Direct z.object() prohibited outside lib/schemas/common.ts)
import { z } from 'zod';

export const testLooseObjectViolation = z.object({
  field: z.string(),
});
