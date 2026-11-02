import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, poolDb } from '@/lib/db';
import { invitations, users } from '@/lib/db/schema';
import { uuidv7 } from '@/lib/domain/id/uuidv7';
import {
  createInvitation,
  generateInvitationCode,
  hashInvitationCode,
  normalizeInvitationCode,
  redeemInvitation,
} from '@/lib/auth/invitations';

const databaseUrl = process.env.DATABASE_URL;

describe('formato del código', () => {
  it('genera MNY-XXXX-XXXX con alfabeto Crockford', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInvitationCode()).toMatch(/^MNY-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    }
  });

  it('normaliza minúsculas/espacios y rechaza formatos inválidos', () => {
    expect(normalizeInvitationCode(' mny-0abc-1def ')).toBe('MNY-0ABC-1DEF');
    expect(normalizeInvitationCode('MNY-ILOU-ILOU')).toBeNull();
    expect(normalizeInvitationCode('MNY-0ABC')).toBeNull();
    expect(normalizeInvitationCode(42)).toBeNull();
  });
});

describe('invitaciones (integración PostgreSQL)', () => {
  const userIds = [uuidv7(), uuidv7()];
  const emails = [`inv-a-${userIds[0]}@example.com`, `inv-b-${userIds[1]}@example.com`];

  beforeEach(() => {
    // Falla (nunca se omite) si falta la infraestructura.
    if (!databaseUrl) throw new Error('DATABASE_URL is not set. Integration tests require PostgreSQL.');
  });

  afterAll(async () => {
    if (!databaseUrl) return;
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
  });

  async function makeUser(i: number) {
    await db.insert(users).values({
      id: userIds[i],
      email: emails[i],
      passwordHash: 'x',
      primaryCurrencyCode: 'CLP',
      consentVersion: 'v1.0',
      consentAcceptedAt: new Date(),
    }).onConflictDoNothing();
  }

  it('guarda solo el SHA-256 y caduca a 14 días', async () => {
    const { code, invitation } = await createInvitation();
    expect(invitation.codeHash).toBe(hashInvitationCode(code));
    expect(invitation.codeHash).not.toContain('MNY');
    const days = (invitation.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });

  it('dos canjes concurrentes: solo uno tiene éxito', async () => {
    await makeUser(0);
    await makeUser(1);
    const { code } = await createInvitation();
    const results = await Promise.all([
      redeemInvitation(code, { userId: userIds[0], email: emails[0] }),
      redeemInvitation(code, { userId: userIds[1], email: emails[1] }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('segundo canje secuencial falla; funciona dentro de una transacción', async () => {
    await makeUser(0);
    const { code } = await createInvitation();
    const first = await poolDb.transaction((tx) =>
      redeemInvitation(code, { userId: userIds[0], email: emails[0] }, tx)
    );
    expect(first?.redeemedBy).toBe(userIds[0]);
    expect(await redeemInvitation(code, { userId: userIds[0], email: emails[0] })).toBeNull();
  });

  it('rechaza caducadas y códigos inexistentes', async () => {
    await makeUser(0);
    const { code, invitation } = await createInvitation();
    await db.update(invitations).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(invitations.id, invitation.id));
    expect(await redeemInvitation(code, { userId: userIds[0], email: emails[0] })).toBeNull();
    expect(await redeemInvitation('MNY-0000-0000', { userId: userIds[0], email: emails[0] })).toBeNull();
  });

  it('con invited_email exige coincidencia (sin distinguir mayúsculas)', async () => {
    await makeUser(0);
    await makeUser(1);
    const { code } = await createInvitation(emails[0].toUpperCase());
    expect(await redeemInvitation(code, { userId: userIds[1], email: emails[1] })).toBeNull();
    expect(await redeemInvitation(code, { userId: userIds[0], email: emails[0] })).not.toBeNull();
  });
});
