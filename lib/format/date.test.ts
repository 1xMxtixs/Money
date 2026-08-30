import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatMonthYear, formatRelativeTime } from './date';

describe('Date Formatting Helper (F0-08 / Criterion 3 / doc 5 §12)', () => {
  const fixedDate = new Date('2026-08-22T15:30:00Z');

  describe('formatDate', () => {
    it('formats date in Spanish (es-CL)', () => {
      const result = formatDate(fixedDate, 'es-CL');
      expect(result.toLowerCase()).toContain('2026');
      expect(result.toLowerCase()).toMatch(/22|ago/);
    });

    it('formats date in English (en-US)', () => {
      const result = formatDate(fixedDate, 'en-US');
      expect(result).toContain('2026');
      expect(result).toMatch(/Aug|22/);
    });

    it('accepts ISO date string input', () => {
      const result = formatDate('2026-12-31', 'en-US');
      expect(result).toContain('2026');
      expect(result).toContain('Dec');
    });

    it('throws on invalid date input', () => {
      expect(() => formatDate('invalid-date')).toThrow('Invalid date input');
    });
  });

  describe('formatMonthYear', () => {
    it('formats month and year in Spanish and English', () => {
      const es = formatMonthYear(fixedDate, 'es-CL');
      expect(es.toLowerCase()).toContain('agosto');
      expect(es).toContain('2026');

      const en = formatMonthYear(fixedDate, 'en-US');
      expect(en).toContain('August');
      expect(en).toContain('2026');
    });
  });

  describe('formatDateTime', () => {
    it('includes time components', () => {
      const result = formatDateTime(fixedDate, 'en-US');
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  describe('formatRelativeTime', () => {
    it('formats past and future relative times accurately', () => {
      const base = new Date('2026-08-22T12:00:00Z');
      const twoDaysAgo = new Date('2026-08-20T12:00:00Z');
      const inThreeHours = new Date('2026-08-22T15:00:00Z');

      const esPast = formatRelativeTime(twoDaysAgo, base, 'es-CL');
      expect(esPast.toLowerCase()).toMatch(/anteayer|hace 2 d/);

      const enPast = formatRelativeTime(twoDaysAgo, base, 'en-US');
      expect(enPast.toLowerCase()).toMatch(/2 days ago/);

      const enFuture = formatRelativeTime(inThreeHours, base, 'en-US');
      expect(enFuture.toLowerCase()).toMatch(/in 3 hours/);
    });
  });
});
