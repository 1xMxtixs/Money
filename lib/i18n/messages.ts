import es from '@/messages/es.json';
import en from '@/messages/en.json';
import { DEFAULT_LOCALE, normalizeLocale, type AppLocale } from './config';

export type MessagesDictionary = typeof es;

const DICTIONARIES: Record<AppLocale, MessagesDictionary> = {
  'es-CL': es,
  'en-US': en,
};

/**
 * Returns the loaded dictionary for the requested locale.
 */
export function getDictionary(locale?: string | null): MessagesDictionary {
  const norm = normalizeLocale(locale);
  return DICTIONARIES[norm] || DICTIONARIES[DEFAULT_LOCALE];
}

/**
 * Replaces `{paramName}` placeholders with corresponding values.
 */
export function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return String(params[key]);
    }
    return match;
  });
}

/**
 * Resolves a dot-notation key (e.g. "validation.required" or "common.save") from a dictionary.
 */
export function resolveTranslation(
  dict: Record<string, unknown>,
  path: string,
  params?: Record<string, string | number>
): string {
  const segments = path.split('.');
  let current: unknown = dict;

  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return path; // Fallback to path if not found
    }
  }

  if (typeof current === 'string') {
    return interpolate(current, params);
  }

  return path;
}

export type TranslateFunction = (
  key: string,
  params?: Record<string, string | number>
) => string;

/**
 * Creates a translation function bound to a specific locale or dictionary.
 */
export function createTranslator(localeOrDict?: string | MessagesDictionary): TranslateFunction {
  const dict =
    typeof localeOrDict === 'object' && localeOrDict !== null
      ? (localeOrDict as Record<string, unknown>)
      : (getDictionary(localeOrDict) as Record<string, unknown>);

  return (key: string, params?: Record<string, string | number>) => {
    return resolveTranslation(dict, key, params);
  };
}
