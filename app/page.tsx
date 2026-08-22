import { headers } from 'next/headers';
import { Button } from '@/components/ui/button';
import { getServerTranslations } from '@/lib/i18n/server';

export default async function HomePage() {
  const { t } = getServerTranslations(await headers());

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">{t('common.appName')}</h1>
        <p className="text-muted-foreground">
          {t('common.tagline')}
        </p>
        <div className="pt-4">
          <Button>{t('auth.login')}</Button>
        </div>
      </div>
    </main>
  );
}
