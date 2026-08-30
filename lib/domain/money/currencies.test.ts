import { describe, it, expect } from 'vitest';
import {
  CURRENCY_CATALOG,
  SUPPORTED_CURRENCIES,
  getCurrency,
  getCurrencyDecimals,
  isSupportedCurrency,
} from './currencies';

describe('Currencies Catalog (AD-08 / AGENTS.md §C.9 / doc 3 §7)', () => {
  it('defines exactly CLP with 0 decimals and USD with 2 decimals', () => {
    expect(CURRENCY_CATALOG.CLP).toEqual({
      code: 'CLP',
      decimals: 0,
      symbol: '$',
      name: 'Peso chileno',
    });

    expect(CURRENCY_CATALOG.USD).toEqual({
      code: 'USD',
      decimals: 2,
      symbol: '$',
      name: 'Dólar estadounidense',
    });
  });

  it('lists supported currencies array matching catalog', () => {
    expect(SUPPORTED_CURRENCIES).toHaveLength(2);
    expect(SUPPORTED_CURRENCIES.map((c) => c.code)).toEqual(['CLP', 'USD']);
  });

  it('retrieves decimals accurately via getCurrencyDecimals', () => {
    expect(getCurrencyDecimals('CLP')).toBe(0);
    expect(getCurrencyDecimals('USD')).toBe(2);
  });

  it('throws descriptive error on unsupported currency code', () => {
    expect(() => getCurrency('EUR')).toThrow("Unsupported currency code: 'EUR'");
    expect(() => getCurrencyDecimals('INVALID')).toThrow("Unsupported currency code: 'INVALID'");
  });

  it('validates supported currency codes via isSupportedCurrency', () => {
    expect(isSupportedCurrency('CLP')).toBe(true);
    expect(isSupportedCurrency('USD')).toBe(true);
    expect(isSupportedCurrency('BRL')).toBe(false);
  });
});
