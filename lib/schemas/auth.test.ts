import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from './auth';
import { isStrictSchema } from './common';

const valid = {
  invitationCode: 'MNY-7K3P-QX82',
  email: '  Ana@Ejemplo.CL ',
  password: 'una contraseña larga',
};

describe('registerSchema', () => {
  it('normaliza el correo y acepta opcionales', () => {
    const r = registerSchema.parse({ ...valid, timezone: 'America/Santiago', locale: 'es-CL' });
    expect(r.email).toBe('ana@ejemplo.cl');
  });
  it('rechaza campos desconocidos, contraseña corta/larga y zona inválida', () => {
    expect(registerSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'corta' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'x'.repeat(129) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, timezone: 'Mars/Base' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, email: 'no-es-correo' }).success).toBe(false);
  });
  it('los esquemas son estrictos', () => {
    expect(isStrictSchema(registerSchema)).toBe(true);
    expect(isStrictSchema(loginSchema)).toBe(true);
  });
});

describe('loginSchema', () => {
  it('no aplica la política de contraseña', () => {
    expect(loginSchema.safeParse({ email: 'a@b.cl', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.cl', password: '' }).success).toBe(false);
  });
});
