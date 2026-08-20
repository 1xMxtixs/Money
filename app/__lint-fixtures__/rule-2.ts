// Fixture: Violation of Rule 2 (app must not import lib/db directly)
import { db } from '@/lib/db';

export function testAppViolation() {
  return { db };
}
