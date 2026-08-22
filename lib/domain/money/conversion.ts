import { getCurrencyDecimals, type CurrencyCode } from './currencies';

/**
 * Money unit conversion operations (AD-08 / RA-06 / doc 3 §7).
 *
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * All currency unit scaling and arithmetic between minor units (cents/pesos)
 * and major units (fractional representation) MUST reside exclusively inside
 * this module to satisfy RA-06 and the money/no-amount-arithmetic lint rule.
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
 * Converts an integer amount in minor units (e.g. cents/pesos) to major units (e.g. dollars/pesos).
 *
 * Example:
 * - CLP (0 decimals): 1250000 -> 1250000
 * - USD (2 decimals): 1250 -> 12.50
 */
export function minorToMajor(
  amountMinor: bigint | number,
  currencyOrDecimals: CurrencyCode | number | string
): number {
  const decimals = resolveDecimals(currencyOrDecimals);
  const numericMinor = typeof amountMinor === 'bigint' ? Number(amountMinor) : amountMinor;

  if (decimals === 0) {
    return numericMinor;
  }

  const factor = 10 ** decimals;
  return numericMinor / factor;
}

/**
 * Converts a major unit amount (number or numeric string) into integer minor units (bigint).
 * Applies standard round-half-up rounding to prevent floating-point representation drift.
 *
 * Example:
 * - CLP: 12500 -> 12500n
 * - USD: 12.5 -> 1250n
 */
export function majorToMinor(
  amountMajor: number | string,
  currencyOrDecimals: CurrencyCode | number | string
): bigint {
  const decimals = resolveDecimals(currencyOrDecimals);
  const numValue = typeof amountMajor === 'string' ? parseFloat(amountMajor.trim().replace(',', '.')) : amountMajor;

  if (Number.isNaN(numValue) || !Number.isFinite(numValue)) {
    throw new Error(`Invalid numeric value for money conversion: '${amountMajor}'`);
  }

  if (decimals === 0) {
    return BigInt(Math.round(numValue));
  }

  const factor = 10 ** decimals;
  const scaled = Math.round(numValue * factor);
  return BigInt(scaled);
}
