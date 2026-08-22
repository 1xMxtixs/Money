import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, type User } from '@/lib/db/schema';

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
