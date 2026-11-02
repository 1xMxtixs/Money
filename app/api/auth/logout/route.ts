import { apiHandler, noContentResponse } from '@/lib/api/handler';
import { internalError, problemResponse } from '@/lib/api/problem';
import { cookieHeaders, findRequestSession } from '@/lib/auth/http';
import { buildClearedSessionCookie } from '@/lib/auth/session';
import { sessionsRepo } from '@/lib/repos/sessions';

// Idempotente y la cookie se limpia SIEMPRE, incluso si la revocación falla.
export const POST = apiHandler(async ({ req }) => {
  const clear = cookieHeaders(buildClearedSessionCookie());
  try {
    const found = await findRequestSession(req);
    if (found) await sessionsRepo(found.session.userId).revoke(found.session.id);
  } catch (error) {
    // Nunca se registra el testigo ni la petición: sólo el tipo de error.
    console.error('Logout failed to revoke session:', error instanceof Error ? error.name : 'unknown');
    const err = internalError();
    return problemResponse(
      { type: err.type || 'https://money.app/errors/internal', title: err.message, status: err.status, code: err.code },
      clear
    );
  }
  return noContentResponse(clear);
});
