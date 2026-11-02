import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createInvitation } from '@/lib/auth/invitations';
import { SessionNotRotatableError, usersRepo } from '@/lib/repos';
import { POST as register } from './register/route';
import { POST as login } from './login/route';
import { POST as logout } from './logout/route';
import { GET as getSession } from './session/route';

// Fallos inyectables sobre módulos reales (por defecto delegan sin cambios).
const inject = vi.hoisted(() => ({ rotate: null as Error | null, find: null as Error | null }));
vi.mock('@/lib/auth/session', async (orig) => {
  const mod = await orig<typeof import('@/lib/auth/session')>();
  return {
    ...mod,
    rotateSession: (...a: Parameters<typeof mod.rotateSession>) => {
      if (inject.rotate) return Promise.reject(inject.rotate);
      return mod.rotateSession(...a);
    },
  };
});
vi.mock('@/lib/auth/http', async (orig) => {
  const mod = await orig<typeof import('@/lib/auth/http')>();
  return {
    ...mod,
    findRequestSession: (req: Request) => {
      if (inject.find) return Promise.reject(inject.find);
      return mod.findRequestSession(req);
    },
  };
});

const databaseUrl = process.env.DATABASE_URL;
const PASSWORD = 'una contraseña muy larga 123';
const addr = `fail-${Date.now().toString(36)}@example.com`;
const json = (path: string, body: unknown, cookie?: string) =>
  new Request(`http://localhost/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  });
const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];
let userId = '';

describe('rutas de auth: fallos inyectados', () => {
  beforeEach(() => {
    if (!databaseUrl) throw new Error('DATABASE_URL is not set. Integration tests require PostgreSQL.');
    inject.rotate = null;
    inject.find = null;
  });
  afterAll(async () => {
    if (userId) await usersRepo(userId).delete();
  });

  it('prepara usuario', async () => {
    const { code } = await createInvitation();
    const res = await register(json('register', { invitationCode: code, email: addr, password: PASSWORD }));
    expect(res.status).toBe(201);
    userId = (await res.json()).user.id;
  });

  it('login: un error de rotación que no es "sesión no rotable" se propaga (500) y la anterior sigue viva', async () => {
    const first = cookieOf(await login(json('login', { email: addr, password: PASSWORD })));
    inject.rotate = new Error('db down');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await login(json('login', { email: addr, password: PASSWORD }, first));
    expect(res.status).toBe(500);
    expect(res.headers.get('set-cookie')).toBeNull();
    inject.rotate = null;
    const still = await getSession(new Request('http://localhost/api/auth/session', { headers: { cookie: first } }));
    expect(still.status).toBe(200);
  });

  it('login: SessionNotRotatableError (carrera) cae a una sesión nueva', async () => {
    const first = cookieOf(await login(json('login', { email: addr, password: PASSWORD })));
    inject.rotate = new SessionNotRotatableError('x');
    const res = await login(json('login', { email: addr, password: PASSWORD }, first));
    expect(res.status).toBe(200);
    expect(cookieOf(res)).not.toBe(first);
  });

  it('logout: si la revocación falla responde igualmente con la cookie limpia y sin registrar el testigo', async () => {
    const token = cookieOf(await login(json('login', { email: addr, password: PASSWORD })));
    inject.find = new Error('db down');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await logout(
      new Request('http://localhost/api/auth/logout', { method: 'POST', headers: { cookie: token } })
    );
    expect(res.status).toBe(500);
    expect(res.headers.get('set-cookie')).toMatch(/^session=; .*Max-Age=0/);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(token.split('=')[1]);
    expect(spy).toHaveBeenCalled();
  });
});
