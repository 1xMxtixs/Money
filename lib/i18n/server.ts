import { DEFAULT_LOCALE, normalizeLocale, LOCALE_COOKIE_NAME, type AppLocale } from './config';
import { detectLocale } from './detect';
import { getDictionary, createTranslator, type TranslateFunction } from './messages';
import { formatMoney as rawFormatMoney, type FormatMoneyOptions, type MoneyObjectInput } from '@/lib/format/money';
import { formatDate as rawFormatDate, formatDateTime as rawFormatDateTime, formatRelativeTime as rawFormatRelativeTime } from '@/lib/format/date';
import { formatNumber as rawFormatNumber, formatPercent as rawFormatPercent } from '@/lib/format/number';
import type { CurrencyCode } from '@/lib/domain/money/currencies';

export interface ServerI18n {
  locale: AppLocale;
  t: TranslateFunction;
  formatMoney: (
    amount: MoneyObjectInput | bigint | number,
    currencyOrOptions?: CurrencyCode | string | FormatMoneyOptions,
    maybeOptions?: FormatMoneyOptions
  ) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatRelativeTime: (date: Date | string | number, baseDate?: Date) => string;
  formatNumber: (value: number | bigint, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (ratio: number, options?: Intl.NumberFormatOptions) => string;
}

/**
 * Extracts the user locale from standard Request headers (Cookie & Accept-Language).
 */
export function getLocaleFromHeaders(headers: Headers): AppLocale {
  const cookieHeader = headers.get('cookie') || '';
  let cookieLocale: string | null = null;

  const cookieMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE_NAME}=([^;]+)`));
  if (cookieMatch && cookieMatch[1]) {
    cookieLocale = decodeURIComponent(cookieMatch[1].trim());
  }

  const acceptLanguage = headers.get('accept-language');

  return detectLocale({ cookieLocale, acceptLanguage });
}

/**
 * Returns server-side translation and regional formatters bound to a given locale or request (F0-08 / doc 5 §12).
 */
export function getServerTranslations(localeOrHeaders?: string | Headers | null): ServerI18n {
  let locale: AppLocale = DEFAULT_LOCALE;

  if (typeof localeOrHeaders === 'string' && localeOrHeaders.trim()) {
    locale = normalizeLocale(localeOrHeaders);
  } else if (localeOrHeaders instanceof Headers) {
    locale = getLocaleFromHeaders(localeOrHeaders);
  }

  const dict = getDictionary(locale);
  const t = createTranslator(dict);

  return {
    locale,
    t,
    formatMoney: (amount, currencyOrOptions, maybeOptions) => {
      if (typeof currencyOrOptions === 'object' && currencyOrOptions !== null) {
        return rawFormatMoney(amount, { locale, ...currencyOrOptions }, maybeOptions);
      }
      return rawFormatMoney(amount, currencyOrOptions, { locale, ...maybeOptions });
    },
    formatDate: (date, options) => rawFormatDate(date, locale, options),
    formatDateTime: (date, options) => rawFormatDateTime(date, locale, options),
    formatRelativeTime: (date, baseDate) => rawFormatRelativeTime(date, baseDate, locale),
    formatNumber: (value, options) => rawFormatNumber(value, locale, options),
    formatPercent: (ratio, options) => rawFormatPercent(ratio, locale, options),
  };
}
