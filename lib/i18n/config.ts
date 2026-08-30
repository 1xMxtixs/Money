/**
 * Supported locales and internationalization constants (F0-08 / doc 5 §12 / doc 3 §4).
 */

export const SUPPORTED_LOCALES = ['es-CL', 'en-US'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LOCALE: AppLocale = 'es-CL';
export const DEFAULT_LANGUAGE: AppLanguage = 'es';

export const LOCALE_COOKIE_NAME = 'money_locale';

/**
 * Normalizes any locale string (e.g. "es", "es-AR", "en", "en-GB")
 * into the application's canonical supported locales ("es-CL" | "en-US").
 */
export function normalizeLocale(locale?: string | null): AppLocale {
  if (!locale) {
    return DEFAULT_LOCALE;
  }

  const trimmed = locale.trim().toLowerCase();

  if (trimmed.startsWith('es')) {
    return 'es-CL';
  }

  if (trimmed.startsWith('en')) {
    return 'en-US';
  }

  return DEFAULT_LOCALE;
}

/**
 * Extracts language code ('es' | 'en') from a supported locale.
 */
export function getLanguageFromLocale(locale: AppLocale | string): AppLanguage {
  return locale.startsWith('en') ? 'en' : 'es';
}
