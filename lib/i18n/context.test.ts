import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider, useI18n, useTranslations } from './context';

function TestConsumer() {
  const { locale, formatMoney, formatDate, formatNumber } = useI18n();
  const t = useTranslations('common');
  const tVal = useTranslations('validation');

  return React.createElement(
    'div',
    null,
    React.createElement('span', { 'data-testid': 'locale' }, locale),
    React.createElement('span', { 'data-testid': 'save' }, t('save')),
    React.createElement('span', { 'data-testid': 'val-min' }, tVal('minLength', { min: 8 })),
    React.createElement('span', { 'data-testid': 'money' }, formatMoney(12500n, 'CLP')),
    React.createElement('span', { 'data-testid': 'date' }, formatDate('2026-08-22')),
    React.createElement('span', { 'data-testid': 'number' }, formatNumber(1250000))
  );
}

describe('I18nProvider & React Hooks (F0-08 / doc 5 §12)', () => {
  it('renders consumers accurately with Spanish default', () => {
    const html = renderToString(
      React.createElement(I18nProvider, { initialLocale: 'es-CL' }, React.createElement(TestConsumer))
    );

    expect(html).toContain('es-CL');
    expect(html).toContain('Guardar');
    expect(html).toContain('Debe tener al menos 8 caracteres.');
    expect(html).toContain('12.500');
    expect(html).toContain('1.250.000');
  });

  it('renders consumers accurately with English locale', () => {
    const html = renderToString(
      React.createElement(I18nProvider, { initialLocale: 'en-US' }, React.createElement(TestConsumer))
    );

    expect(html).toContain('en-US');
    expect(html).toContain('Save');
    expect(html).toContain('Must be at least 8 characters.');
    expect(html).toContain('1,250,000');
  });

  it('provides safe fallback when used outside provider', () => {
    const html = renderToString(React.createElement(TestConsumer));
    expect(html).toContain('Guardar');
  });
});
