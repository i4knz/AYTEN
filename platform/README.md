# Ayten Commerce — تطبيق المنصة

تطبيق Next.js واحد يضم الموقع التعريفي ولوحة التاجر وواجهات المتاجر. الخطة والقرارات في [`../docs`](../docs).

## المتطلبات

- Node.js 22+ و pnpm 10 (`corepack enable`)
- PostgreSQL 16 (محلياً أو عبر `docker compose up -d`)

## التشغيل محلياً

```bash
cd platform
pnpm install

# مرة واحدة: إنشاء الدورين (ayten_owner / ayten_app) وقاعدتي ayten و ayten_test
psql -U postgres -f scripts/db-bootstrap.sql          # أو: psql postgres://postgres:postgres@localhost:5432/postgres -f ...

cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

- لوحة التاجر والتسجيل: http://localhost:3000
- واجهة أي متجر: `http://<slug>.localhost:3000` (المتصفحات الحديثة توجّه `*.localhost` إلى جهازك تلقائياً)
- الرسائل البريدية في التطوير تُكتب في `.data/outbox.jsonl` (أو استخدم Mailpit مع `EMAIL_TRANSPORT=smtp`).

## الأوامر

| الأمر | الوظيفة |
|------|---------|
| `pnpm dev` | خادم التطوير |
| `pnpm lint` / `pnpm typecheck` | الفحص الثابت |
| `pnpm test` | اختبارات الوحدات والتكامل على قاعدة `ayten_test` حقيقية (تُعاد تهيئتها تلقائياً) |
| `pnpm test:e2e` | اختبارات Playwright على الجوال وسطح المكتب (تبني التطبيق وتشغله على المنفذ 3100). إن كان Chromium مثبتاً مسبقاً: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome pnpm test:e2e` |
| `pnpm db:migrate` | تطبيق الترحيلات الجديدة |
| `pnpm db:reset` | حذف المخطط وإعادة إنشائه (مرفوض في الإنتاج) |

## البنية

```
db/migrations/        ترحيلات SQL (المصدر الوحيد للقيود والفهارس وسياسات RLS)
scripts/              إعداد قاعدة البيانات والترحيل
src/proxy.ts          توجيه النطاقات الفرعية للمتاجر + إعادة التوجيه لتسجيل الدخول
src/server/           منطق الأعمال (لا يعتمد على Next.js — يُختبر مباشرة)
  db/                 عميل Drizzle، المخطط، withTenant()
  auth/               التسجيل، الدخول، الجلسات، الاستعادة
  stores/             المتاجر، الروابط، الصلاحيات
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
