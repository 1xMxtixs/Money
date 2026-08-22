const DEFAULT_LOCALE = 'es-CL';

function parseDateInput(input: Date | string | number): Date {
  if (input instanceof Date) {
    return input;
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date input for formatting: '${input}'`);
  }
  return parsed;
}

/**
 * Formats a date using native Intl.DateTimeFormat (F0-08 / Criterion 3 / doc 5 §12).
 * Zero external libraries (no date-fns, dayjs, Luxon, Moment).
 */
export function formatDate(
  date: Date | string | number,
  localeOrOptions?: string | Intl.DateTimeFormatOptions,
  maybeOptions?: Intl.DateTimeFormatOptions
): string {
  const d = parseDateInput(date);
  let locale = DEFAULT_LOCALE;
  let options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  if (typeof localeOrOptions === 'string') {
    locale = localeOrOptions;
    if (maybeOptions) {
      options = { ...options, ...maybeOptions };
    }
  } else if (typeof localeOrOptions === 'object' && localeOrOptions !== null) {
    options = { ...options, ...localeOrOptions };
  }

  return new Intl.DateTimeFormat(locale, options).format(d);
}

/**
 * Formats a date with time using native Intl.DateTimeFormat.
 */
export function formatDateTime(
  date: Date | string | number,
  localeOrOptions?: string | Intl.DateTimeFormatOptions,
  maybeOptions?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  if (typeof localeOrOptions === 'string') {
    return formatDate(date, localeOrOptions, { ...defaultOptions, ...maybeOptions });
  }

  return formatDate(date, { ...defaultOptions, ...localeOrOptions });
}

/**
 * Formats month and year (e.g. "agosto de 2026" in Spanish / "August 2026" in English).
 */
export function formatMonthYear(
  date: Date | string | number,
  locale = DEFAULT_LOCALE
): string {
  const d = parseDateInput(date);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
  }).format(d);
}

/**
 * Formats relative time (e.g. "hace 2 días" / "in 3 hours") using native Intl.RelativeTimeFormat.
 */
export function formatRelativeTime(
  date: Date | string | number,
  baseDate: Date = new Date(),
  locale = DEFAULT_LOCALE
): string {
  const MS_PER_SEC = 10 * 10 * 10;
  const d = parseDateInput(date);
  const diffMs = d.getTime() - baseDate.getTime();
  const diffSecs = Math.round(diffMs / MS_PER_SEC);
  const diffMins = Math.round(diffSecs / 60);
  const diffHours = Math.round(diffMins / 60);
  const diffDays = Math.round(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffSecs) < 60) {
    return rtf.format(diffSecs, 'second');
  }
  if (Math.abs(diffMins) < 60) {
    return rtf.format(diffMins, 'minute');
  }
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  }
  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, 'day');
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, 'month');
  }

  const diffYears = Math.round(diffDays / 365);
  return rtf.format(diffYears, 'year');
}
