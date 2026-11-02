import { z } from 'zod';
import { boundedString, localeSchema, strictObject } from './common';
import { validatePasswordLength } from '@/lib/auth/password';

const emailSchema = boundedString(254, 3)
  .trim()
  .toLowerCase()
  .pipe(z.email());

// Longitud en puntos de código (8..128). El tope de 512 unidades corta cargas absurdas antes.
const passwordSchema = boundedString(512, 1).refine(
  (value) => validatePasswordLength(value).valid
);

const timezoneSchema = boundedString(64, 1).refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
});

export const registerSchema = strictObject({
  invitationCode: boundedString(32, 1),
  email: emailSchema,
  password: passwordSchema,
  timezone: timezoneSchema.optional(),
  locale: localeSchema.optional(),
});

// En el login no se valida la política de contraseña: no debe delatar nada.
export const loginSchema = strictObject({
  email: emailSchema,
  password: boundedString(512, 1),
});

export const sessionIdParamSchema = z.uuid();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
