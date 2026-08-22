// Fixture: Case 3 - Namespace import * as zz from 'zod'
import * as zz from 'zod';

export const namespaceImportSchemaViolation = zz.object({
  a: zz.string(),
});
