-- 0003: customers, carts, checkout, orders, payments, shipments, shipping
-- methods, coupons, in-app notifications, payment gateway webhooks.

-- ---------------------------------------------------------------------------
-- Store settings: payment methods and checkout
-- ---------------------------------------------------------------------------

ALTER TABLE store_settings
  ADD COLUMN payments jsonb NOT NULL DEFAULT '{"cod":{"enabled":true,"fee":0},"bankTransfer":{"enabled":false},"online":{"enabled":false}}'::jsonb,
  ADD COLUMN checkout jsonb NOT NULL DEFAULT '{"requireEmail":false}'::jsonb;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id                    uuid PRIMARY KEY,
  store_id              uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  phone                 text NOT NULL CHECK (phone ~ '^\+[0-9]{8,15}$'),
  email                 citext,
  name                  text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  accepts_marketing     boolean NOT NULL DEFAULT false,
  marketing_consent_at  timestamptz,
  note                  text CHECK (length(note) <= 2000),
  orders_count          integer NOT NULL DEFAULT 0,
  cancelled_count       integer NOT NULL DEFAULT 0,
  total_spent           bigint NOT NULL DEFAULT 0,
  first_order_at        timestamptz,
  last_order_at         timestamptz,
  anonymized_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, phone)
);
CREATE INDEX customers_store_last_order_idx ON customers (store_id, last_order_at DESC);
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Shipping methods
-- ---------------------------------------------------------------------------

CREATE TABLE shipping_methods (
  id              uuid PRIMARY KEY,
  store_id        uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  type            text NOT NULL CHECK (type IN ('flat', 'free_over', 'pickup')),
  price           bigint NOT NULL DEFAULT 0 CHECK (price >= 0),
  -- free_over: free when the (post-discount) subtotal reaches this amount; price applies below it.
  free_threshold  bigint CHECK (free_threshold > 0),
  -- Empty array = available in every city.
  cities          text[] NOT NULL DEFAULT '{}',
  estimated_days  text CHECK (length(estimated_days) <= 40),
  pickup_address  text CHECK (length(pickup_address) <= 300),
  active          boolean NOT NULL DEFAULT true,
  position        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  CHECK (type <> 'free_over' OR free_threshold IS NOT NULL)
);
CREATE TRIGGER shipping_methods_updated_at BEFORE UPDATE ON shipping_methods FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------

CREATE TABLE coupons (
  id                        uuid PRIMARY KEY,
  store_id                  uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  code                      citext NOT NULL CHECK (code ~ '^[A-Za-z0-9_\-]{3,30}$'),
  type                      text NOT NULL CHECK (type IN ('percent', 'fixed', 'free_shipping')),
  -- percent: 1..100; fixed: amount in minor units; free_shipping: 0.
  value                     bigint NOT NULL DEFAULT 0 CHECK (value >= 0),
  max_discount              bigint CHECK (max_discount > 0),
  min_subtotal              bigint CHECK (min_subtotal > 0),
  starts_at                 timestamptz,
  ends_at                   timestamptz,
  usage_limit               integer CHECK (usage_limit > 0),
  usage_limit_per_customer  integer CHECK (usage_limit_per_customer > 0),
  used_count                integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  product_ids               uuid[] NOT NULL DEFAULT '{}',
  category_ids              uuid[] NOT NULL DEFAULT '{}',
  active                    boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, code),
  CHECK (type <> 'percent' OR value BETWEEN 1 AND 100),
  CHECK (type <> 'fixed' OR value > 0),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (usage_limit IS NULL OR used_count <= usage_limit)
);
CREATE TRIGGER coupons_updated_at BEFORE UPDATE ON coupons FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Carts. The shopper holds a random token in a cookie scoped to the store's
-- host; only its hash is stored. Prices are never stored on the cart.
-- ---------------------------------------------------------------------------

CREATE TABLE carts (
  id                  uuid PRIMARY KEY,
  store_id            uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  token_hash          bytea NOT NULL UNIQUE,
  coupon_code         citext,
  -- Contact captured when the shopper reaches checkout (for abandoned-cart follow-up).
  contact_name        text,
  contact_phone       text,
  contact_email       citext,
  checkout_started_at timestamptz,
  converted_order_id  uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id)
);
CREATE INDEX carts_store_abandoned_idx ON carts (store_id, checkout_started_at DESC) WHERE converted_order_id IS NULL;
CREATE TRIGGER carts_updated_at BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cart_items (
  id          uuid PRIMARY KEY,
  store_id    uuid NOT NULL,
  cart_id     uuid NOT NULL,
  variant_id  uuid NOT NULL,
  quantity    integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id),
  FOREIGN KEY (store_id, cart_id) REFERENCES carts (store_id, id) ON DELETE CASCADE,
  FOREIGN KEY (store_id, variant_id) REFERENCES product_variants (store_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

CREATE TABLE order_counters (
  store_id     uuid PRIMARY KEY REFERENCES stores (id) ON DELETE CASCADE,
  last_number  bigint NOT NULL DEFAULT 1000
);

-- Payment, fulfillment and overall status are separate fields on purpose.
-- Money columns are snapshots in minor units and never recomputed.
CREATE TABLE orders (
  id                  uuid PRIMARY KEY,
  store_id            uuid NOT NULL REFERENCES stores (id) ON DELETE RESTRICT,
  number              bigint NOT NULL,
  access_key          text NOT NULL CHECK (length(access_key) BETWEEN 16 AND 64),
  customer_id         uuid NOT NULL,
  source              text NOT NULL DEFAULT 'storefront' CHECK (source IN ('storefront', 'manual')),
  currency            char(3) NOT NULL,
  subtotal            bigint NOT NULL CHECK (subtotal >= 0),
  discount_total      bigint NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  shipping_total      bigint NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  payment_fee         bigint NOT NULL DEFAULT 0 CHECK (payment_fee >= 0),
  tax_total           bigint NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total               bigint NOT NULL CHECK (total >= 0),
  refunded_total      bigint NOT NULL DEFAULT 0 CHECK (refunded_total >= 0 AND refunded_total <= total),
  prices_include_tax  boolean NOT NULL,
  tax_rate_bps        integer NOT NULL DEFAULT 0,
  payment_method      text NOT NULL CHECK (payment_method IN ('cod', 'bank_transfer', 'online')),
  payment_status      text NOT NULL CHECK (payment_status IN ('pending', 'awaiting_transfer', 'paid', 'partially_refunded', 'refunded', 'failed', 'voided')),
  fulfillment_status  text NOT NULL DEFAULT 'unfulfilled'
                      CHECK (fulfillment_status IN ('unfulfilled', 'processing', 'ready', 'shipped', 'delivered', 'returned', 'cancelled')),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  customer_snapshot   jsonb NOT NULL,
  shipping_address    jsonb NOT NULL,
  shipping_method     jsonb NOT NULL,
  coupon_code         citext,
  customer_note       text CHECK (length(customer_note) <= 1000),
  cancel_reason       text CHECK (length(cancel_reason) <= 500),
  cancelled_at        timestamptz,
  completed_at        timestamptz,
  idempotency_key     text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 64),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, number),
  UNIQUE (store_id, idempotency_key),
  FOREIGN KEY (store_id, customer_id) REFERENCES customers (store_id, id) ON DELETE RESTRICT
);
CREATE INDEX orders_store_created_idx ON orders (store_id, created_at DESC);
CREATE INDEX orders_store_status_idx ON orders (store_id, status, fulfillment_status);
CREATE INDEX orders_customer_idx ON orders (store_id, customer_id, created_at DESC);
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  id               uuid PRIMARY KEY,
  store_id         uuid NOT NULL,
  order_id         uuid NOT NULL,
  product_id       uuid,
  variant_id       uuid,
  product_name     text NOT NULL,
  variant_title    text NOT NULL DEFAULT '',
  sku              text,
  image_key        text,
  unit_price       bigint NOT NULL CHECK (unit_price >= 0),
  quantity         integer NOT NULL CHECK (quantity > 0),
  discount_amount  bigint NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount       bigint NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total       bigint NOT NULL CHECK (line_total >= 0),
  -- Tracks this line's effect on inventory so transitions are idempotent.
  stock_state      text NOT NULL DEFAULT 'none' CHECK (stock_state IN ('none', 'reserved', 'committed', 'released')),
  FOREIGN KEY (store_id, order_id) REFERENCES orders (store_id, id) ON DELETE CASCADE,
  FOREIGN KEY (store_id, variant_id) REFERENCES product_variants (store_id, id) ON DELETE SET NULL (variant_id)
);
CREATE INDEX order_items_order_idx ON order_items (store_id, order_id);
CREATE INDEX order_items_product_idx ON order_items (store_id, product_id);

CREATE TABLE order_events (
  id          uuid PRIMARY KEY,
  store_id    uuid NOT NULL,
  order_id    uuid NOT NULL,
  type        text NOT NULL,
  message     text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_type  text NOT NULL CHECK (actor_type IN ('customer', 'user', 'system', 'provider')),
  actor_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES orders (store_id, id) ON DELETE CASCADE
);
CREATE INDEX order_events_order_idx ON order_events (store_id, order_id, created_at);
CREATE TRIGGER order_events_append_only BEFORE UPDATE ON order_events FOR EACH ROW EXECUTE FUNCTION reject_modification();

CREATE TABLE order_notes (
  id              uuid PRIMARY KEY,
  store_id        uuid NOT NULL,
  order_id        uuid NOT NULL,
  author_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  body            text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES orders (store_id, id) ON DELETE CASCADE
);

CREATE TABLE payments (
  id                   uuid PRIMARY KEY,
  store_id             uuid NOT NULL,
  order_id             uuid NOT NULL,
  provider             text NOT NULL,
  provider_payment_id  text,
  amount               bigint NOT NULL CHECK (amount >= 0),
  currency             char(3) NOT NULL,
  status               text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'voided')),
  failure_reason       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  FOREIGN KEY (store_id, order_id) REFERENCES orders (store_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX payments_provider_ref ON payments (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX payments_order_idx ON payments (store_id, order_id);
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE refunds (
  id          uuid PRIMARY KEY,
  store_id    uuid NOT NULL,
  order_id    uuid NOT NULL,
  amount      bigint NOT NULL CHECK (amount > 0),
  reason      text CHECK (length(reason) <= 500),
  restock     boolean NOT NULL DEFAULT false,
  method      text NOT NULL CHECK (method IN ('manual', 'provider')),
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES orders (store_id, id) ON DELETE CASCADE
);
CREATE TRIGGER refunds_append_only BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION reject_modification();

CREATE TABLE shipments (
  id               uuid PRIMARY KEY,
  store_id         uuid NOT NULL,
  order_id         uuid NOT NULL,
  carrier          text CHECK (length(carrier) <= 60),
  tracking_number  text CHECK (length(tracking_number) <= 80),
  tracking_url     text CHECK (tracking_url ~ '^https://'),
  shipped_at       timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES orders (store_id, id) ON DELETE CASCADE
);
CREATE INDEX shipments_order_idx ON shipments (store_id, order_id);

CREATE TABLE coupon_redemptions (
  id           uuid PRIMARY KEY,
  store_id     uuid NOT NULL,
  coupon_id    uuid NOT NULL,
  order_id     uuid NOT NULL,
  customer_id  uuid NOT NULL,
  amount       bigint NOT NULL CHECK (amount >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, order_id),
  FOREIGN KEY (store_id, coupon_id) REFERENCES coupons (store_id, id) ON DELETE CASCADE,
  FOREIGN KEY (store_id, order_id) REFERENCES orders (store_id, id) ON DELETE CASCADE
);
CREATE INDEX coupon_redemptions_customer_idx ON coupon_redemptions (store_id, coupon_id, customer_id);

-- ---------------------------------------------------------------------------
-- In-app notifications for merchants
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id          uuid PRIMARY KEY,
  store_id    uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  link        text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_store_idx ON notifications (store_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Payment provider webhooks (platform level; the store is resolved from the payment)
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_events (
  id            uuid PRIMARY KEY,
  provider      text NOT NULL,
  event_id      text NOT NULL,
  type          text NOT NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  error         text,
  UNIQUE (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers', 'shipping_methods', 'coupons', 'carts', 'cart_items', 'order_counters', 'orders',
    'order_items', 'order_events', 'order_notes', 'payments', 'refunds', 'shipments', 'coupon_redemptions',
    'notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (store_id = app_current_store_id()) WITH CHECK (store_id = app_current_store_id())',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  customers, shipping_methods, coupons, carts, cart_items, order_counters, orders, order_items,
  order_notes, payments, shipments, coupon_redemptions, notifications
  TO ayten_app;
GRANT SELECT, INSERT ON order_events, refunds TO ayten_app;
GRANT SELECT, INSERT, UPDATE ON webhook_events TO ayten_app;
