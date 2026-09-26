-- 0006: the platform layer — plans and subscriptions, platform invoices,
-- merchant wallet and payouts, referrals, help center and support tickets,
-- announcements, platform settings, and platform administrators.
--
-- Platform administration uses a separate database role (ayten_admin, created
-- by scripts/db-bootstrap.sql) that may read across stores. It is only used by
-- code under src/server/admin, behind an explicit admin check, and every
-- sensitive admin action is written to audit_logs.

-- ---------------------------------------------------------------------------
-- Platform administrators
-- ---------------------------------------------------------------------------

CREATE TABLE platform_admins (
  user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner', 'admin', 'support', 'finance', 'content')),
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_settings (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z_]{2,40}$'),
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Placeholder commercial terms. The platform owner edits them in the admin panel.
INSERT INTO platform_settings (key, value) VALUES
  ('fees', '{"onlinePaymentFeeBps": 250, "payoutHoldDays": 7, "minPayout": 10000}'),
  -- vatBps: VAT charged on subscription invoices (basis points). Set to 0 until
  -- the platform is VAT-registered [يحتاج تحقق من المحاسب].
  ('billing', '{"bankName": "", "accountName": "", "iban": "", "vatBps": 0, "vatNumber": "", "graceDays": 7}'),
  ('referrals', '{"rewardDays": 30}'),
  ('support', '{"email": "", "whatsapp": ""}');

-- ---------------------------------------------------------------------------
-- Plans and subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE plans (
  id             uuid PRIMARY KEY,
  key            text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]{2,30}$'),
  name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  description    text NOT NULL DEFAULT '' CHECK (length(description) <= 300),
  price_monthly  bigint NOT NULL CHECK (price_monthly >= 0),
  price_yearly   bigint NOT NULL CHECK (price_yearly >= 0),
  currency       char(3) NOT NULL DEFAULT 'SAR',
  trial_days     integer NOT NULL DEFAULT 14 CHECK (trial_days BETWEEN 0 AND 365),
  -- null limit = unlimited
  limits         jsonb NOT NULL DEFAULT '{}'::jsonb,
  features       jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public      boolean NOT NULL DEFAULT true,
  is_default     boolean NOT NULL DEFAULT false,
  position       integer NOT NULL DEFAULT 0,
  archived_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX plans_one_default ON plans (is_default) WHERE is_default;
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Placeholder plans (names, prices and limits are to be decided by the platform owner).
INSERT INTO plans (id, key, name, description, price_monthly, price_yearly, trial_days, limits, features, is_default, position) VALUES
  ('0192f000-0000-7000-8000-000000000001', 'founders', 'باقة المؤسسين', 'للتجار الأوائل خلال الفترة التجريبية للمنصة.', 0, 0, 90,
   '{"products": 100, "staff": 3, "ordersPerMonth": null}', '{"campaigns": true, "advancedReports": true, "removeBranding": false}', true, 0),
  ('0192f000-0000-7000-8000-000000000002', 'basic', 'الأساسية', 'لبدء البيع بثقة.', 9900, 99000, 14,
   '{"products": 500, "staff": 5, "ordersPerMonth": null}', '{"campaigns": false, "advancedReports": true, "removeBranding": false}', false, 1),
  ('0192f000-0000-7000-8000-000000000003', 'pro', 'الاحترافية', 'للمتاجر النامية وفرق العمل.', 24900, 249000, 14,
   '{"products": null, "staff": 15, "ordersPerMonth": null}', '{"campaigns": true, "advancedReports": true, "removeBranding": true}', false, 2);

CREATE TABLE subscriptions (
  id                    uuid PRIMARY KEY,
  store_id              uuid NOT NULL UNIQUE REFERENCES stores (id) ON DELETE CASCADE,
  plan_id               uuid NOT NULL REFERENCES plans (id),
  status                text NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'expired', 'cancelled')),
  billing_interval      text NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly')),
  trial_ends_at         timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every existing store starts on the default plan's trial.
INSERT INTO subscriptions (id, store_id, plan_id, status, trial_ends_at)
SELECT gen_random_uuid(), s.id, p.id, 'trialing', now() + make_interval(days => p.trial_days)
FROM stores s CROSS JOIN plans p WHERE p.is_default;

CREATE SEQUENCE platform_invoice_number START 10001;

-- Invoices from the platform to merchants. Issued invoices are never edited;
-- corrections are made by voiding and issuing a new one.
CREATE TABLE platform_invoices (
  id               uuid PRIMARY KEY,
  store_id         uuid NOT NULL REFERENCES stores (id) ON DELETE RESTRICT,
  number           bigint NOT NULL UNIQUE DEFAULT nextval('platform_invoice_number'),
  plan_id          uuid NOT NULL REFERENCES plans (id),
  plan_name        text NOT NULL,
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
  subtotal         bigint NOT NULL CHECK (subtotal >= 0),
  tax              bigint NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total            bigint NOT NULL CHECK (total >= 0),
  currency         char(3) NOT NULL DEFAULT 'SAR',
  status           text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'paid', 'void')),
  payment_method   text CHECK (payment_method IN ('bank_transfer', 'gateway', 'waived')),
  payment_reference text CHECK (length(payment_reference) <= 100),
  paid_at          timestamptz,
  voided_reason    text,
  issued_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_invoices_store_idx ON platform_invoices (store_id, created_at DESC);
-- At most one unpaid invoice per store at a time.
CREATE UNIQUE INDEX platform_invoices_one_open ON platform_invoices (store_id) WHERE status = 'issued';

-- ---------------------------------------------------------------------------
-- Merchant wallet (money the platform collected on the merchant's behalf
-- through online payments) and payout requests.
-- ---------------------------------------------------------------------------

CREATE TABLE wallet_transactions (
  id            uuid PRIMARY KEY,
  store_id      uuid NOT NULL REFERENCES stores (id) ON DELETE RESTRICT,
  type          text NOT NULL CHECK (type IN ('sale', 'fee', 'refund', 'payout', 'payout_reversal', 'adjustment')),
  amount        bigint NOT NULL CHECK (amount <> 0),
  description   text NOT NULL,
  order_id      uuid,
  payout_id     uuid,
  available_at  timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_transactions_store_idx ON wallet_transactions (store_id, created_at DESC);
CREATE UNIQUE INDEX wallet_sale_once ON wallet_transactions (order_id, type) WHERE type IN ('sale', 'fee');
CREATE TRIGGER wallet_transactions_append_only BEFORE UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION reject_modification();

CREATE TABLE payout_requests (
  id            uuid PRIMARY KEY,
  store_id      uuid NOT NULL REFERENCES stores (id) ON DELETE RESTRICT,
  amount        bigint NOT NULL CHECK (amount > 0),
  bank_name     text NOT NULL,
  account_name  text NOT NULL,
  iban          text NOT NULL CHECK (iban ~ '^SA[0-9]{22}$'),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected', 'cancelled')),
  requested_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  admin_note    text CHECK (length(admin_note) <= 500),
  transfer_reference text CHECK (length(transfer_reference) <= 100),
  processed_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payout_requests_status_idx ON payout_requests (status, created_at);
CREATE UNIQUE INDEX payout_one_open ON payout_requests (store_id) WHERE status IN ('pending', 'approved');

-- ---------------------------------------------------------------------------
-- Referrals
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN referral_code text UNIQUE CHECK (referral_code ~ '^[A-Z0-9]{6,12}$'),
  ADD COLUMN referred_by uuid REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE referral_rewards (
  id               uuid PRIMARY KEY,
  referrer_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  store_id         uuid REFERENCES stores (id) ON DELETE SET NULL,
  reward           text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Help center, support tickets, announcements
-- ---------------------------------------------------------------------------

CREATE TABLE help_articles (
  id          uuid PRIMARY KEY,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[^/?#\s]{1,80}$'),
  category    text NOT NULL CHECK (category IN ('start', 'products', 'orders', 'payments', 'shipping', 'marketing', 'account')),
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 150),
  body        text NOT NULL CHECK (length(body) <= 30000),
  published   boolean NOT NULL DEFAULT true,
  position    integer NOT NULL DEFAULT 0,
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER help_articles_updated_at BEFORE UPDATE ON help_articles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE support_tickets (
  id          uuid PRIMARY KEY,
  store_id    uuid NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  number      bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  opened_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  subject     text NOT NULL CHECK (length(subject) BETWEEN 3 AND 150),
  category    text NOT NULL CHECK (category IN ('store_down', 'checkout', 'payments', 'orders', 'billing', 'technical', 'question')),
  -- 1 = most urgent. Derived from the category's impact, adjustable by support.
  priority    smallint NOT NULL CHECK (priority BETWEEN 1 AND 4),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_support', 'waiting_merchant', 'resolved', 'closed')),
  assignee_id uuid REFERENCES users (id) ON DELETE SET NULL,
  rating      smallint CHECK (rating BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_queue_idx ON support_tickets (status, priority, created_at);
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ticket_messages (
  id           uuid PRIMARY KEY,
  store_id     uuid NOT NULL,
  ticket_id    uuid NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
  author_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  author_type  text NOT NULL CHECK (author_type IN ('merchant', 'support')),
  body         text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  -- Internal support notes are never shown to the merchant.
  internal     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_messages_ticket_idx ON ticket_messages (ticket_id, created_at);

CREATE TABLE announcements (
  id          uuid PRIMARY KEY,
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body        text NOT NULL DEFAULT '' CHECK (length(body) <= 1000),
  level       text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning')),
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Starter help articles describing how the platform actually works today.
INSERT INTO help_articles (id, slug, category, title, body, position) VALUES
  ('0192f000-0000-7000-8000-000000000101', 'start-first-store', 'start', 'ابدأ متجرك في خمس خطوات',
   E'1) أكّد بريدك الإلكتروني من الرسالة التي وصلتك عند التسجيل.\n2) أضف منتجاً واحداً على الأقل من «المنتجات» واجعل حالته «منشور».\n3) أضف طريقة شحن واحدة على الأقل من «إعدادات المتجر ← الشحن».\n4) أضف رقم واتساب أو جوال للتواصل من «إعدادات المتجر».\n5) اضغط «نشر المتجر» من الصفحة الرئيسية للوحة التحكم.\n\nقائمة الإعداد في الصفحة الرئيسية تُحسب من بيانات متجرك الفعلية، وتختفي عندما تكتمل كل الخطوات.', 0),
  ('0192f000-0000-7000-8000-000000000102', 'products-variants', 'products', 'المنتجات والخيارات (المقاسات والألوان)',
   E'يمكن أن يكون للمنتج حتى ثلاثة خيارات (مثل المقاس واللون)، وتُنشأ التركيبات تلقائياً. لكل تركيبة سعر ومخزون ورمز SKU مستقل.\n\nالمخزون يُحجز لحظة إتمام الطلب داخل عملية واحدة، فلا يمكن بيع نفس القطعة مرتين حتى لو اشترى عميلان في نفس اللحظة.', 0),
  ('0192f000-0000-7000-8000-000000000103', 'orders-lifecycle', 'orders', 'مراحل الطلب: من «جديد» إلى «تم التوصيل»',
   E'لكل طلب ثلاث حالات منفصلة: حالة الطلب، وحالة الدفع، وحالة التجهيز.\n\n• «قيد التجهيز» ثم «جاهز للشحن» ثم «تم الشحن» مع رقم التتبع، ثم «تم التوصيل».\n• عند الإلغاء يعود المخزون المحجوز تلقائياً.\n• كل تغيير يُسجَّل في سجل الطلب مع اسم من قام به.', 0),
  ('0192f000-0000-7000-8000-000000000104', 'payments-methods', 'payments', 'طرق الدفع المتاحة',
   E'المتاح حالياً: الدفع عند الاستلام، والتحويل البنكي (تؤكد استلامه يدوياً من صفحة الطلب).\n\nالدفع الإلكتروني بالبطاقات وApple Pay يتطلب تعاقداً مع بوابة دفع مرخصة؛ ستظهر في «إعدادات الدفع» عند تفعيلها لمتجرك من إدارة المنصة.', 0),
  ('0192f000-0000-7000-8000-000000000105', 'wallet-payouts', 'payments', 'الرصيد وطلبات السحب',
   E'عند الدفع الإلكتروني يُضاف مبلغ الطلب إلى رصيدك مخصوماً منه رسوم الدفع، ويصبح قابلاً للسحب بعد فترة التعليق الموضحة في صفحة «العمليات».\n\nلطلب السحب أدخل آيبان سعودي صحيح باسم صاحب المتجر. يُراجع الطلب ويُحوَّل ويُضاف رقم مرجع التحويل. يمكنك إلغاء الطلب ما دام «بانتظار المراجعة».', 0),
  ('0192f000-0000-7000-8000-000000000106', 'shipping-setup', 'shipping', 'إعداد الشحن والتوصيل',
   E'أنشئ طرق شحن بسعر ثابت، مع إمكانية حصرها على مدن محددة، وشحن مجاني فوق مبلغ معين، ورسوم إضافية للدفع عند الاستلام.\n\nالربط المباشر مع شركات الشحن (إصدار البوليصة آلياً) غير متاح بعد؛ أضف رقم التتبع يدوياً عند شحن الطلب.', 0),
  ('0192f000-0000-7000-8000-000000000107', 'marketing-tools', 'marketing', 'أدوات التسويق',
   E'• الكوبونات: نسبة أو مبلغ ثابت، بحد أدنى للطلب، وعدد استخدامات، وتاريخ انتهاء.\n• السلات المتروكة: ذكّر العميل برسالة بريد تحتوي رابط إكمال الطلب.\n• الحملات البريدية: لمشتركي متجرك فقط، مع رابط إلغاء اشتراك في كل رسالة.\n• تحليلات الزيارات: الزوار ومصادرهم ونسبة التحويل دون تخزين عناوين IP.', 0),
  ('0192f000-0000-7000-8000-000000000108', 'subscription-billing', 'account', 'الاشتراك والفواتير',
   E'يبدأ كل متجر بفترة تجريبية على الباقة الافتراضية. لترقية الباقة اختر الباقة والمدة من صفحة «الاشتراك» فتصدر فاتورة برقم مرجعي، ثم حوّل المبلغ إلى الحساب الموضح واكتب رقم الفاتورة في وصف التحويل. يُفعَّل الاشتراك عند تأكيد استلام التحويل.\n\nإذا انتهى الاشتراك يبقى متجرك ظاهراً للعملاء، لكنه يتوقف عن استقبال طلبات جديدة حتى التجديد.', 0);

-- ---------------------------------------------------------------------------
-- RLS for store-owned rows
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscriptions', 'platform_invoices', 'wallet_transactions', 'payout_requests', 'support_tickets', 'ticket_messages'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (store_id = app_current_store_id()) WITH CHECK (store_id = app_current_store_id())',
      t);
  END LOOP;
END $$;

-- Merchants read their subscription and invoices; the app changes them only
-- through service code (trial creation, cancellation flag, invoice requests).
GRANT SELECT, INSERT, UPDATE ON subscriptions TO ayten_app;
GRANT SELECT, INSERT ON platform_invoices, wallet_transactions TO ayten_app;
GRANT USAGE ON SEQUENCE platform_invoice_number TO ayten_app;
GRANT SELECT, INSERT, UPDATE ON payout_requests, support_tickets TO ayten_app;
GRANT SELECT, INSERT ON ticket_messages TO ayten_app;
GRANT SELECT ON plans, help_articles, announcements, platform_settings TO ayten_app;
GRANT SELECT ON platform_admins TO ayten_app;
GRANT SELECT, INSERT ON referral_rewards TO ayten_app;

-- Platform administration role (exists when created by scripts/db-bootstrap.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ayten_admin') THEN
    GRANT USAGE ON SCHEMA public TO ayten_admin;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO ayten_admin;
    GRANT UPDATE ON stores, subscriptions, platform_invoices, payout_requests, support_tickets, plans, help_articles,
      platform_settings, users, user_sessions TO ayten_admin;
    GRANT INSERT ON subscriptions, platform_invoices, wallet_transactions, ticket_messages, plans, help_articles,
      announcements, platform_settings, platform_admins, audit_logs, referral_rewards TO ayten_admin;
    GRANT INSERT ON notifications TO ayten_admin;
    GRANT DELETE ON platform_admins, announcements TO ayten_admin;
    GRANT USAGE ON SEQUENCE platform_invoice_number TO ayten_admin;
  END IF;
END $$;
