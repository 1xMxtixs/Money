import { getCurrencyDecimals, type CurrencyCode } from './currencies';

/**
 * Money unit conversion operations (AD-08 / RA-06 / doc 3 §7).
 *
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * All currency unit scaling and arithmetic between minor units (cents/pesos)
 * and major units (fractional representation) MUST reside exclusively inside
 * this module to satisfy RA-06 and the money/no-amount-arithmetic lint rule.
 *
 * ZERO FLOATING POINT GUARANTEE:
 * All conversions use exact string manipulation and BigInt representation.
 * Floating-point arithmetic (Number(), Math.round(), parseFloat(), *, /)
 * on monetary amounts is strictly prohibited to prevent representation drift.
 */

function resolveDecimals(currencyOrDecimals: CurrencyCode | number | string): number {
  if (typeof currencyOrDecimals === 'number') {
    if (currencyOrDecimals < 0 || currencyOrDecimals > 4 || !Number.isInteger(currencyOrDecimals)) {
      throw new Error(`Invalid currency decimals: ${currencyOrDecimals}`);
    }
    return currencyOrDecimals;
  }
  return getCurrencyDecimals(currencyOrDecimals);
}

/**
 * Converts an integer amount in minor units (bigint or integer number) to major units as an exact decimal string.
 *
 * Example:
 * - CLP (0 decimals): 1250000n -> '1250000'
 * - USD (2 decimals): 1250n -> '12.50'
 * - USD (2 decimals): 5n -> '0.05'
 * - USD (2 decimals): 0n -> '0.00'
 * - USD (2 decimals): -1n -> '-0.01'
 */
export function minorToMajor(
  amountMinor: bigint | number,
  currencyOrDecimals: CurrencyCode | number | string
): string {
  const decimals = resolveDecimals(currencyOrDecimals);
  const rawBigInt = typeof amountMinor === 'bigint' ? amountMinor : BigInt(amountMinor);
  const isNegative = rawBigInt < 0n;
  const absBigInt = isNegative ? -rawBigInt : rawBigInt;

  if (decimals === 0) {
    return rawBigInt.toString();
  }

  const padded = absBigInt.toString().padStart(decimals + 1, '0');
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);

  return `${isNegative ? '-' : ''}${intPart}.${fracPart}`;
}

/**
 * Canonical numeric string pattern for money conversion:
 * Accepts optional negative sign, integer digits, and optional dot decimal separator with fractional digits.
 * Rejects thousands separators, exponential notation, spaces, and ambiguous formats.
 */
const CANONICAL_MONEY_REGEX = /^-?\d+(\.\d+)?$/;

/**
 * Converts a major unit amount (canonical numeric string or finite number) into integer minor units (bigint).
 * Applies exact round-half-up (away from zero) over decimal digits without floating-point arithmetic.
 *
 * Example:
 * - CLP: '12500' -> 12500n
 * - CLP: '12500.5' -> 12501n
 * - USD: '1.005' -> 101n
 * - USD: '-1.005' -> -101n
 * - USD: '0.145' -> 15n
 */
export function majorToMinor(
  amountMajor: number | string,
  currencyOrDecimals: CurrencyCode | number | string
): bigint {
  const decimals = resolveDecimals(currencyOrDecimals);
  const strValue =
    typeof amountMajor === 'number'
      ? String(amountMajor)
      : typeof amountMajor === 'string'
        ? amountMajor
        : '';

  if (!CANONICAL_MONEY_REGEX.test(strValue)) {
    throw new Error(`Invalid numeric value for money conversion: '${amountMajor}'`);
  }

  const isNegative = strValue.startsWith('-');
  const unsignedStr = isNegative ? strValue.slice(1) : strValue;
  const [intPart, fracPart = ''] = unsignedStr.split('.');

  const paddedFrac = fracPart.padEnd(decimals + 1, '0');
  const keptFrac = paddedFrac.slice(0, decimals);
  const roundDigit = paddedFrac[decimals];

  const baseStr = decimals === 0 ? intPart : `${intPart}${keptFrac}`;
  let magnitude = BigInt(baseStr);

  if (roundDigit >= '5') {
    magnitude += 1n;
  }

  if (isNegative && magnitude !== 0n) {
    return -magnitude;
  }

  return magnitude;
}
