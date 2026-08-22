import { describe, it, expect } from 'vitest';
import { minorToMajor, majorToMinor } from './conversion';

describe('Money Conversion Unit Operations (AD-08 / RA-06 / doc 3 §7)', () => {
  describe('minorToMajor', () => {
    it('converts CLP (0 decimals) identically without scaling', () => {
      expect(minorToMajor(1250000n, 'CLP')).toBe(1250000);
      expect(minorToMajor(1250000, 'CLP')).toBe(1250000);
      expect(minorToMajor(0n, 'CLP')).toBe(0);
      expect(minorToMajor(-500n, 'CLP')).toBe(-500);
    });

    it('converts USD (2 decimals) with 100 factor scaling', () => {
      expect(minorToMajor(1250n, 'USD')).toBe(12.5);
      expect(minorToMajor(1250, 'USD')).toBe(12.5);
      expect(minorToMajor(99n, 'USD')).toBe(0.99);
      expect(minorToMajor(1n, 'USD')).toBe(0.01);
      expect(minorToMajor(0n, 'USD')).toBe(0);
      expect(minorToMajor(-1250n, 'USD')).toBe(-12.5);
    });

    it('supports direct numeric decimals parameter', () => {
      expect(minorToMajor(1000n, 3)).toBe(1);
      expect(minorToMajor(1000n, 0)).toBe(1000);
    });
  });

  describe('majorToMinor', () => {
    it('converts CLP major numbers to bigint without decimals', () => {
      expect(majorToMinor(12500, 'CLP')).toBe(12500n);
      expect(majorToMinor('12500', 'CLP')).toBe(12500n);
      expect(majorToMinor(12500.4, 'CLP')).toBe(12500n); // round-half-up
      expect(majorToMinor(12500.6, 'CLP')).toBe(12501n);
    });

    it('converts USD major numbers to minor bigint with 2 decimal precision', () => {
      expect(majorToMinor(12.5, 'USD')).toBe(1250n);
      expect(majorToMinor('12.50', 'USD')).toBe(1250n);
      expect(majorToMinor('12,50', 'USD')).toBe(1250n);
      expect(majorToMinor(0.99, 'USD')).toBe(99n);
      expect(majorToMinor(0.01, 'USD')).toBe(1n);
    });

    it('throws on invalid numeric input', () => {
      expect(() => majorToMinor('not-a-number', 'USD')).toThrow('Invalid numeric value');
      expect(() => majorToMinor(NaN, 'USD')).toThrow('Invalid numeric value');
    });
  });
});
