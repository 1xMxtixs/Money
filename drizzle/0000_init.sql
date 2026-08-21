CREATE TABLE "currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"decimals" smallint NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "currencies_decimals_check" CHECK ("currencies"."decimals" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"invited_email" text,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_invited_email_len_check" CHECK (char_length("invitations"."invited_email") <= 254),
	CONSTRAINT "invitations_redeemed_check" CHECK ("redeemed_by" IS NULL OR "redeemed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_user_agent_len_check" CHECK (char_length("sessions"."user_agent") <= 255)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text NOT NULL,
	"display_name" text,
	"primary_currency_code" char(3) DEFAULT 'CLP' NOT NULL,
	"locale" text DEFAULT 'es-CL' NOT NULL,
	"timezone" text DEFAULT 'America/Santiago' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"consent_version" text NOT NULL,
	"consent_accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_id_primary_currency_code_key" UNIQUE("id","primary_currency_code"),
	CONSTRAINT "users_email_len_check" CHECK (char_length("users"."email") <= 254),
	CONSTRAINT "users_display_name_len_check" CHECK (char_length("users"."display_name") <= 80),
	CONSTRAINT "users_locale_check" CHECK ("users"."locale" IN ('es-CL','en-US')),
	CONSTRAINT "users_theme_check" CHECK ("users"."theme" IN ('light','dark','system'))
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_primary_currency_code_currencies_code_fk" FOREIGN KEY ("primary_currency_code") REFERENCES "currencies"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invitations_code" ON "invitations" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX "idx_prt_user" ON "password_reset_tokens" USING btree ("user_id") WHERE used_at IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id") WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_sessions_expiry" ON "sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree (lower("email"));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_touch_users
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION touch_updated_at();
