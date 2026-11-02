import { eq, sql } from 'drizzle-orm';
import { db, poolDb } from '@/lib/db';
import { users, type User, type NewUser } from '@/lib/db/schema';
import {
  unscopedIsInvitationRedeemable,
  unscopedRedeemInvitation,
} from './invitations';

export type { User };

export type UpdateUserInput = Partial<
  Omit<User, 'id' | 'createdAt' | 'updatedAt'>
>;

/**
 * Scoped repository for user account management (AD-11 / doc 3 §AD-11).
 *
 * CRITICAL (R-03 / RNF-SE-08):
 * Every query is strictly bound to the authenticated userId provided at instantiation.
 * No method accepts userId as an argument or allows an un-scoped query.
 */
export function usersRepo(userId: string) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('usersRepo requires a valid non-empty userId string.');
  }

  return {
    /**
     * Retrieves the user record by the bound userId.
     */
    async findById(): Promise<User | null> {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return user ?? null;
    },

    /**
     * Updates fields on the bound user record.
     */
    async update(data: UpdateUserInput): Promise<User | null> {
      const [updated] = await db
        .update(users)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      return updated ?? null;
    },

    /**
     * Permanently deletes the user account (triggers cascading deletes across related tables).
     */
    async delete(): Promise<boolean> {
      const result = await db
        .delete(users)
        .where(eq(users.id, userId))
        .returning({ id: users.id });

      return result.length > 0;
    },
  };
}

/** Búsqueda por correo antes de conocer al usuario (login). Sin ámbito: por eso `unscoped`. */
export async function unscopedFindUserByEmail(email: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);
  return user ?? null;
}

export type RegisterUserResult =
  | { status: 'ok'; user: User }
  | { status: 'email_taken' }
  | { status: 'invitation_invalid' };

class InvitationRejected extends Error {}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/**
 * Alta atómica (F0-12): inserta el usuario y canjea la invitación en UNA transacción
 * de `poolDb`. Si el canje no afecta a ninguna fila, la transacción entera se revierte.
 * Sin siembra de RF-004 (categorías y cuenta de efectivo): es de F1-05.
 */
export async function unscopedRegisterUser(
  data: NewUser,
  codeHash: string
): Promise<RegisterUserResult> {
  try {
    return await poolDb.transaction(async (tx) => {
      const [user] = await tx.insert(users).values(data).returning();
      const redeemed = await unscopedRedeemInvitation(
        codeHash,
        { userId: user.id, email: user.email },
        tx
      );
      if (!redeemed) throw new InvitationRejected();
      return { status: 'ok' as const, user };
    });
  } catch (error) {
    if (error instanceof InvitationRejected) return { status: 'invitation_invalid' };
    if (isUniqueViolation(error)) {
      // Sin invitación válida no se revela si el correo existe (evita enumeración).
      return (await unscopedIsInvitationRedeemable(codeHash, data.email))
        ? { status: 'email_taken' }
        : { status: 'invitation_invalid' };
    }
    throw error;
  }
}
