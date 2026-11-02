import { apiHandler, jsonResponse } from '@/lib/api/handler';
import { unauthenticated } from '@/lib/api/problem';
import { cookieHeaders, findRequestSession, toUserDto } from '@/lib/auth/http';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, rotateSession } from '@/lib/auth/session';
import { sessionsRepo } from '@/lib/repos/sessions';
import { unscopedFindUserByEmail } from '@/lib/repos/users';
import { loginSchema, type LoginInput } from '@/lib/schemas/auth';

export const POST = apiHandler<LoginInput>(
  async ({ req, body }) => {
    const user = await unscopedFindUserByEmail(body.email);
    // Se verifica siempre (con hash señuelo si no hay usuario): mismo tiempo y misma respuesta.
    const ok = await verifyPassword(user?.passwordHash, body.password);
    if (!user || !ok) throw unauthenticated('Invalid credentials');

    const userAgent = req.headers.get('user-agent');
    const previous = (await findRequestSession(req))?.session;
    let cookie: string;
    if (previous && previous.userId === user.id) {
      // Rotación al iniciar sesión; si la anterior ya no sirve, se crea una nueva.
      cookie = await rotateSession(user.id, previous.id, userAgent)
        .then((r) => r.cookie)
        .catch(async () => (await createSession(user.id, userAgent)).cookie);
    } else {
      if (previous) await sessionsRepo(previous.userId).revoke(previous.id);
      cookie = (await createSession(user.id, userAgent)).cookie;
    }

    return jsonResponse({ user: toUserDto(user) }, 200, cookieHeaders(cookie));
  },
  { bodySchema: loginSchema }
);
