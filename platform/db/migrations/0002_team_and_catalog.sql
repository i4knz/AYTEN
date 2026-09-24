-- 0002: staff invitations, catalog (categories, products, options, variants,
-- images) and inventory with an append-only movement ledger.
--
-- Every table carries store_id with RLS. Child tables reference their parent
-- through composite (store_id, id) foreign keys, so a row can never point at a
-- parent that belongs to another store, even through a bug in the app.

-- ---------------------------------------------------------------------------
-- Staff invitations
-- ---------------------------------------------------------------------------

CREATE TABLE store_invitations (
  id           uuid PRIMARY KEY,
  store_id     uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  email        citext NOT NULL,
  role         text NOT NULL CHECK (role IN ('manager', 'orders', 'products', 'marketing', 'support', 'viewer')),
  token_hash   bytea NOT NULL UNIQUE,
  invited_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  accepted_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- At most one open invitation per email per store.
CREATE UNIQUE INDEX store_invitations_open_email
  ON store_invitations (store_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id           uuid PRIMARY KEY,
  store_id     uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  parent_id    uuid,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  slug         text NOT NULL CHECK (slug ~ '^[^/?#\s]{1,100}$'),
  description  text CHECK (length(description) <= 2000),
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, slug),
  CHECK (parent_id IS DISTINCT FROM id),
  FOREIGN KEY (store_id, parent_id) REFERENCES categories (store_id, id) ON DELETE SET NULL (parent_id)
);
CREATE INDEX categories_store_idx ON categories (store_id, parent_id, position);
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Product slugs may contain Arabic letters (good for SEO in Arabic search);
-- they must not contain URL delimiters or whitespace.
CREATE TABLE products (
  id                 uuid PRIMARY KEY,
  store_id           uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  type               text NOT NULL DEFAULT 'physical' CHECK (type IN ('physical', 'digital', 'service')),
  name               text NOT NULL CHECK (length(name) BETWEEN 1 AND 150),
  slug               text NOT NULL CHECK (slug ~ '^[^/?#\s]{1,160}$'),
  description        text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  requires_shipping  boolean NOT NULL DEFAULT true,
  taxable            boolean NOT NULL DEFAULT true,
  seo_title          text CHECK (length(seo_title) <= 70),
  seo_description    text CHECK (length(seo_description) <= 320),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, slug)
);
CREATE INDEX products_store_status_idx ON products (store_id, status, created_at DESC);
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Up to three options per product (e.g. اللون، المقاس). Enforced in the app.
CREATE TABLE product_options (
  id          uuid PRIMARY KEY,
  store_id    uuid NOT NULL,
  product_id  uuid NOT NULL,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  position    smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  "values"    text[] NOT NULL CHECK (cardinality("values") BETWEEN 1 AND 50),
  UNIQUE (product_id, position),
  FOREIGN KEY (store_id, product_id) REFERENCES products (store_id, id) ON DELETE CASCADE
);

-- Every product has at least one variant; a product without options has a
-- single default variant with all option columns NULL. Money is in the
-- smallest currency unit (halalas for SAR).
CREATE TABLE product_variants (
  id                uuid PRIMARY KEY,
  store_id          uuid NOT NULL,
  product_id        uuid NOT NULL,
  option1           text,
  option2           text,
  option3           text,
  sku               text CHECK (length(sku) BETWEEN 1 AND 64),
  barcode           text CHECK (length(barcode) <= 64),
  price             bigint NOT NULL CHECK (price >= 0),
  compare_at_price  bigint CHECK (compare_at_price > price),
  cost              bigint CHECK (cost >= 0),
  weight_grams      integer CHECK (weight_grams >= 0),
  position          integer NOT NULL DEFAULT 0,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  FOREIGN KEY (store_id, product_id) REFERENCES products (store_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX product_variants_sku ON product_variants (store_id, sku)
  WHERE sku IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX product_variants_options ON product_variants (product_id, option1, option2, option3)
  NULLS NOT DISTINCT WHERE archived_at IS NULL;
CREATE INDEX product_variants_product_idx ON product_variants (store_id, product_id, position);
CREATE TRIGGER product_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_images (
  id           uuid PRIMARY KEY,
  store_id     uuid NOT NULL,
  product_id   uuid NOT NULL,
  storage_key  text NOT NULL,
  width        integer NOT NULL CHECK (width > 0),
  height       integer NOT NULL CHECK (height > 0),
  alt          text NOT NULL DEFAULT '' CHECK (length(alt) <= 200),
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, product_id) REFERENCES products (store_id, id) ON DELETE CASCADE
);
CREATE INDEX product_images_product_idx ON product_images (store_id, product_id, position);

CREATE TABLE product_categories (
  store_id     uuid NOT NULL,
  product_id   uuid NOT NULL,
  category_id  uuid NOT NULL,
  PRIMARY KEY (product_id, category_id),
  FOREIGN KEY (store_id, product_id) REFERENCES products (store_id, id) ON DELETE CASCADE,
  FOREIGN KEY (store_id, category_id) REFERENCES categories (store_id, id) ON DELETE CASCADE
);
CREATE INDEX product_categories_category_idx ON product_categories (store_id, category_id);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

-- available = on_hand - reserved. Reservations are taken atomically at order
-- creation with a conditional UPDATE, so the last unit cannot be sold twice.
CREATE TABLE inventory_levels (
  store_id             uuid NOT NULL,
  variant_id           uuid PRIMARY KEY,
  track_inventory      boolean NOT NULL DEFAULT true,
  on_hand              integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved             integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
  low_stock_threshold  integer CHECK (low_stock_threshold >= 0),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, variant_id) REFERENCES product_variants (store_id, id) ON DELETE CASCADE
);
CREATE INDEX inventory_levels_store_idx ON inventory_levels (store_id);
CREATE TRIGGER inventory_levels_updated_at BEFORE UPDATE ON inventory_levels FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE inventory_movements (
  id              uuid PRIMARY KEY,
  store_id        uuid NOT NULL,
  variant_id      uuid NOT NULL,
  delta           integer NOT NULL CHECK (delta <> 0),
  on_hand_after   integer NOT NULL CHECK (on_hand_after >= 0),
  reason          text NOT NULL CHECK (reason IN ('initial', 'manual_adjust', 'order_committed', 'order_released', 'return_restock', 'import')),
  order_id        uuid,
  actor_user_id   uuid,
  note            text CHECK (length(note) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, variant_id) REFERENCES product_variants (store_id, id) ON DELETE CASCADE
);
CREATE INDEX inventory_movements_variant_idx ON inventory_movements (store_id, variant_id, created_at DESC);
CREATE TRIGGER inventory_movements_append_only BEFORE UPDATE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION reject_modification();

-- ---------------------------------------------------------------------------
-- Row-level security: one policy shape for every tenant table
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'store_invitations', 'categories', 'products', 'product_options', 'product_variants',
    'product_images', 'product_categories', 'inventory_levels', 'inventory_movements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (store_id = app_current_store_id()) WITH CHECK (store_id = app_current_store_id())',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  store_invitations, categories, products, product_options, product_variants,
  product_images, product_categories, inventory_levels
  TO ayten_app;
-- Movements are a ledger: rows are only added. They disappear only through
-- ON DELETE CASCADE when the variant itself is deleted.
GRANT SELECT, INSERT ON inventory_movements TO ayten_app;
