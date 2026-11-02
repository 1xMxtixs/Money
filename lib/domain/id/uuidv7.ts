/**
 * Time-ordered UUIDv7 generator according to RFC 9562 (AD-09).
 * Portable across Node.js and browser environments using globalThis.crypto.getRandomValues.
 */

let lastTime = -1;
let seq = 0;

/**
 * Generates a RFC 9562 compliant UUIDv7.
 *
 * Layout (128 bits):
 * - 48 bits: unix_ts_ms (milliseconds since Unix epoch)
 * - 4 bits: ver (0111 = 7)
 * - 12 bits: seq (monotonic sequence counter)
 * - 2 bits: var (10xx = RFC 4122 / 9562 variant)
 * - 62 bits: random bytes
 */
export function uuidv7(): string {
  const now = Date.now();

  if (now > lastTime) {
    lastTime = now;
    seq = 0;
  } else {
    seq++;
    if (seq > 0xfff) {
      lastTime++;
      seq = 0;
    }
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  // 48-bit timestamp (bytes 0..5)
  const ts = BigInt(lastTime);
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  // 4-bit version (7) + 12-bit sequence counter (bytes 6..7)
  bytes[6] = 0x70 | ((seq >> 8) & 0x0f);
  bytes[7] = seq & 0xff;

  // 2-bit variant (10xx) + 6-bit random (byte 8)
  bytes[8] = 0x80 | (bytes[8] & 0x3f);

  // bytes 9..15 remain random

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const UUIDV7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a string is a well-formed UUIDv7.
 */
export function isValidUuidv7(id: string): boolean {
  return UUIDV7_REGEX.test(id);
}
