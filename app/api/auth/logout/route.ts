import { apiHandler, noContentResponse } from '@/lib/api/handler';
import { cookieHeaders, findRequestSession } from '@/lib/auth/http';
import { buildClearedSessionCookie } from '@/lib/auth/session';
import { sessionsRepo } from '@/lib/repos/sessions';

// Idempotente: sin sesión válida también limpia la cookie.
export const POST = apiHandler(async ({ req }) => {
  const found = await findRequestSession(req);
  if (found) await sessionsRepo(found.session.userId).revoke(found.session.id);
  return noContentResponse(cookieHeaders(buildClearedSessionCookie()));
});
