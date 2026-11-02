import { apiHandler, jsonResponse } from '@/lib/api/handler';
import { unauthenticated } from '@/lib/api/problem';
import { cookieHeaders, requireSession, toUserDto } from '@/lib/auth/http';
import { usersRepo } from '@/lib/repos/users';

export const GET = apiHandler(async ({ req }) => {
  const { session, refreshedCookie } = await requireSession(req);
  const user = await usersRepo(session.userId).findById();
  if (!user) throw unauthenticated();
  return jsonResponse({ user: toUserDto(user) }, 200, cookieHeaders(refreshedCookie));
});
