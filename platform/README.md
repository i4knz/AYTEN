# Ayten Commerce — تطبيق المنصة

تطبيق Next.js واحد يضم الموقع التعريفي ولوحة التاجر وواجهات المتاجر. الخطة والقرارات في [`../docs`](../docs).

## المتطلبات

- Node.js 22+ و pnpm 10 (`corepack enable`)
- PostgreSQL 16 (محلياً أو عبر `docker compose up -d`)

## التشغيل محلياً

```bash
cd platform
pnpm install

# مرة واحدة: إنشاء الأدوار (ayten_owner / ayten_app / ayten_admin) وقاعدتي ayten و ayten_test
psql -U postgres -f scripts/db-bootstrap.sql          # أو: psql postgres://postgres:postgres@localhost:5432/postgres -f ...

cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

- لوحة التاجر والتسجيل: http://localhost:3000
- واجهة أي متجر: `http://<slug>.localhost:3000` (المتصفحات الحديثة توجّه `*.localhost` إلى جهازك تلقائياً)
- الرسائل البريدية في التطوير تُكتب في `.data/outbox.jsonl` (أو استخدم Mailpit مع `EMAIL_TRANSPORT=smtp`).
- الصور المرفوعة تُحفظ في `.data/uploads` وتُقدَّم من `/media/…`.

### لوحة مالك المنصة (`/admin`)

سجّل حساباً عادياً من `/register` ثم امنحه صلاحية مالك المنصة من الطرفية (هذه الطريقة الوحيدة لإنشاء أول مالك):

```bash
pnpm admin:grant you@example.com owner     # الأدوار: owner, admin, finance, support, content
```

ثم افتح http://localhost:3000/admin. تتصل اللوحة بقاعدة البيانات عبر `ADMIN_DATABASE_URL` (دور `ayten_admin`)، وتُسجَّل كل عملياتها في سجل التدقيق. غير المشرفين يرون 404.

### المهام الدورية

`pnpm jobs` كل 5–15 دقيقة: يلغي الطلبات الإلكترونية غير المدفوعة ويحرر مخزونها، ويحدّث حالات الاشتراكات (انتهاء التجربة / فترة السماح) ويُشعر التاجر.

## الأوامر

| الأمر | الوظيفة |
|------|---------|
| `pnpm dev` | خادم التطوير |
| `pnpm lint` / `pnpm typecheck` | الفحص الثابت |
| `pnpm test` | اختبارات الوحدات والتكامل على قاعدة `ayten_test` حقيقية (تُعاد تهيئتها تلقائياً) |
| `pnpm test:e2e` | اختبارات Playwright على الجوال وسطح المكتب (تبني التطبيق وتشغله على المنفذ 3100). إن كان Chromium مثبتاً مسبقاً: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome pnpm test:e2e` |
| `pnpm db:migrate` | تطبيق الترحيلات الجديدة |
| `pnpm db:reset` | حذف المخطط وإعادة إنشائه (مرفوض في الإنتاج) |
| `pnpm admin:grant <email> [role]` | منح صلاحية إدارة المنصة لحساب مسجل |
| `pnpm jobs` | المهام الدورية (الطلبات المعلقة، حالات الاشتراكات) |

## البنية

```
db/migrations/        ترحيلات SQL (المصدر الوحيد للقيود والفهارس وسياسات RLS)
scripts/              إعداد قاعدة البيانات والترحيل
src/proxy.ts          توجيه النطاقات الفرعية للمتاجر + إعادة التوجيه لتسجيل الدخول
src/server/           منطق الأعمال (لا يعتمد على Next.js — يُختبر مباشرة)
  db/                 عميل Drizzle، المخطط، withTenant()
  auth/               التسجيل، الدخول، الجلسات، الاستعادة
  stores/             المتاجر، الروابط، الصلاحيات، النشر
  team/               دعوات الموظفين والأدوار
  catalog/            المنتجات والنسخ والتصنيفات والمخزون والصور وواجهة المتجر العامة
  commerce/           السلة، إتمام الطلب، الطلبات، المدفوعات، العملاء، التقارير
  design/ marketing/  تصميم المتجر والصفحات والتقييمات، الكوبونات والحملات والزيارات
  billing/            الباقات والاشتراكات وحدود الباقة وفواتير المنصة (rules.ts قواعد نقية)
  wallet/             رصيد التاجر من المدفوعات الإلكترونية وطلبات السحب (دفتر قيود لا يُعدَّل)
  referrals/ support/ الإحالات، مركز المساعدة وتذاكر الدعم والإعلانات
  admin/              لوحة مالك المنصة — الملف الوحيد الذي يستخدم دور ayten_admin
  platform/           إعدادات المنصة (الرسوم، بيانات الفوترة، الدعم)
  storage/            تخزين الملفات (محلي حالياً)
  email/              مزود البريد + القوالب
  web.ts              ربط منطق الأعمال بـ Next.js (الكوكيز، بيانات الطلب، حالة النماذج)
src/app/              الصفحات وServer Actions
tests/unit|integration|e2e
```

## قواعد عزل المتاجر (إلزامية لكل كود جديد)

1. أي جدول يخص متجراً يحتوي `store_id` ويُفعَّل عليه `ENABLE` و`FORCE ROW LEVEL SECURITY` مع سياسة `store_id = app_current_store_id()`، ويُمنح لدور `ayten_app` صراحةً.
2. الوصول لبيانات متجر يتم فقط داخل `withTenant({ storeId, userId }, tx => …)`.
3. كل عملية تبدأ بـ `requireStoreAccess(userId, storeId, permission)`.
4. أضف اختبار عزل في `tests/integration/tenancy.test.ts` لكل جدول جديد.
5. التطبيق يتصل بـ `ayten_app` فقط؛ `ayten_owner` للترحيلات فقط.
6. دور `ayten_admin` (يتجاوز RLS للقراءة، بصلاحيات كتابة محدودة) يُستخدم **فقط** داخل `src/server/admin/` وبعد `requireAdmin()`، وكل كتابة تمر عبر `adminAudit()` في نفس المعاملة.
