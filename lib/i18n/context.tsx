'use client';

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import {
  DEFAULT_LOCALE,
  DEFAULT_LANGUAGE,
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  getLanguageFromLocale,
  type AppLocale,
  type AppLanguage,
} from './config';
import {
  getDictionary,
  createTranslator,
  type MessagesDictionary,
  type TranslateFunction,
} from './messages';
import { formatMoney as rawFormatMoney, type FormatMoneyOptions, type MoneyObjectInput } from '@/lib/format/money';
import { formatDate as rawFormatDate, formatDateTime as rawFormatDateTime, formatRelativeTime as rawFormatRelativeTime } from '@/lib/format/date';
import { formatNumber as rawFormatNumber, formatPercent as rawFormatPercent } from '@/lib/format/number';
import type { CurrencyCode } from '@/lib/domain/money/currencies';

export interface I18nContextValue {
  locale: AppLocale;
  language: AppLanguage;
  t: TranslateFunction;
  setLocale: (nextLocale: AppLocale | string) => void;
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

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children?: React.ReactNode;
  initialLocale?: AppLocale | string;
  initialDictionary?: MessagesDictionary;
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
  initialDictionary,
}: I18nProviderProps) {
  const [locale, setLocaleState] = useState<AppLocale>(() => normalizeLocale(initialLocale));

  const setLocale = useCallback((next: AppLocale | string) => {
    const normalized = normalizeLocale(next);
    setLocaleState(normalized);

    // Persist locale preference to cookie for SSR / next requests
    if (typeof document !== 'undefined') {
      document.cookie = `${LOCALE_COOKIE_NAME}=${normalized}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, []);

  const language = useMemo<AppLanguage>(() => getLanguageFromLocale(locale), [locale]);

  const dictionary = useMemo<MessagesDictionary>(() => {
    if (initialDictionary && normalizeLocale(initialLocale) === locale) {
      return initialDictionary;
    }
    return getDictionary(locale);
  }, [locale, initialLocale, initialDictionary]);

  const t = useMemo<TranslateFunction>(() => createTranslator(dictionary), [dictionary]);

  const formatMoney = useCallback(
    (
      amount: MoneyObjectInput | bigint | number,
      currencyOrOptions?: CurrencyCode | string | FormatMoneyOptions,
      maybeOptions?: FormatMoneyOptions
    ) => {
      if (typeof currencyOrOptions === 'object' && currencyOrOptions !== null) {
        return rawFormatMoney(amount, { locale, ...currencyOrOptions }, maybeOptions);
      }
      return rawFormatMoney(amount, currencyOrOptions, { locale, ...maybeOptions });
    },
    [locale]
  );

  const formatDate = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
      return rawFormatDate(date, locale, options);
    },
    [locale]
  );

  const formatDateTime = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
      return rawFormatDateTime(date, locale, options);
    },
    [locale]
  );

  const formatRelativeTime = useCallback(
    (date: Date | string | number, baseDate?: Date) => {
      return rawFormatRelativeTime(date, baseDate, locale);
    },
    [locale]
  );

  const formatNumber = useCallback(
    (value: number | bigint, options?: Intl.NumberFormatOptions) => {
      return rawFormatNumber(value, locale, options);
    },
    [locale]
  );

  const formatPercent = useCallback(
    (ratio: number, options?: Intl.NumberFormatOptions) => {
      return rawFormatPercent(ratio, locale, options);
    },
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      language,
      t,
      setLocale,
      formatMoney,
      formatDate,
      formatDateTime,
      formatRelativeTime,
      formatNumber,
      formatPercent,
    }),
    [
      locale,
      language,
      t,
      setLocale,
      formatMoney,
      formatDate,
      formatDateTime,
      formatRelativeTime,
      formatNumber,
      formatPercent,
    ]
  );

  return React.createElement(I18nContext.Provider, { value }, children);
}

/**
 * Hook to access the complete i18n context (translation + regional formatters).
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    // Fallback instance if used outside I18nProvider
    const defaultT = createTranslator(DEFAULT_LOCALE);
    return {
      locale: DEFAULT_LOCALE,
      language: DEFAULT_LANGUAGE,
      t: defaultT,
      setLocale: () => {},
      formatMoney: (amount, curr, opts) => rawFormatMoney(amount, curr, { locale: DEFAULT_LOCALE, ...opts }),
      formatDate: (d, opts) => rawFormatDate(d, DEFAULT_LOCALE, opts),
      formatDateTime: (d, opts) => rawFormatDateTime(d, DEFAULT_LOCALE, opts),
      formatRelativeTime: (d, base) => rawFormatRelativeTime(d, base, DEFAULT_LOCALE),
      formatNumber: (v, opts) => rawFormatNumber(v, DEFAULT_LOCALE, opts),
      formatPercent: (r, opts) => rawFormatPercent(r, DEFAULT_LOCALE, opts),
    };
  }
  return context;
}

/**
 * Hook to access scoped translations for a specific prefix namespace.
 *
 * Example:
 * const t = useTranslations('validation');
 * t('required') -> translates 'validation.required'
 */
export function useTranslations(namespace?: string): TranslateFunction {
  const { t } = useI18n();

  return useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      return t(fullKey, params);
    },
    [t, namespace]
  );
}
