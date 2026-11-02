import { apiHandler, noContentResponse } from '@/lib/api/handler';
import { cookieHeaders, requireSession } from '@/lib/auth/http';
import { buildClearedSessionCookie } from '@/lib/auth/session';
import { sessionsRepo } from '@/lib/repos/sessions';

export const POST = apiHandler(async ({ req }) => {
  const { session } = await requireSession(req);
  await sessionsRepo(session.userId).revokeAll();
  return noContentResponse(cookieHeaders(buildClearedSessionCookie()));
});
