import { describe, it, expect } from 'vitest';
import { formatNumber, formatPercent } from './number';

describe('Number Formatting Helper (F0-08 / Criterion 3)', () => {
  const cleanSpaces = (str: string) => str.replace(/[\u00A0\u202F]/g, ' ').trim();

  describe('formatNumber', () => {
    it('formats grouped integers in Spanish and English', () => {
      const es = formatNumber(1250000, 'es-CL');
      expect(cleanSpaces(es)).toBe('1.250.000');

      const en = formatNumber(1250000, 'en-US');
      expect(cleanSpaces(en)).toBe('1,250,000');
    });

    it('formats decimals according to locale conventions', () => {
      const es = formatNumber(1234.56, 'es-CL', { minimumFractionDigits: 2 });
      expect(cleanSpaces(es)).toBe('1.234,56');

      const en = formatNumber(1234.56, 'en-US', { minimumFractionDigits: 2 });
      expect(cleanSpaces(en)).toBe('1,234.56');
    });
  });

  describe('formatPercent', () => {
    it('formats percentage values', () => {
      const es = formatPercent(0.75, 'es-CL');
      expect(cleanSpaces(es)).toMatch(/75\s*%/);

      const en = formatPercent(0.855, 'en-US');
      expect(cleanSpaces(en)).toBe('85.5%');
    });
  });
});
