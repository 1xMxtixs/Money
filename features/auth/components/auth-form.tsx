'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/context';
import {
  EMAIL_MAX_LENGTH,
  INVITATION_CODE_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@/lib/schemas/limits';

type Mode = 'login' | 'register';
type Field = 'invitationCode' | 'email' | 'password';

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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [warning, setWarning] = useState(false);
  const [pending, setPending] = useState(false);
  const isRegister = mode === 'register';

  function fieldMessage(field: Field): string {
    if (field === 'email') return t('validation.invalidEmail');
    if (field === 'password') return t('validation.minLength', { min: PASSWORD_MIN_LENGTH });
    return t('validation.required');
  }

  function showProblem(p: Problem) {
    if (p.code === 'INVITATION_INVALID') return setError(t('auth.invitationInvalid'));
    if (p.code === 'EMAIL_TAKEN') return setError(t('auth.emailTaken'));
    if (p.status === 401) return setError(t('auth.invalidCredentials'));
    if (p.status === 429) return setError(t('errors.rateLimited'));
    if (p.status === 422) {
      const fields: Field[] = ['invitationCode', 'email', 'password'];
      const found: Partial<Record<Field, string>> = {};
      for (const e of p.errors ?? []) {
        const field = fields.find((f) => f === e.path);
        if (field) found[field] = fieldMessage(field);
      }
      if (Object.keys(found).length > 0) return setFieldErrors(found);
    }
    setError(t('errors.generic'));
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
    setFieldErrors({});
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => ({}))) as Omit<Problem, 'status'>;
        showProblem({ ...problem, status: res.status });
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

  const fieldError = (field: Field) =>
    fieldErrors[field] && (
      <p id={`${field}-error`} className="text-sm">
        {fieldErrors[field]}
      </p>
    );
  const a11y = (field: Field) => ({
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': fieldErrors[field] ? `${field}-error` : undefined,
  });

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
            maxLength={INVITATION_CODE_MAX_LENGTH}
            autoComplete="off"
            placeholder="MNY-XXXX-XXXX"
            className={INPUT}
            {...a11y('invitationCode')}
          />
          {fieldError('invitationCode')}
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          {t('auth.email')}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={EMAIL_MAX_LENGTH}
          autoComplete="email"
          className={INPUT}
          {...a11y('email')}
        />
        {fieldError('email')}
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
          minLength={isRegister ? PASSWORD_MIN_LENGTH : undefined}
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          className={INPUT}
          {...a11y('password')}
        />
        {fieldError('password')}
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
