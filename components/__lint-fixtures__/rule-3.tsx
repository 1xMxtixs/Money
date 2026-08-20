// Fixture: Violation of Rule 3 (components must not import features)
import { LoginForm } from '@/features/auth';

export function TestComponentsViolation() {
  return <LoginForm />;
}
