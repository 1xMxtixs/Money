-- ============================================================
-- Money — DDL Verification Script (PostgreSQL 15)
-- ============================================================
-- Tests:
-- 1. Full schema creation (tables, constraints, triggers, indexes)
-- 2. Data seeding (user, invitation, account, category, recurring_rule,
--    transactions, budget, goal, goal_contribution, session, reset token)
-- 3. Deletion of user (DELETE FROM users)
-- 4. Verification that all user-owned rows are deleted and invitation
--    redeemed_by is set to NULL without violating constraints.
-- ============================================================

\set ON_ERROR_STOP on

BEGIN;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ---------- Catálogos ----------

CREATE TABLE currencies (
    code      char(3)  PRIMARY KEY,
    decimals  smallint NOT NULL CHECK (decimals BETWEEN 0 AND 4),
    symbol    text     NOT NULL,
    name      text     NOT NULL
);

CREATE TABLE exchange_rates (
    rate_date   date         NOT NULL,
    base_code   char(3)      NOT NULL REFERENCES currencies(code),
    quote_code  char(3)      NOT NULL REFERENCES currencies(code),
    rate        numeric(18,8) NOT NULL CHECK (rate > 0),
    rate_source text         NOT NULL CHECK (rate_source IN ('bcch','manual','fallback')),
    fetched_at  timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (rate_date, base_code, quote_code),
    CHECK (base_code <> quote_code)
);

-- ---------- Identidad ----------

CREATE TABLE users (
    id                    uuid        PRIMARY KEY,
    email                 text        NOT NULL CHECK (char_length(email) <= 254),
    email_verified_at     timestamptz,
    password_hash         text        NOT NULL,
    display_name          text        CHECK (char_length(display_name) <= 80),
    primary_currency_code char(3)     NOT NULL DEFAULT 'CLP' REFERENCES currencies(code),
    locale                text        NOT NULL DEFAULT 'es-CL' CHECK (locale IN ('es-CL','en-US')),
    timezone              text        NOT NULL DEFAULT 'America/Santiago',
    theme                 text        NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
    consent_version       text        NOT NULL,
    consent_accepted_at   timestamptz NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, primary_currency_code)
);

CREATE UNIQUE INDEX uq_users_email ON users (lower(email));

CREATE TABLE sessions (
    id           uuid        PRIMARY KEY,
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   text        NOT NULL UNIQUE,
    user_agent   text        CHECK (char_length(user_agent) <= 255),
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    revoked_at   timestamptz
);

CREATE INDEX idx_sessions_user   ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expiry ON sessions (expires_at);

CREATE TABLE invitations (
    id            uuid        PRIMARY KEY,
    code_hash     text        NOT NULL,
    invited_email text        CHECK (char_length(invited_email) <= 254),
    expires_at    timestamptz NOT NULL,
    redeemed_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
    redeemed_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_invitations_code ON invitations (code_hash);

CREATE TABLE password_reset_tokens (
    id         uuid        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text        NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prt_user ON password_reset_tokens (user_id) WHERE used_at IS NULL;

-- ---------- Núcleo financiero ----------

CREATE TABLE accounts (
    id                    uuid        PRIMARY KEY,
    user_id               uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                  text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    type                  text        NOT NULL CHECK (type IN ('bank','cash','card','savings')),
    currency_code         char(3)     NOT NULL REFERENCES currencies(code),
    initial_balance_minor bigint      NOT NULL DEFAULT 0,
    sort_order            smallint    NOT NULL DEFAULT 0,
    archived_at           timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    deleted_at            timestamptz,
    -- Claves candidatas para las foráneas compuestas (DD-01)
    UNIQUE (user_id, id, currency_code),
    UNIQUE (user_id, id)
);

CREATE UNIQUE INDEX uq_accounts_name
    ON accounts (user_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_accounts_user
    ON accounts (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_accounts_sync
    ON accounts (user_id, updated_at);

CREATE TABLE categories (
    id          uuid        PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
    kind        text        NOT NULL CHECK (kind IN ('expense','income')),
    icon        text        NOT NULL CHECK (char_length(icon) <= 40),
    color       text        NOT NULL CHECK (color ~ '^#[0-9a-f]{6}$'),
    is_system   boolean     NOT NULL DEFAULT false,
    sort_order  smallint    NOT NULL DEFAULT 0,
    archived_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    UNIQUE (user_id, id, kind),
    UNIQUE (user_id, id)
);

CREATE UNIQUE INDEX uq_categories_name
    ON categories (user_id, kind, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_user
    ON categories (user_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_sync
    ON categories (user_id, updated_at);

CREATE TABLE recurring_rules (
    id                uuid        PRIMARY KEY,
    user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind              text        NOT NULL CHECK (kind IN ('expense','income')),
    account_id        uuid        NOT NULL,
    category_id       uuid        NOT NULL,
    amount_minor      bigint      NOT NULL CHECK (amount_minor > 0),
    currency_code     char(3)     NOT NULL REFERENCES currencies(code),
    frequency         text        NOT NULL CHECK (frequency IN ('weekly','monthly','yearly')),
    start_on          date        NOT NULL,
    end_on            date        CHECK (end_on IS NULL OR end_on >= start_on),
    last_generated_on date,
    paused_at         timestamptz,
    note              text        CHECK (char_length(note) <= 500),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, account_id, currency_code)
        REFERENCES accounts (user_id, id, currency_code),
    FOREIGN KEY (user_id, category_id, kind)
        REFERENCES categories (user_id, id, kind)
);

CREATE INDEX idx_rules_due
    ON recurring_rules (user_id, last_generated_on, start_on)
    WHERE deleted_at IS NULL AND paused_at IS NULL;
CREATE INDEX idx_rules_sync
    ON recurring_rules (user_id, updated_at);

CREATE TABLE transactions (
    id                    uuid        PRIMARY KEY,
    user_id               uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind                  text        NOT NULL
        CHECK (kind IN ('expense','income','transfer_out','transfer_in')),
    account_id            uuid        NOT NULL,
    category_id           uuid,
    category_kind         text        GENERATED ALWAYS AS (
        CASE kind WHEN 'expense' THEN 'expense'
                  WHEN 'income'  THEN 'income' END
    ) STORED,
    amount_minor          bigint      NOT NULL CHECK (amount_minor > 0),
    currency_code         char(3)     NOT NULL REFERENCES currencies(code),
    amount_primary_minor  bigint      NOT NULL,
    primary_currency_code char(3)     NOT NULL REFERENCES currencies(code),
    exchange_rate         numeric(18,8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
    rate_date             date,
    occurred_on           date        NOT NULL,
    note                  text        CHECK (char_length(note) <= 500),
    transfer_group_id     uuid,
    recurring_rule_id     uuid,
    occurrence_on         date,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    deleted_at            timestamptz,

    FOREIGN KEY (user_id, account_id, currency_code)
        REFERENCES accounts (user_id, id, currency_code),
    FOREIGN KEY (user_id, category_id, category_kind)
        REFERENCES categories (user_id, id, kind),
    FOREIGN KEY (user_id, recurring_rule_id)
        REFERENCES recurring_rules (user_id, id) ON DELETE NO ACTION,

    CONSTRAINT ck_tx_category CHECK (
        (kind IN ('expense','income')           AND category_id IS NOT NULL)
     OR (kind IN ('transfer_out','transfer_in') AND category_id IS NULL)
    ),
    CONSTRAINT ck_tx_transfer CHECK (
        (kind IN ('transfer_out','transfer_in') AND transfer_group_id IS NOT NULL)
     OR (kind IN ('expense','income')           AND transfer_group_id IS NULL)
    ),
    CONSTRAINT ck_tx_recurrence CHECK (
        (recurring_rule_id IS NULL) = (occurrence_on IS NULL)
    ),
    CONSTRAINT ck_tx_conversion CHECK (
        (currency_code =  primary_currency_code AND exchange_rate = 1 AND rate_date IS NULL)
     OR (currency_code <> primary_currency_code AND rate_date IS NOT NULL)
    )
);

CREATE INDEX idx_tx_user_date
    ON transactions (user_id, occurred_on DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_tx_user_cat_date
    ON transactions (user_id, category_id, occurred_on)
    WHERE deleted_at IS NULL AND kind = 'expense';
CREATE INDEX idx_tx_user_acct_date
    ON transactions (user_id, account_id, occurred_on) WHERE deleted_at IS NULL;
CREATE INDEX idx_tx_user_updated
    ON transactions (user_id, updated_at);
CREATE INDEX idx_tx_transfer_group
    ON transactions (transfer_group_id) WHERE transfer_group_id IS NOT NULL;
CREATE UNIQUE INDEX uq_tx_recurrence
    ON transactions (recurring_rule_id, occurrence_on) WHERE deleted_at IS NULL;

-- ---------- Planificación ----------

CREATE TABLE budgets (
    id             uuid        PRIMARY KEY,
    user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id    uuid        NOT NULL,
    category_kind  text        GENERATED ALWAYS AS ('expense') STORED,
    amount_minor   bigint      NOT NULL CHECK (amount_minor > 0),
    currency_code  char(3)     NOT NULL REFERENCES currencies(code),
    effective_from date        NOT NULL CHECK (date_trunc('month', effective_from) = effective_from),
    effective_to   date        CHECK (
        effective_to IS NULL
        OR (date_trunc('month', effective_to) = effective_to AND effective_to > effective_from)
    ),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    deleted_at     timestamptz,
    FOREIGN KEY (user_id, category_id, category_kind)
        REFERENCES categories (user_id, id, kind),
    FOREIGN KEY (user_id, currency_code)
        REFERENCES users (id, primary_currency_code)
        DEFERRABLE INITIALLY IMMEDIATE
);

CREATE UNIQUE INDEX uq_budgets_active
    ON budgets (user_id, category_id)
    WHERE effective_to IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_budgets_period
    ON budgets (user_id, effective_from) WHERE deleted_at IS NULL;
CREATE INDEX idx_budgets_sync
    ON budgets (user_id, updated_at);

CREATE TABLE goals (
    id                  uuid        PRIMARY KEY,
    user_id             uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    target_amount_minor bigint      NOT NULL CHECK (target_amount_minor > 0),
    currency_code       char(3)     NOT NULL REFERENCES currencies(code),
    deadline_on         date,
    icon                text        CHECK (char_length(icon) <= 40),
    completed_at        timestamptz,
    archived_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    UNIQUE (user_id, id),
    FOREIGN KEY (user_id, currency_code)
        REFERENCES users (id, primary_currency_code)
        DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX idx_goals_user ON goals (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_goals_sync ON goals (user_id, updated_at);

CREATE TABLE goal_contributions (
    id           uuid        PRIMARY KEY,
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id      uuid        NOT NULL,
    amount_minor bigint      NOT NULL CHECK (amount_minor <> 0),
    occurred_on  date        NOT NULL,
    note         text        CHECK (char_length(note) <= 200),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz,
    FOREIGN KEY (user_id, goal_id) REFERENCES goals (user_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_contrib_goal
    ON goal_contributions (goal_id, occurred_on) WHERE deleted_at IS NULL;
CREATE INDEX idx_contrib_sync
    ON goal_contributions (user_id, updated_at);

-- ---------- Disparador único de updated_at ----------

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_users        BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_touch_accounts     BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_touch_categories   BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_touch_transactions BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_touch_budgets      BEFORE UPDATE ON budgets
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_touch_goals        BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_touch_contrib      BEFORE UPDATE ON goal_contributions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_touch_rules        BEFORE UPDATE ON recurring_rules
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- SEED DATA AND VERIFICATION TEST
-- ============================================================

-- 1. Catálogos
INSERT INTO currencies (code, decimals, symbol, name) VALUES
    ('CLP', 0, '$', 'Peso chileno'),
    ('USD', 2, '$', 'Dólar estadounidense');

-- 2. Usuario principal
INSERT INTO users (
    id, email, password_hash, display_name, primary_currency_code,
    locale, timezone, theme, consent_version, consent_accepted_at
) VALUES (
    '018d0000-0000-7000-8000-000000000001',
    'testuser@example.com',
    '$argon2id$v=19$m=19456,t=2,p=1$fakehashforverification',
    'Usuario Prueba',
    'CLP',
    'es-CL',
    'America/Santiago',
    'system',
    'v1.0',
    now()
);

-- 3. Invitación canjeada por el usuario
INSERT INTO invitations (
    id, code_hash, invited_email, expires_at, redeemed_by, redeemed_at
) VALUES (
    '018d0000-0000-7000-8000-000000000002',
    'fake_code_hash_invitation',
    'testuser@example.com',
    now() + interval '7 days',
    '018d0000-0000-7000-8000-000000000001',
    now()
);

-- 4. Sesión y Token de recuperación
INSERT INTO sessions (
    id, user_id, token_hash, expires_at
) VALUES (
    '018d0000-0000-7000-8000-000000000003',
    '018d0000-0000-7000-8000-000000000001',
    'fake_session_token_hash',
    now() + interval '30 days'
);

INSERT INTO password_reset_tokens (
    id, user_id, token_hash, expires_at
) VALUES (
    '018d0000-0000-7000-8000-000000000004',
    '018d0000-0000-7000-8000-000000000001',
    'fake_reset_token_hash',
    now() + interval '1 hour'
);

-- 5. Cuentas (CLP y USD)
INSERT INTO accounts (
    id, user_id, name, type, currency_code, initial_balance_minor
) VALUES (
    '018d0000-0000-7000-8000-000000000010',
    '018d0000-0000-7000-8000-000000000001',
    'Cuenta Corriente',
    'bank',
    'CLP',
    100000
), (
    '018d0000-0000-7000-8000-000000000011',
    '018d0000-0000-7000-8000-000000000001',
    'Billetera USD',
    'cash',
    'USD',
    5000
);

-- 6. Categorías (gasto e ingreso)
INSERT INTO categories (
    id, user_id, name, kind, icon, color, is_system
) VALUES (
    '018d0000-0000-7000-8000-000000000020',
    '018d0000-0000-7000-8000-000000000001',
    'Supermercado',
    'expense',
    'shopping-cart',
    '#16a34a',
    true
), (
    '018d0000-0000-7000-8000-000000000021',
    '018d0000-0000-7000-8000-000000000001',
    'Sueldo',
    'income',
    'wallet',
    '#2563eb',
    true
);

-- 7. Regla recurrente
INSERT INTO recurring_rules (
    id, user_id, kind, account_id, category_id,
    amount_minor, currency_code, frequency, start_on
) VALUES (
    '018d0000-0000-7000-8000-000000000030',
    '018d0000-0000-7000-8000-000000000001',
    'expense',
    '018d0000-0000-7000-8000-000000000010',
    '018d0000-0000-7000-8000-000000000020',
    30000,
    'CLP',
    'monthly',
    '2026-08-01'
);

-- 8. Movimientos:
-- a) Gasto generado por regla recurrente
INSERT INTO transactions (
    id, user_id, kind, account_id, category_id,
    amount_minor, currency_code, amount_primary_minor, primary_currency_code,
    exchange_rate, rate_date, occurred_on, recurring_rule_id, occurrence_on
) VALUES (
    '018d0000-0000-7000-8000-000000000040',
    '018d0000-0000-7000-8000-000000000001',
    'expense',
    '018d0000-0000-7000-8000-000000000010',
    '018d0000-0000-7000-8000-000000000020',
    30000,
    'CLP',
    30000,
    'CLP',
    1,
    NULL,
    '2026-08-01',
    '018d0000-0000-7000-8000-000000000030',
    '2026-08-01'
);

-- b) Ingreso normal
INSERT INTO transactions (
    id, user_id, kind, account_id, category_id,
    amount_minor, currency_code, amount_primary_minor, primary_currency_code,
    exchange_rate, rate_date, occurred_on
) VALUES (
    '018d0000-0000-7000-8000-000000000041',
    '018d0000-0000-7000-8000-000000000001',
    'income',
    '018d0000-0000-7000-8000-000000000010',
    '018d0000-0000-7000-8000-000000000021',
    800000,
    'CLP',
    800000,
    'CLP',
    1,
    NULL,
    '2026-08-05'
);

-- c) Transferencia entre cuentas (par con transfer_group_id)
INSERT INTO transactions (
    id, user_id, kind, account_id, category_id,
    amount_minor, currency_code, amount_primary_minor, primary_currency_code,
    exchange_rate, rate_date, occurred_on, transfer_group_id
) VALUES (
    '018d0000-0000-7000-8000-000000000042',
    '018d0000-0000-7000-8000-000000000001',
    'transfer_out',
    '018d0000-0000-7000-8000-000000000010',
    NULL,
    50000,
    'CLP',
    50000,
    'CLP',
    1,
    NULL,
    '2026-08-10',
    '018d0000-0000-7000-8000-000000000099'
), (
    '018d0000-0000-7000-8000-000000000043',
    '018d0000-0000-7000-8000-000000000001',
    'transfer_in',
    '018d0000-0000-7000-8000-000000000011',
    NULL,
    5000,
    'USD',
    4750000,
    'CLP',
    950.00000000,
    '2026-08-10',
    '2026-08-10',
    '018d0000-0000-7000-8000-000000000099'
);

-- 9. Presupuesto mensual
INSERT INTO budgets (
    id, user_id, category_id, amount_minor, currency_code, effective_from
) VALUES (
    '018d0000-0000-7000-8000-000000000050',
    '018d0000-0000-7000-8000-000000000001',
    '018d0000-0000-7000-8000-000000000020',
    150000,
    'CLP',
    '2026-08-01'
);

-- 10. Meta y aportación
INSERT INTO goals (
    id, user_id, name, target_amount_minor, currency_code
) VALUES (
    '018d0000-0000-7000-8000-000000000060',
    '018d0000-0000-7000-8000-000000000001',
    'Fondo de Emergencia',
    1000000,
    'CLP'
);

INSERT INTO goal_contributions (
    id, user_id, goal_id, amount_minor, occurred_on
) VALUES (
    '018d0000-0000-7000-8000-000000000070',
    '018d0000-0000-7000-8000-000000000001',
    '018d0000-0000-7000-8000-000000000060',
    50000,
    '2026-08-15'
);

-- ============================================================
-- EJECUCIÓN DE ELIMINACIÓN DE USUARIO (DELETE FROM users)
-- ============================================================

DELETE FROM users WHERE id = '018d0000-0000-7000-8000-000000000001';

-- ============================================================
-- VERIFICACIÓN DE PURGA COMPLETA
-- ============================================================

DO $$
DECLARE
    v_users_count int;
    v_sessions_count int;
    v_invitations_orphans int;
    v_invitations_redeemed_user int;
    v_prt_count int;
    v_accounts_count int;
    v_categories_count int;
    v_recurring_rules_count int;
    v_transactions_count int;
    v_budgets_count int;
    v_goals_count int;
    v_goal_contrib_count int;
    v_target_user uuid := '018d0000-0000-7000-8000-000000000001';
BEGIN
    SELECT count(*) INTO v_users_count FROM users WHERE id = v_target_user;
    SELECT count(*) INTO v_sessions_count FROM sessions WHERE user_id = v_target_user;
    SELECT count(*) INTO v_invitations_redeemed_user FROM invitations WHERE redeemed_by = v_target_user;
    SELECT count(*) INTO v_invitations_orphans FROM invitations WHERE id = '018d0000-0000-7000-8000-000000000002' AND redeemed_by IS NULL AND redeemed_at IS NOT NULL;
    SELECT count(*) INTO v_prt_count FROM password_reset_tokens WHERE user_id = v_target_user;
    SELECT count(*) INTO v_accounts_count FROM accounts WHERE user_id = v_target_user;
    SELECT count(*) INTO v_categories_count FROM categories WHERE user_id = v_target_user;
    SELECT count(*) INTO v_recurring_rules_count FROM recurring_rules WHERE user_id = v_target_user;
    SELECT count(*) INTO v_transactions_count FROM transactions WHERE user_id = v_target_user;
    SELECT count(*) INTO v_budgets_count FROM budgets WHERE user_id = v_target_user;
    SELECT count(*) INTO v_goals_count FROM goals WHERE user_id = v_target_user;
    SELECT count(*) INTO v_goal_contrib_count FROM goal_contributions WHERE user_id = v_target_user;

    IF v_users_count <> 0 THEN
        RAISE EXCEPTION 'Verification failed: users row was not deleted (count: %)', v_users_count;
    END IF;
    IF v_sessions_count <> 0 THEN
        RAISE EXCEPTION 'Verification failed: sessions rows not deleted (count: %)', v_sessions_count;
    END IF;
    IF v_invitations_redeemed_user <> 0 THEN
        RAISE EXCEPTION 'Verification failed: invitations still references deleted user (count: %)', v_invitations_redeemed_user;
    END IF;
    IF v_invitations_orphans <> 1 THEN
        RAISE EXCEPTION 'Verification failed: invitation record was not preserved with redeemed_by=NULL';
    END IF;
    IF v_prt_count <> 0 THEN
        RAISE EXCEPTION 'Verification failed: password_reset_tokens rows not deleted (count: %)', v_prt_count;
    END IF;
    IF v_accounts_count <> 0 THEN
        RAISE EXCEPTION 'Verification failed: accounts rows not deleted (count: %)', v_accounts_count;
    END IF;
    IF v_categories_count <> 0 THEN
        RAISE EXCEPTION 'Verification failed: categories rows not deleted (count: %)', v_categories_count;
    END IF;
    IF v_recurring_rules_count <> 0 THEN
        RAISE EXCEPTION 'Verification failed: recurring_rules rows not deleted (count: %)', v_recurring_rules_count;
    END IF;
    IF v_transactions_count <> 0 THEN
        RAISE EXCEPTION 'Verification failed: transactions rows not deleted (count: %)', v_transactions_count;
    END IF;
    IF v_budgets_count <> 0 THEN
        RAISE EXCEPTION 'Verification failed: budgets rows not deleted (count: %)', v_budgets_count;
    END IF;
    IF v_goals_count <> 0 THEN
        RAISE EXCEPTION 'Verification failed: goals rows not deleted (count: %)', v_goals_count;
    END IF;
    IF v_goal_contrib_count <> 0 THEN
        RAISE EXCEPTION 'Verification failed: goal_contributions rows not deleted (count: %)', v_goal_contrib_count;
    END IF;

    RAISE NOTICE 'SUCCESS: All tables verified. User % was completely deleted with all cascading child records, and invitation was preserved with redeemed_by=NULL.', v_target_user;
END $$;

COMMIT;
