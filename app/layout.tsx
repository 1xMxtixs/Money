import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import './globals.css';
import { getLocaleFromHeaders } from '@/lib/i18n/server';
import { getLanguageFromLocale } from '@/lib/i18n/config';
import { I18nProvider } from '@/lib/i18n/context';

export const metadata: Metadata = {
  title: 'Money',
  description: 'Personal finance tracking app',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const reqHeaders = await headers();
  const nonce = reqHeaders.get('x-nonce') ?? undefined;
  const locale = getLocaleFromHeaders(reqHeaders);
  const lang = getLanguageFromLocale(locale);

  return (
    <html lang={lang} suppressHydrationWarning>
      <body
        className="min-h-screen bg-background font-sans antialiased"
        data-nonce={nonce ? 'active' : undefined}
      >
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
