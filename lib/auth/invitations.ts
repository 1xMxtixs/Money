import crypto from 'node:crypto';
import { uuidv7 } from '@/lib/domain/id/uuidv7';
import {
  unscopedCreateInvitation,
  unscopedRedeemInvitation,
  type Invitation,
  type InvitationExecutor,
} from '@/lib/repos/invitations';

// Crockford base32 (sin I, L, O, U): 32 símbolos = 5 bits por carácter.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_REGEX = /^MNY-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
export const INVITATION_TTL_DAYS = 14;

/** 5 bytes aleatorios = 40 bits, codificados como 8 símbolos: MNY-XXXX-XXXX. */
export function generateInvitationCode(): string {
  const bytes = crypto.randomBytes(5);
  let bits = BigInt(`0x${bytes.toString('hex')}`);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out = ALPHABET[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return `MNY-${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Normaliza (mayúsculas, sin espacios) y devuelve null si el formato no es válido. */
export function normalizeInvitationCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const normalized = code.trim().toUpperCase();
  return CODE_REGEX.test(normalized) ? normalized : null;
}

export function hashInvitationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/** Crea una invitación; el código en claro solo se devuelve aquí. */
export async function createInvitation(
  invitedEmail?: string | null
): Promise<{ code: string; invitation: Invitation }> {
  const code = generateInvitationCode();
  const invitation = await unscopedCreateInvitation({
    id: uuidv7(),
    codeHash: hashInvitationCode(code),
    invitedEmail: invitedEmail?.trim().toLowerCase() || null,
    expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
  });
  return { code, invitation };
}

/** Canjea un código dentro de la transacción del llamador. null = inválido/usado/caducado/otro correo. */
export async function redeemInvitation(
  code: string,
  redeemer: { userId: string; email: string },
  executor?: InvitationExecutor
): Promise<Invitation | null> {
  const normalized = normalizeInvitationCode(code);
  if (!normalized) return null;
  return unscopedRedeemInvitation(hashInvitationCode(normalized), redeemer, executor);
}
