-- 0001_foundation: identity, sessions, stores, membership, audit log.
-- Runs as the owner role (ayten_owner). The runtime role (ayten_app) gets
-- DML only and is subject to row-level security on every tenant table.

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Tenant context is set per transaction by the application:
--   SELECT set_config('app.store_id', '<uuid>', true), set_config('app.user_id', '<uuid>', true)
-- An unset or empty value yields NULL, which matches no rows.
CREATE FUNCTION app_current_store_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.store_id', true), '')::uuid $$;

CREATE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE FUNCTION reject_modification() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;

-- ---------------------------------------------------------------------------
-- Platform-level tables (no store_id, no tenant RLS)
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id                 uuid PRIMARY KEY,
  email              citext NOT NULL UNIQUE CHECK (length(email) BETWEEN 3 AND 254),
  email_verified_at  timestamptz,
  password_hash      text NOT NULL,
  name               text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  phone              text,
  locale             text NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar', 'en')),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only the SHA-256 of the session token is stored; the raw token lives in the cookie.
CREATE TABLE user_sessions (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    bytea NOT NULL UNIQUE,
  ip            inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX user_sessions_user_idx ON user_sessions (user_id, expires_at);

CREATE TABLE verification_tokens (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('email_verify', 'password_reset')),
  token_hash  bytea NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_tokens_user_idx ON verification_tokens (user_id, purpose);

-- Fixed-window counters for login / signup / reset throttling.
CREATE TABLE rate_limit_buckets (
  key           text PRIMARY KEY,
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL
);

-- ---------------------------------------------------------------------------
-- Stores (tenant registry). Read by slug/host for storefront routing, so it is
-- not tenant-filtered; every write goes through the store service.
-- ---------------------------------------------------------------------------

CREATE TABLE stores (
  id                uuid PRIMARY KEY,
  owner_user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  name              text NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  slug              citext NOT NULL UNIQUE
                    CHECK (slug ~ '^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$'),
  business_type     text NOT NULL CHECK (business_type IN ('fashion', 'beauty', 'electronics', 'digital', 'food', 'general')),
  country_code      char(2) NOT NULL DEFAULT 'SA',
  currency          char(3) NOT NULL DEFAULT 'SAR',
  default_locale    text NOT NULL DEFAULT 'ar' CHECK (default_locale IN ('ar', 'en')),
  timezone          text NOT NULL DEFAULT 'Asia/Riyadh',
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'suspended')),
  suspended_reason  text,
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stores_owner_idx ON stores (owner_user_id);
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Tenant tables (RLS enforced)
-- ---------------------------------------------------------------------------

CREATE TABLE store_settings (
  store_id        uuid PRIMARY KEY REFERENCES stores (id) ON DELETE CASCADE,
  contact_email   citext,
  contact_phone   text,
  whatsapp        text,
  logo_url        text,
  brand_color     text NOT NULL DEFAULT '#0f766e' CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  theme_key       text NOT NULL DEFAULT 'essential',
  theme_config    jsonb NOT NULL DEFAULT '{}'::jsonb,
  tax_enabled     boolean NOT NULL DEFAULT false,
  tax_rate_bps    integer NOT NULL DEFAULT 1500 CHECK (tax_rate_bps BETWEEN 0 AND 10000),
  prices_include_tax boolean NOT NULL DEFAULT true,
  vat_number      text,
  commercial_registration text,
  policies        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER store_settings_updated_at BEFORE UPDATE ON store_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE store_members (
  id          uuid PRIMARY KEY,
  store_id    uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner', 'manager', 'orders', 'products', 'marketing', 'support', 'viewer')),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  invited_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, user_id)
);
CREATE UNIQUE INDEX store_members_one_owner ON store_members (store_id) WHERE role = 'owner';
CREATE INDEX store_members_user_idx ON store_members (user_id);
CREATE TRIGGER store_members_updated_at BEFORE UPDATE ON store_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only. store_id is NULL for platform-level events (sign-in, password reset).
CREATE TABLE audit_logs (
  id           uuid PRIMARY KEY,
  store_id     uuid,
  actor_type   text NOT NULL CHECK (actor_type IN ('user', 'platform_admin', 'system')),
  actor_id     uuid,
  action       text NOT NULL,
  target_type  text,
  target_id    uuid,
  reason       text,
  ip           inet,
  user_agent   text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_store_idx ON audit_logs (store_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_modification();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON store_settings
  USING (store_id = app_current_store_id())
  WITH CHECK (store_id = app_current_store_id());

-- A member row is visible inside its store, and to the user it belongs to
-- (so a user can list their own stores). Writes require the store context.
ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_members FORCE ROW LEVEL SECURITY;
CREATE POLICY member_select ON store_members FOR SELECT
  USING (store_id = app_current_store_id() OR user_id = app_current_user_id());
CREATE POLICY member_insert ON store_members FOR INSERT
  WITH CHECK (store_id = app_current_store_id());
CREATE POLICY member_update ON store_members FOR UPDATE
  USING (store_id = app_current_store_id())
  WITH CHECK (store_id = app_current_store_id());
CREATE POLICY member_delete ON store_members FOR DELETE
  USING (store_id = app_current_store_id());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON audit_logs FOR SELECT
  USING (store_id = app_current_store_id());
CREATE POLICY audit_insert ON audit_logs FOR INSERT
  WITH CHECK (store_id IS NULL OR store_id = app_current_store_id());

-- ---------------------------------------------------------------------------
-- Grants for the runtime role
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO ayten_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, user_sessions, verification_tokens, rate_limit_buckets,
  stores, store_settings, store_members
  TO ayten_app;
GRANT SELECT, INSERT ON audit_logs TO ayten_app;
