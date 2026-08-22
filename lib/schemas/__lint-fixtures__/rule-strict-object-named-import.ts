// Fixture: Case 1 - Direct named import { object } from 'zod'
import { object, string } from 'zod';

export const namedImportSchemaViolation = object({
  a: string(),
});
