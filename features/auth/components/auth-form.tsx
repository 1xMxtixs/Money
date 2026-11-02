'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/context';

type Mode = 'login' | 'register';

interface Problem {
  status: number;
  code?: string;
  errors?: { path: string; code: string }[];
}

const INPUT =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Formulario de acceso y alta. Llama a la API REST con fetch (sin Server Actions, AGENTS C-2). */
export function AuthForm({ mode }: { mode: Mode }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState(false);
  const [pending, setPending] = useState(false);
  const isRegister = mode === 'register';

  function messageFor(p: Problem): string {
    if (p.code === 'INVITATION_INVALID') return t('auth.invitationInvalid');
    if (p.code === 'EMAIL_TAKEN') return t('auth.emailTaken');
    if (p.status === 401) return t('auth.invalidCredentials');
    if (p.status === 429) return t('errors.rateLimited');
    if (p.status === 422) {
      const first = p.errors?.[0];
      if (first?.path === 'email') return t('validation.invalidEmail');
      if (first?.path === 'password') return t('validation.minLength', { min: 8 });
      return t('validation.required');
    }
    return t('errors.generic');
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body: Record<string, string> = {
      email: String(data.get('email')),
      password: String(data.get('password')),
    };
    if (isRegister) {
      body.invitationCode = String(data.get('invitationCode'));
      body.locale = locale;
      body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => ({}))) as Omit<Problem, 'status'>;
        setError(messageFor({ ...problem, status: res.status }));
        return;
      }
      const payload = (await res.json()) as { warnings?: string[] };
      if (payload.warnings?.includes('PASSWORD_COMMON')) {
        setWarning(true);
        return;
      }
      router.push('/dashboard');
    } catch {
      setError(t('errors.networkError'));
    } finally {
      setPending(false);
    }
  }

  if (warning) {
    return (
      <div className="space-y-4">
        <p role="status">{t('auth.passwordCommonWarning')}</p>
        <Button onClick={() => router.push('/dashboard')}>{t('auth.continue')}</Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {isRegister && (
        <div className="space-y-1">
          <label htmlFor="invitationCode" className="text-sm font-medium">
            {t('auth.invitationCode')}
          </label>
          <input
            id="invitationCode"
            name="invitationCode"
            required
            maxLength={32}
            autoComplete="off"
            placeholder="MNY-XXXX-XXXX"
            className={INPUT}
          />
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          {t('auth.email')}
        </label>
        <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" className={INPUT} />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          {t('auth.password')}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={isRegister ? 8 : undefined}
          maxLength={128}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          className={INPUT}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {isRegister ? t('auth.submitRegister') : t('auth.submitLogin')}
      </Button>
      <p className="text-center text-sm">
        <Link href={isRegister ? '/login' : '/register'} className="underline underline-offset-4">
          {isRegister ? t('auth.goToLogin') : t('auth.goToRegister')}
        </Link>
      </p>
    </form>
  );
}
