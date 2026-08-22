import { describe, it, expect } from 'vitest';
import { detectLocale, parseAcceptLanguage } from './detect';

describe('Locale Detection Helper (F0-08 / Criterion 1)', () => {
  describe('parseAcceptLanguage', () => {
    it('parses and sorts by quality factors', () => {
      const header = 'en-US,en;q=0.5,es-CL;q=0.9';
      const parsed = parseAcceptLanguage(header);
      expect(parsed).toEqual(['en-US', 'es-CL', 'en']);
    });

    it('returns empty array on missing or empty header', () => {
      expect(parseAcceptLanguage(null)).toEqual([]);
      expect(parseAcceptLanguage('')).toEqual([]);
    });
  });

  describe('detectLocale', () => {
    it('prioritizes explicit cookie preference above Accept-Language', () => {
      const locale = detectLocale({
        cookieLocale: 'en-US',
        acceptLanguage: 'es-CL,es;q=0.9',
      });
      expect(locale).toBe('en-US');
    });

    it('detects Spanish from Accept-Language when cookie is absent', () => {
      const locale = detectLocale({
        acceptLanguage: 'es-CL,es;q=0.9,en;q=0.8',
      });
      expect(locale).toBe('es-CL');
    });

    it('detects English from Accept-Language when cookie is absent', () => {
      const locale = detectLocale({
        acceptLanguage: 'en-US,en;q=0.9,es;q=0.8',
      });
      expect(locale).toBe('en-US');
    });

    it('falls back to default es-CL when neither is provided', () => {
      const locale = detectLocale();
      expect(locale).toBe('es-CL');
    });

    it('falls back to default es-CL when unsupported languages are sent', () => {
      const locale = detectLocale({
        acceptLanguage: 'fr-FR,de-DE;q=0.8',
      });
      expect(locale).toBe('es-CL');
    });
  });
});
