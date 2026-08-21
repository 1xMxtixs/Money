import {
  pgTable,
  text,
  char,
  smallint,
  uuid,
  timestamp,
  check,
  unique,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------- Catálogos ----------

export const currencies = pgTable(
  'currencies',
  {
    code: char('code', { length: 3 }).primaryKey(),
    decimals: smallint('decimals').notNull(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
  },
  (table) => [
    check('currencies_decimals_check', sql`${table.decimals} BETWEEN 0 AND 4`),
  ]
);

// ---------- Identidad y Acceso ----------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name'),
    primaryCurrencyCode: char('primary_currency_code', { length: 3 })
      .notNull()
      .default('CLP')
      .references(() => currencies.code),
    locale: text('locale').notNull().default('es-CL'),
    timezone: text('timezone').notNull().default('America/Santiago'),
    theme: text('theme').notNull().default('system'),
    consentVersion: text('consent_version').notNull(),
    consentAcceptedAt: timestamp('consent_accepted_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('users_email_len_check', sql`char_length(${table.email}) <= 254`),
    check('users_display_name_len_check', sql`char_length(${table.displayName}) <= 80`),
    check('users_locale_check', sql`${table.locale} IN ('es-CL','en-US')`),
    check('users_theme_check', sql`${table.theme} IN ('light','dark','system')`),
    unique('users_id_primary_currency_code_key').on(table.id, table.primaryCurrencyCode),
    uniqueIndex('uq_users_email').on(sql`lower(${table.email})`),
  ]
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    check('sessions_user_agent_len_check', sql`char_length(${table.userAgent}) <= 255`),
    index('idx_sessions_user').on(table.userId).where(sql`revoked_at IS NULL`),
    index('idx_sessions_expiry').on(table.expiresAt),
  ]
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey(),
    codeHash: text('code_hash').notNull(),
    invitedEmail: text('invited_email'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    redeemedBy: uuid('redeemed_by').references(() => users.id, { onDelete: 'set null' }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('invitations_invited_email_len_check', sql`char_length(${table.invitedEmail}) <= 254`),
    uniqueIndex('uq_invitations_code').on(table.codeHash),
  ]
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_prt_user').on(table.userId).where(sql`used_at IS NULL`),
  ]
);

// Inferred TypeScript types
export type Currency = typeof currencies.$inferSelect;
export type NewCurrency = typeof currencies.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
