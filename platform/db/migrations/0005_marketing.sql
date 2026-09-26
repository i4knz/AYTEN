-- 0005: storefront visit analytics, abandoned-cart follow-up, email campaigns.

-- One row per storefront page view. No IP address or user agent is stored:
-- `visitor` is a salted SHA-256 of (day, ip, user agent) that changes daily,
-- enough to count unique visitors per day without tracking people.
CREATE TABLE page_views (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id    uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  day         date NOT NULL,
  visitor     bytea NOT NULL,
  page_type   text NOT NULL CHECK (page_type IN ('home', 'product', 'category', 'cart', 'checkout', 'order', 'page', 'other')),
  product_id  uuid,
  source      text NOT NULL CHECK (source IN ('direct', 'google', 'instagram', 'tiktok', 'snapchat', 'whatsapp', 'x', 'facebook', 'other')),
  campaign    text CHECK (length(campaign) <= 60),
  device      text NOT NULL CHECK (device IN ('mobile', 'desktop')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX page_views_store_day_idx ON page_views (store_id, day);
CREATE INDEX page_views_product_idx ON page_views (store_id, product_id, day) WHERE product_id IS NOT NULL;

ALTER TABLE carts ADD COLUMN reminded_at timestamptz;

CREATE TABLE campaigns (
  id                uuid PRIMARY KEY,
  store_id          uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  name              text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  subject           text NOT NULL CHECK (length(subject) BETWEEN 1 AND 150),
  body              text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  button_text       text CHECK (length(button_text) <= 40),
  button_link       text CHECK (length(button_link) <= 300),
  segment           text NOT NULL DEFAULT 'subscribers' CHECK (segment IN ('subscribers', 'repeat', 'inactive', 'new')),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  recipients_count  integer NOT NULL DEFAULT 0,
  sent_count        integer NOT NULL DEFAULT 0,
  sent_at           timestamptz,
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_store_idx ON campaigns (store_id, created_at DESC);
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE customers ADD COLUMN unsubscribed_at timestamptz;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['page_views', 'campaigns'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (store_id = app_current_store_id()) WITH CHECK (store_id = app_current_store_id())',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON page_views TO ayten_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO ayten_app;
