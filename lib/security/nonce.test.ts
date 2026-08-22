import { describe, it, expect } from 'vitest';
import { generateNonce } from './nonce';

describe('Cryptographic Nonce Generator (T6 / SP-02)', () => {
  it('generates a valid 16-byte base64 encoded string', () => {
    const nonce = generateNonce();

    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBeGreaterThan(0);

    // 16 bytes base64 encoded is 24 characters (including padding)
    expect(nonce.length).toBe(24);
    expect(/^[A-Za-z0-9+/]+={0,2}$/.test(nonce)).toBe(true);
  });

  it('generates distinct nonces on consecutive calls (per-request crypto randomness, never cached)', () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    const nonce3 = generateNonce();

    expect(nonce1).not.toBe(nonce2);
    expect(nonce2).not.toBe(nonce3);
    expect(nonce1).not.toBe(nonce3);
  });
});
