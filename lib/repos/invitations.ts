import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db, poolDb } from '@/lib/db';
import { invitations, type Invitation, type NewInvitation } from '@/lib/db/schema';

export type { Invitation };

/** Ejecutor compatible con `poolDb` o con una transacción de `poolDb.transaction`. */
export type InvitationExecutor = Pick<typeof poolDb, 'update'>;

/**
 * Las invitaciones NO tienen userId: se crean desde el guion del autor y se canjean
 * durante el alta, antes de que exista el usuario. Por eso viven en funciones
 * `unscoped*` explícitas (mismo criterio que `unscopedFindSessionByTokenHash`) y no
 * en un repositorio con ámbito. Ninguna expone datos de otros usuarios: solo operan
 * sobre el hash del código.
 */
export async function unscopedCreateInvitation(
  data: Pick<NewInvitation, 'id' | 'codeHash' | 'invitedEmail' | 'expiresAt'>
): Promise<Invitation> {
  const [row] = await db.insert(invitations).values(data).returning();
  return row;
}

/** Única definición de "canjeable": sin canjear, vigente y con el correo permitido. */
function redeemablePredicate(codeHash: string, email: string) {
  return and(
    eq(invitations.codeHash, codeHash),
    isNull(invitations.redeemedAt),
    gt(invitations.expiresAt, sql`now()`),
    or(
      isNull(invitations.invitedEmail),
      sql`lower(${invitations.invitedEmail}) = lower(${email})`
    )
  );
}

/**
 * Canje atómico: un único UPDATE ... WHERE redeemed_at IS NULL AND expires_at > now() RETURNING.
 * Si dos canjes compiten, Postgres serializa la fila y solo uno cumple la condición.
 * `executor` permite ejecutarlo dentro de la transacción de alta (F0-12), donde el
 * usuario debe insertarse antes por la clave foránea `redeemed_by`.
 * Devuelve null si el código no existe, caducó, ya se usó o el correo no coincide.
 */
export async function unscopedRedeemInvitation(
  codeHash: string,
  redeemer: { userId: string; email: string },
  executor: InvitationExecutor = poolDb
): Promise<Invitation | null> {
  const [row] = await executor
    .update(invitations)
    .set({ redeemedBy: redeemer.userId, redeemedAt: sql`now()` })
    .where(redeemablePredicate(codeHash, redeemer.email))
    .returning();

  return row ?? null;
}

/** Lectura sin efectos: ¿el código podría canjearse ahora con este correo? */
export async function unscopedIsInvitationRedeemable(
  codeHash: string,
  email: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(redeemablePredicate(codeHash, email))
    .limit(1);
  return Boolean(row);
}
