// Fixture: Violation of db encapsulation (lib/db must not be imported outside lib/repos/**)
import { db } from '@/lib/db';

export function testApiDbViolation() {
  return { db };
}
