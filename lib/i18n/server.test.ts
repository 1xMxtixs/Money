import { describe, it, expect } from 'vitest';
import { getServerTranslations, getLocaleFromHeaders } from './server';

describe('Server i18n Helper (F0-08 / doc 5 §12)', () => {
  describe('getLocaleFromHeaders', () => {
    it('extracts locale from cookie in headers', () => {
      const headers = new Headers({
        cookie: 'money_locale=en-US; other=123',
      });
      expect(getLocaleFromHeaders(headers)).toBe('en-US');
    });

    it('falls back to Accept-Language when cookie is not present', () => {
      const headers = new Headers({
        'accept-language': 'en-US,en;q=0.9',
      });
      expect(getLocaleFromHeaders(headers)).toBe('en-US');
    });
  });

  describe('getServerTranslations', () => {
    it('returns bound translator and formatters for Spanish', () => {
      const { t, locale, formatMoney } = getServerTranslations('es-CL');
      expect(locale).toBe('es-CL');
      expect(t('common.save')).toBe('Guardar');
      expect(formatMoney(1000n, 'CLP')).toContain('1.000');
    });

    it('returns bound translator and formatters for English', () => {
      const { t, locale, formatMoney } = getServerTranslations('en-US');
      expect(locale).toBe('en-US');
      expect(t('common.save')).toBe('Save');
      expect(formatMoney(1000n, 'USD')).toContain('10.00');
    });
  });
});
