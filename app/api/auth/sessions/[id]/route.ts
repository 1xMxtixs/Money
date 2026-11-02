import { apiHandler, noContentResponse } from '@/lib/api/handler';
import { notFound } from '@/lib/api/problem';
import { cookieHeaders, requireSession } from '@/lib/auth/http';
import { buildClearedSessionCookie } from '@/lib/auth/session';
import { sessionsRepo } from '@/lib/repos/sessions';
import { sessionIdParamSchema } from '@/lib/schemas/auth';

// Ajena, inexistente o ya revocada: siempre 404 (AC-05).
export const DELETE = apiHandler<unknown, { id: string }>(async ({ req, params }) => {
  const { session } = await requireSession(req);
  const id = sessionIdParamSchema.safeParse(params.id);
  if (!id.success) throw notFound();
  if (!(await sessionsRepo(session.userId).revoke(id.data))) throw notFound();
  return noContentResponse(
    id.data === session.id ? cookieHeaders(buildClearedSessionCookie()) : undefined
  );
});
