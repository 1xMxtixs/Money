import { unauthenticated } from '@/lib/api/problem';
import { resolveSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import type { Session, User } from '@/lib/repos';

/** Extrae el testigo de la cabecera Cookie (null si no hay). */
export function readSessionToken(req: Request): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE_NAME) return rest.join('=') || null;
  }
  return null;
}

export async function findRequestSession(
  req: Request
): Promise<{ session: Session; refreshedCookie?: string } | null> {
  const token = readSessionToken(req);
  return token ? resolveSession(token) : null;
}

/** Exige sesión válida; si no, 401 UNAUTHENTICATED. */
export async function requireSession(req: Request) {
  const found = await findRequestSession(req);
  if (!found) throw unauthenticated();
  return found;
}

/** Cabeceras con Set-Cookie sólo si hay valor. */
export function cookieHeaders(cookie?: string): HeadersInit | undefined {
  return cookie ? { 'Set-Cookie': cookie } : undefined;
}

/** Forma pública del usuario (doc 6 §4): nunca incluye el hash de contraseña. */
export function toUserDto(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    primaryCurrency: user.primaryCurrencyCode,
    locale: user.locale,
    timezone: user.timezone,
    theme: user.theme,
    createdAt: user.createdAt.toISOString(),
  };
}
