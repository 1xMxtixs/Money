/**
 * Domain health check function.
 */
export function getDomainStatus(): { status: 'ok'; timestamp: number } {
  return {
    status: 'ok',
    timestamp: Date.now(),
  };
}
