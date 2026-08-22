import { DEFAULT_LOCALE, normalizeLocale, type AppLocale } from './config';

export interface LocaleDetectionOptions {
  acceptLanguage?: string | null;
  cookieLocale?: string | null;
}

/**
 * Parses the HTTP Accept-Language header taking quality factors (q-weights) into account.
 */
export function parseAcceptLanguage(header?: string | null): string[] {
  if (!header || !header.trim()) {
    return [];
  }

  return header
    .split(',')
    .map((entry) => {
      const parts = entry.trim().split(';');
      const lang = parts[0]?.trim();
      let q = 1.0;

      if (parts[1]) {
        const qMatch = parts[1].trim().match(/^q=([0-9.]+)/i);
        if (qMatch && qMatch[1]) {
          const parsedQ = parseFloat(qMatch[1]);
          if (!Number.isNaN(parsedQ)) {
            q = parsedQ;
          }
        }
      }

      return { lang, q };
    })
    .filter((item) => Boolean(item.lang))
    .sort((a, b) => b.q - a.q)
    .map((item) => item.lang);
}

/**
 * Detects the effective user locale following strict priority (F0-08 / Criterion 1):
 * 1. Explicit cookie preference (users.locale / cookieLocale)
 * 2. Accept-Language header from browser
 * 3. Default fallback (es-CL)
 */
export function detectLocale(options?: LocaleDetectionOptions): AppLocale {
  // 1. Explicit cookie preference
  if (options?.cookieLocale) {
    return normalizeLocale(options.cookieLocale);
  }

  // 2. Accept-Language header
  if (options?.acceptLanguage) {
    const preferences = parseAcceptLanguage(options.acceptLanguage);
    for (const pref of preferences) {
      if (pref.toLowerCase().startsWith('es')) {
        return 'es-CL';
      }
      if (pref.toLowerCase().startsWith('en')) {
        return 'en-US';
      }
    }
  }

  // 3. Fallback default
  return DEFAULT_LOCALE;
}
