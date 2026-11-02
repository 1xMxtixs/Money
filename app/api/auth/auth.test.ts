import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { usersRepo, unscopedFindUserByEmail } from '@/lib/repos';
import { createInvitation } from '@/lib/auth/invitations';
import { POST as register } from './register/route';
import { POST as login } from './login/route';
import { POST as logout } from './logout/route';
import { POST as logoutAll } from './logout-all/route';
import { GET as getSession } from './session/route';
import { GET as listSessions } from './sessions/route';
import { DELETE as deleteSession } from './sessions/[id]/route';

const databaseUrl = process.env.DATABASE_URL;
const tag = Date.now().toString(36);
const emails = new Set<string>();
const userIds = new Set<string>();

function email(name: string) {
  const e = `${name}-${tag}@example.com`;
  emails.add(e);
  return e;
}

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  });
}

async function reg(body: unknown) {
  const res = await register(post('register', body));
  if (res.status === 201) userIds.add((await res.clone().json()).user.id);
  return res;
}

function authed(method: string, path: string, cookie: string) {
  return new Request(`http://localhost/api/auth/${path}`, { method, headers: { cookie } });
}

/** "session=abc; HttpOnly; ..." -> "session=abc" */
function cookieOf(res: Response) {
  return res.headers.get('set-cookie')!.split(';')[0];
}

const PASSWORD = 'una contraseña muy larga 123';
const WRONG = 'otra frase que no coincide';
const WRONG = 'otra frase que no coincide';

async function signUp(name: string) {
  const { code } = await createInvitation();
  const res = await reg({ invitationCode: code, email: email(name), password: PASSWORD });
  return { res, code, cookie: res.status === 201 ? cookieOf(res) : '' };
}

describe('auth endpoints (integración PostgreSQL)', () => {
  beforeEach(() => {
    if (!databaseUrl) throw new Error('DATABASE_URL is not set. Integration tests require PostgreSQL.');
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    for (const id of userIds) await usersRepo(id).delete();
  });

  it('register: 201, cookie de sesión y usuario sin hash', async () => {
    const { res, cookie } = await signUp('reg');
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000/);
    const body = await res.json();
    expect(body.user.email).toBe(`reg-${tag}@example.com`);
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i);
    const me = await getSession(authed('GET', 'session', cookie));
    expect(me.status).toBe(200);
  });

  it('register: invitación inválida y reutilizada -> 409 INVITATION_INVALID, sin dejar usuario', async () => {
    const bad = await reg({ invitationCode: 'MNY-0000-0000', email: email('bad'), password: PASSWORD });
    expect(bad.status).toBe(409);
    expect((await bad.json()).code).toBe('INVITATION_INVALID');
    const orphan = await unscopedFindUserByEmail(`bad-${tag}@example.com`);
    expect(orphan).toBeNull(); // la transacción revirtió el INSERT del usuario

    const { code } = await signUp('first');
    const again = await reg({ invitationCode: code, email: email('second'), password: PASSWORD });
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe('INVITATION_INVALID');
    expect(await unscopedFindUserByEmail(`second-${tag}@example.com`)).toBeNull();
  });

  it('register: correo repetido -> EMAIL_TAKEN con invitación válida; INVITATION_INVALID sin ella', async () => {
    await signUp('dup');
    const { code } = await createInvitation();
    const taken = await reg({ invitationCode: code, email: email('dup'), password: PASSWORD });
    expect(taken.status).toBe(409);
    expect((await taken.json()).code).toBe('EMAIL_TAKEN');

    const noInvite = await reg({ invitationCode: 'MNY-0000-0000', email: email('dup'), password: PASSWORD });
    expect((await noInvite.json()).code).toBe('INVITATION_INVALID');
    // el intento fallido por correo repetido no gastó la invitación
    const retry = await reg({ invitationCode: code, email: email('dup2'), password: PASSWORD });
    expect(retry.status).toBe(201);
  });

  it('register: campo desconocido o contraseña corta -> 422', async () => {
    const { code } = await createInvitation();
    const extra = await reg({ invitationCode: code, email: email('x'), password: PASSWORD, admin: true });
    expect(extra.status).toBe(422);
    const short = await reg({ invitationCode: code, email: email('x'), password: 'corta' });
    expect(short.status).toBe(422);
  });

  it('login: contraseña incorrecta y correo inexistente dan exactamente la misma respuesta', async () => {
    await signUp('log');
    const wrong = await login(post('login', { email: email('log'), password: WRONG }));
    const ghost = await login(post('login', { email: email('ghost'), password: WRONG }));
    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(await wrong.text()).toBe(await ghost.text());
    expect(wrong.headers.get('set-cookie')).toBeNull();
  });

  it('login correcto emite sesión nueva; con cookie previa del mismo usuario la rota', async () => {
    const { cookie: first } = await signUp('rot');
    const res = await login(post('login', { email: email('rot'), password: PASSWORD }, first));
    expect(res.status).toBe(200);
    const next = cookieOf(res);
    expect(next).not.toBe(first);
    expect((await getSession(authed('GET', 'session', first))).status).toBe(401);
    expect((await getSession(authed('GET', 'session', next))).status).toBe(200);
  });

  it('logout revoca sólo la sesión actual y limpia la cookie', async () => {
    const { cookie: a } = await signUp('out');
    const b = cookieOf(await login(post('login', { email: email('out'), password: PASSWORD })));
    const res = await logout(authed('POST', 'logout', a));
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect((await getSession(authed('GET', 'session', a))).status).toBe(401);
    expect((await getSession(authed('GET', 'session', b))).status).toBe(200);
  });

  it('logout-all revoca todas las sesiones; la otra queda fuera en la petición siguiente', async () => {
    const { cookie: a } = await signUp('all');
    const b = cookieOf(await login(post('login', { email: email('all'), password: PASSWORD })));
    expect((await logoutAll(authed('POST', 'logout-all', a))).status).toBe(204);
    expect((await getSession(authed('GET', 'session', b))).status).toBe(401);
    expect((await logoutAll(authed('POST', 'logout-all', b))).status).toBe(401);
  });

  it('sessions: marca la actual y no devuelve IP', async () => {
    const { cookie: a } = await signUp('list');
    await login(post('login', { email: email('list'), password: PASSWORD }));
    const res = await listSessions(authed('GET', 'sessions', a));
    const { items } = await res.json();
    expect(items).toHaveLength(2);
    expect(items.filter((i: { current: boolean }) => i.current)).toHaveLength(1);
    expect(JSON.stringify(items)).not.toMatch(/ip/i);
    expect(Object.keys(items[0]).sort()).toEqual(['createdAt', 'current', 'id', 'lastSeenAt', 'userAgent']);
  });

  it('DELETE sessions/{id}: propia 204; de otro usuario (intruso) 404 y sigue activa', async () => {
    const { cookie: owner } = await signUp('owner');
    const { cookie: intruder } = await signUp('intruder');
    const ownerSessions = (await (await listSessions(authed('GET', 'sessions', owner))).json()).items;
    const ownerSessionId = ownerSessions[0].id as string;

    const hit = await deleteSession(authed('DELETE', `sessions/${ownerSessionId}`, intruder), {
      params: Promise.resolve({ id: ownerSessionId }),
    });
    expect(hit.status).toBe(404);
    const missing = await deleteSession(authed('DELETE', 'sessions/x', intruder), {
      params: Promise.resolve({ id: '018d0000-0000-7000-8000-00000000dead' }),
    });
    expect(missing.status).toBe(404);
    expect(await hit.json()).toMatchObject({ code: 'NOT_FOUND' });
    expect((await getSession(authed('GET', 'session', owner))).status).toBe(200);

    const own = await deleteSession(authed('DELETE', `sessions/${ownerSessionId}`, owner), {
      params: Promise.resolve({ id: ownerSessionId }),
    });
    expect(own.status).toBe(204);
    expect((await getSession(authed('GET', 'session', owner))).status).toBe(401);
  });
});
