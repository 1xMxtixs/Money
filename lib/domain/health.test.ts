import { describe, it, expect } from 'vitest';
import { getDomainStatus } from '@/lib/domain/health';

describe('Domain health', () => {
  it('returns ok status', () => {
    const status = getDomainStatus();
    expect(status.status).toBe('ok');
    expect(typeof status.timestamp).toBe('number');
  });
});
