const DEFAULT_LOCALE = 'es-CL';

/**
 * Formats a generic numeric value using native Intl.NumberFormat (F0-08 / Criterion 3).
 */
export function formatNumber(
  value: number | bigint,
  localeOrOptions?: string | Intl.NumberFormatOptions,
  maybeOptions?: Intl.NumberFormatOptions
): string {
  let locale = DEFAULT_LOCALE;
  let options: Intl.NumberFormatOptions = {
    useGrouping: true,
  };

  if (typeof localeOrOptions === 'string') {
    locale = localeOrOptions;
    if (maybeOptions) {
      options = { ...options, ...maybeOptions };
    }
  } else if (typeof localeOrOptions === 'object' && localeOrOptions !== null) {
    options = { ...options, ...localeOrOptions };
  }

  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Formats a percentage ratio (e.g. 0.85 -> "85%" / "85 %") using native Intl.NumberFormat.
 */
export function formatPercent(
  ratio: number,
  localeOrOptions?: string | Intl.NumberFormatOptions,
  maybeOptions?: Intl.NumberFormatOptions
): string {
  const defaultOptions: Intl.NumberFormatOptions = {
    style: 'percent',
    maximumFractionDigits: 1,
  };

  if (typeof localeOrOptions === 'string') {
    return formatNumber(ratio, localeOrOptions, { ...defaultOptions, ...maybeOptions });
  }

  return formatNumber(ratio, { ...defaultOptions, ...localeOrOptions });
}
