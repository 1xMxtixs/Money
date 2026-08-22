import { getCurrencyDecimals, type CurrencyCode } from '@/lib/domain/money/currencies';
import { minorToMajor } from '@/lib/domain/money/conversion';

export interface FormatMoneyOptions {
  locale?: string;
  currency?: CurrencyCode | string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
}

export type MoneyObjectInput =
  | { minor: number; currency: CurrencyCode | string }
  | { amountMinor: bigint | number; currency: CurrencyCode | string };

const DEFAULT_LOCALE = 'es-CL';

/**
 * Formats a money amount using Intl.NumberFormat and catalog currency decimals (F0-08 / AD-08 / S7).
 *
 * All unit conversion arithmetic is delegated to lib/domain/money to preserve architectural boundaries (RA-06).
 */
export function formatMoney(
  amount: MoneyObjectInput | bigint | number,
  currencyOrOptions?: CurrencyCode | string | FormatMoneyOptions,
  localeOrOptions?: string | FormatMoneyOptions
): string {
  let minorValue: bigint | number;
  let currencyCode = 'CLP';
  let opts: FormatMoneyOptions = {};

  if (typeof amount === 'object' && amount !== null) {
    minorValue = 'minor' in amount ? amount.minor : amount.amountMinor;
    currencyCode = amount.currency;

    if (typeof currencyOrOptions === 'string') {
      opts = { locale: currencyOrOptions };
    } else if (typeof currencyOrOptions === 'object' && currencyOrOptions !== null) {
      opts = currencyOrOptions;
    }
  } else {
    minorValue = amount;

    if (typeof currencyOrOptions === 'string') {
      currencyCode = currencyOrOptions;
    } else if (typeof currencyOrOptions === 'object' && currencyOrOptions !== null) {
      currencyCode = currencyOrOptions.currency || 'CLP';
      opts = currencyOrOptions;
    }

    if (typeof localeOrOptions === 'string') {
      opts = { ...opts, locale: localeOrOptions };
    } else if (typeof localeOrOptions === 'object' && localeOrOptions !== null) {
      opts = { ...opts, ...localeOrOptions };
    }
  }

  const locale = opts.locale || DEFAULT_LOCALE;
  const decimals = opts.minimumFractionDigits ?? getCurrencyDecimals(currencyCode);
  const majorAmount = minorToMajor(minorValue, currencyCode);

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals,
    maximumFractionDigits: opts.maximumFractionDigits ?? decimals,
    useGrouping: opts.useGrouping ?? true,
  });

  return formatter.format(majorAmount);
}
