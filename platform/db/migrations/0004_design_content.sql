-- 0004: storefront theme (draft + published), content pages, verified
-- product reviews, tracking pixels, and per-store feature switches.

ALTER TABLE store_settings
  ADD COLUMN theme_draft jsonb,
  ADD COLUMN theme_published_at timestamptz,
  ADD COLUMN tracking jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN features jsonb NOT NULL DEFAULT '{"whatsappButton":true,"reviews":true,"stockHints":true,"shareButtons":true}'::jsonb;

-- ---------------------------------------------------------------------------
-- Content pages (about, policies, …). Body is plain text with a tiny,
-- escaped markup subset rendered by the app; no HTML is stored or rendered.
-- ---------------------------------------------------------------------------

CREATE TABLE pages (
  id              uuid PRIMARY KEY,
  store_id        uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  slug            text NOT NULL CHECK (slug ~ '^[^/?#\s]{1,80}$'),
  title           text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body            text NOT NULL DEFAULT '' CHECK (length(body) <= 30000),
  published       boolean NOT NULL DEFAULT true,
  show_in_footer  boolean NOT NULL DEFAULT true,
  position        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);
CREATE TRIGGER pages_updated_at BEFORE UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Reviews: only from a delivered order that contains the product, one per
-- product per order. Published only after the merchant approves.
-- ---------------------------------------------------------------------------

CREATE TABLE reviews (
  id             uuid PRIMARY KEY,
  store_id       uuid NOT NULL,
  product_id     uuid NOT NULL,
  order_id       uuid NOT NULL,
  customer_id    uuid NOT NULL,
  author_name    text NOT NULL CHECK (length(author_name) BETWEEN 1 AND 60),
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body           text NOT NULL DEFAULT '' CHECK (length(body) <= 2000),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reply          text CHECK (length(reply) <= 2000),
  replied_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id),
  FOREIGN KEY (store_id, product_id) REFERENCES products (store_id, id) ON DELETE CASCADE,
  FOREIGN KEY (store_id, order_id) REFERENCES orders (store_id, id) ON DELETE CASCADE,
  FOREIGN KEY (store_id, customer_id) REFERENCES customers (store_id, id) ON DELETE CASCADE
);
CREATE INDEX reviews_product_idx ON reviews (store_id, product_id, status, created_at DESC);
CREATE INDEX reviews_store_status_idx ON reviews (store_id, status, created_at DESC);
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pages', 'reviews'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (store_id = app_current_store_id()) WITH CHECK (store_id = app_current_store_id())',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON pages, reviews TO ayten_app;
