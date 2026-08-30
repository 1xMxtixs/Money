import { describe, it, expect } from 'vitest';
import { getDictionary, interpolate, resolveTranslation, createTranslator } from './messages';

describe('Messages & Translation Dictionary (F0-08 / Criterion 5)', () => {
  describe('getDictionary', () => {
    it('returns Spanish dictionary for es-CL and English for en-US', () => {
      const es = getDictionary('es-CL');
      expect(es.common.appName).toBe('Money');
      expect(es.common.save).toBe('Guardar');

      const en = getDictionary('en-US');
      expect(en.common.save).toBe('Save');
    });

    it('falls back to default for unsupported locale', () => {
      const fallback = getDictionary('fr-FR');
      expect(fallback.common.save).toBe('Guardar');
    });
  });

  describe('interpolate', () => {
    it('replaces placeholder tokens accurately', () => {
      const template = 'Debe tener al menos {min} caracteres.';
      const result = interpolate(template, { min: 8 });
      expect(result).toBe('Debe tener al menos 8 caracteres.');
    });

    it('leaves missing tokens untouched', () => {
      const template = 'Hello {name}, your balance is {amount}.';
      const result = interpolate(template, { name: 'Matias' });
      expect(result).toBe('Hello Matias, your balance is {amount}.');
    });
  });

  describe('resolveTranslation and createTranslator', () => {
    it('resolves nested dot keys directly using resolveTranslation', () => {
      const dict = getDictionary('es-CL');
      expect(resolveTranslation(dict, 'common.save')).toBe('Guardar');
      expect(resolveTranslation(dict, 'validation.minLength', { min: 4 })).toBe('Debe tener al menos 4 caracteres.');
    });

    it('resolves nested dot keys in Spanish and English', () => {
      const tEs = createTranslator('es-CL');
      expect(tEs('validation.required')).toBe('Este campo es obligatorio.');
      expect(tEs('validation.minLength', { min: 6 })).toBe('Debe tener al menos 6 caracteres.');

      const tEn = createTranslator('en-US');
      expect(tEn('validation.required')).toBe('This field is required.');
      expect(tEn('validation.minLength', { min: 6 })).toBe('Must be at least 6 characters.');
    });

    it('returns key string if translation is missing', () => {
      const t = createTranslator('es-CL');
      expect(t('non.existent.key')).toBe('non.existent.key');
    });
  });
});
