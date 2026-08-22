/**
 * Canonical currencies catalog (AD-08 / AGENTS.md §C.9 / doc 3 §7).
 *
 * Single source of truth for supported currency definitions, decimals, symbols, and names.
 */

export interface CurrencyDefinition {
  readonly code: 'CLP' | 'USD';
  readonly decimals: number;
  readonly symbol: string;
  readonly name: string;
}

export const CURRENCY_CATALOG: Record<'CLP' | 'USD', CurrencyDefinition> = {
  CLP: {
    code: 'CLP',
    decimals: 0,
    symbol: '$',
    name: 'Peso chileno',
  },
  USD: {
    code: 'USD',
    decimals: 2,
    symbol: '$',
    name: 'Dólar estadounidense',
  },
} as const;

export const SUPPORTED_CURRENCIES: readonly CurrencyDefinition[] = Object.values(CURRENCY_CATALOG);

export type CurrencyCode = keyof typeof CURRENCY_CATALOG;

/**
 * Retrieves the currency definition for a given currency code.
 * Throws if the currency code is unsupported.
 */
export function getCurrency(code: string): CurrencyDefinition {
  const currency = CURRENCY_CATALOG[code as CurrencyCode];
  if (!currency) {
    throw new Error(`Unsupported currency code: '${code}'`);
  }
  return currency;
}

/**
 * Returns the exact decimal places declared for a currency in the catalog (doc 3 §7 / S7).
 */
export function getCurrencyDecimals(code: string): number {
  return getCurrency(code).decimals;
}

/**
 * Returns true if the currency code is supported by the catalog.
 */
export function isSupportedCurrency(code: string): code is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCY_CATALOG, code);
}
