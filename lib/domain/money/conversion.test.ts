import { describe, it, expect } from 'vitest';
import { minorToMajor, majorToMinor } from './conversion';

describe('Money Conversion Unit Operations (AD-08 / RA-06 / doc 3 §7)', () => {
  describe('minorToMajor', () => {
    it('converts CLP (0 decimals) identically without scaling as exact string', () => {
      expect(minorToMajor(1250000n, 'CLP')).toBe('1250000');
      expect(minorToMajor(1250000, 'CLP')).toBe('1250000');
      expect(minorToMajor(0n, 'CLP')).toBe('0');
      expect(minorToMajor(-500n, 'CLP')).toBe('-500');
    });

    it('converts USD (2 decimals) with exact decimal string representation', () => {
      expect(minorToMajor(1250n, 'USD')).toBe('12.50');
      expect(minorToMajor(1250, 'USD')).toBe('12.50');
      expect(minorToMajor(99n, 'USD')).toBe('0.99');
      expect(minorToMajor(1n, 'USD')).toBe('0.01');
      expect(minorToMajor(0n, 'USD')).toBe('0.00');
      expect(minorToMajor(-1250n, 'USD')).toBe('-12.50');
    });

    it('supports direct numeric decimals parameter', () => {
      expect(minorToMajor(1000n, 3)).toBe('1.000');
      expect(minorToMajor(1000n, 0)).toBe('1000');
      expect(minorToMajor(1n, 3)).toBe('0.001');
      expect(() => minorToMajor(100n, -1)).toThrow('Invalid currency decimals: -1');
      expect(() => minorToMajor(100n, 5)).toThrow('Invalid currency decimals: 5');
      expect(() => minorToMajor(100n, 1.5)).toThrow('Invalid currency decimals: 1.5');
    });

    it('preserves exact bigint precision without floating-point degradation', () => {
      expect(minorToMajor(9007199254740993n, 'USD')).toBe('90071992547409.93');
      expect(minorToMajor(0n, 'USD')).toBe('0.00');
      expect(minorToMajor(5n, 'USD')).toBe('0.05');
      expect(minorToMajor(-1n, 'USD')).toBe('-0.01');
      expect(minorToMajor(1250000n, 'CLP')).toBe('1250000');
    });
  });

  describe('majorToMinor', () => {
    it('converts CLP major numbers to bigint without decimals', () => {
      expect(majorToMinor(12500, 'CLP')).toBe(12500n);
      expect(majorToMinor('12500', 'CLP')).toBe(12500n);
      expect(majorToMinor(12500.4, 'CLP')).toBe(12500n);
      expect(majorToMinor('12500.4', 'CLP')).toBe(12500n);
      expect(majorToMinor(12500.5, 'CLP')).toBe(12501n);
      expect(majorToMinor('12500.5', 'CLP')).toBe(12501n);
      expect(majorToMinor(12500.6, 'CLP')).toBe(12501n);
    });

    it('converts USD major numbers to minor bigint with 2 decimal precision', () => {
      expect(majorToMinor(12.5, 'USD')).toBe(1250n);
      expect(majorToMinor('12.50', 'USD')).toBe(1250n);
      expect(majorToMinor(0.99, 'USD')).toBe(99n);
      expect(majorToMinor(0.01, 'USD')).toBe(1n);
      expect(majorToMinor('-0', 'USD')).toBe(0n);
    });

    it('performs exact round-half-up away from zero on fractional digits', () => {
      expect(majorToMinor('1.005', 'USD')).toBe(101n);
      expect(majorToMinor('0.145', 2)).toBe(15n);
      expect(majorToMinor('-1.005', 'USD')).toBe(-101n);
      expect(majorToMinor('12500.4', 'CLP')).toBe(12500n);
      expect(majorToMinor('12500.5', 'CLP')).toBe(12501n);
    });

    it('rejects ambiguous, non-canonical, or exponential formatting', () => {
      const invalidInputs = [
        '12.500,50',
        '12,500.50',
        '12,50',
        '1 250',
        '1e3',
        '',
        '  ',
        'not-a-number',
        'abc',
      ];
      for (const input of invalidInputs) {
        expect(() => majorToMinor(input, 'USD')).toThrow('Invalid numeric value for money conversion');
      }
      expect(() => majorToMinor(NaN, 'USD')).toThrow('Invalid numeric value for money conversion');
      expect(() => majorToMinor(Infinity, 'USD')).toThrow('Invalid numeric value for money conversion');
      expect(() => majorToMinor(-Infinity, 'USD')).toThrow('Invalid numeric value for money conversion');
    });

    it('preserves roundtrip precision between major string and minor bigint', () => {
      const largeMajor = '90071992547409.93';
      const largeMinor = 9007199254740993n;
      expect(majorToMinor(largeMajor, 'USD')).toBe(largeMinor);
      expect(minorToMajor(largeMinor, 'USD')).toBe(largeMajor);
    });
  });
});
