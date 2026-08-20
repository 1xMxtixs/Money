// Fixture: Violation of Rule 4 (features/accounts must not import other features)
import { TransactionList } from '@/features/transactions';

export function testCrossFeatureViolation() {
  return { TransactionList };
}
