import { headers } from 'next/headers';
import { AuthForm } from '@/features/auth/components/auth-form';
import { getServerTranslations } from '@/lib/i18n/server';

export default async function RegisterPage() {
  const { t } = getServerTranslations(await headers());
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('auth.registerTitle')}</h1>
      <AuthForm mode="register" />
    </main>
  );
}
