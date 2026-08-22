/**
 * Generates a cryptographically secure 16-byte random nonce encoded in base64 (T6 / SP-02).
 *
 * CRITICAL:
 * Generated per request via crypto.getRandomValues (never Math.random, never cached or reused across requests).
 */
export function generateNonce(): string {
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }

  // Fallback for Web API runtime
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}
