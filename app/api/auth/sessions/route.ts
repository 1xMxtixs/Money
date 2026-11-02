import { apiHandler, jsonResponse } from '@/lib/api/handler';
import { cookieHeaders, requireSession } from '@/lib/auth/http';
import { sessionsRepo } from '@/lib/repos/sessions';

// Sin IP: no se guarda (doc 4 §5).
export const GET = apiHandler(async ({ req }) => {
  const { session, refreshedCookie } = await requireSession(req);
  const rows = await sessionsRepo(session.userId).listActive();
  return jsonResponse(
    {
      items: rows.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        lastSeenAt: s.lastSeenAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        current: s.id === session.id,
      })),
    },
    200,
    cookieHeaders(refreshedCookie)
  );
});
