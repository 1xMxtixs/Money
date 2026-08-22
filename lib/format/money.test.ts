import { describe, it, expect } from 'vitest';
import { formatMoney } from './money';

describe('Format Money Helper (F0-08 / doc 5 §12 / doc 3 §4)', () => {
  // Normalize non-breaking spaces (U+00A0 and U+202F) produced by Intl in various environments
  const cleanSpaces = (str: string) => str.replace(/[\u00A0\u202F]/g, ' ').trim();

  describe('Mandatory Test: CLP without decimals and USD with two decimals across languages', () => {
    it('formats CLP (0 decimals) in es-CL / es without decimals', () => {
      const formattedEs = formatMoney(12500n, 'CLP', 'es-CL');
      expect(cleanSpaces(formattedEs)).toMatch(/\$12\.500|\$ 12\.500/);
      expect(formattedEs).not.toMatch(/[,.]00/);
    });

    it('formats CLP (0 decimals) in en-US / en without decimals', () => {
      const formattedEn = formatMoney(12500n, 'CLP', 'en-US');
      expect(cleanSpaces(formattedEn)).toMatch(/\$12,500|CLP 12,500/);
      expect(formattedEn).not.toMatch(/[,.]00/);
    });

    it('formats USD (2 decimals) in es-CL / es with two decimals', () => {
      const formattedEs = formatMoney(1250n, 'USD', 'es-CL');
      // In Spanish locale: comma is decimal separator -> 12,50
      expect(cleanSpaces(formattedEs)).toMatch(/12,50/);
    });

    it('formats USD (2 decimals) in en-US / en with two decimals', () => {
      const formattedEn = formatMoney(1250n, 'USD', 'en-US');
      // In English locale: period is decimal separator -> 12.50
      expect(cleanSpaces(formattedEn)).toMatch(/\$12\.50/);
    });
  });

  describe('Object-based and overloaded invocation signatures', () => {
    it('accepts { minor, currency } object', () => {
      const result = formatMoney({ minor: 5000, currency: 'CLP' }, 'es-CL');
      expect(cleanSpaces(result)).toMatch(/\$5\.000|\$ 5\.000/);
    });

    it('accepts { amountMinor, currency } object', () => {
      const result = formatMoney({ amountMinor: 999n, currency: 'USD' }, 'en-US');
      expect(cleanSpaces(result)).toMatch(/\$9\.99/);
    });

    it('accepts custom options object with locale', () => {
      const result = formatMoney(50000n, 'CLP', { locale: 'es-CL' });
      expect(cleanSpaces(result)).toMatch(/\$50\.000|\$ 50\.000/);
    });

    it('handles zero and negative values accurately', () => {
      const zeroClp = formatMoney(0n, 'CLP', 'es-CL');
      expect(cleanSpaces(zeroClp)).toMatch(/\$0|\$ 0/);

      const negUsd = formatMoney(-1500n, 'USD', 'en-US');
      expect(cleanSpaces(negUsd)).toMatch(/-\$15\.00|\(\$15\.00\)/);
    });
  });
});
