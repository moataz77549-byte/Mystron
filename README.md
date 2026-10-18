# ما يسطرون | MAYSTROON

المستودع الحالي: https://github.com/moataz77549-byte/Mystron

نُقلت النسخة المجمعة للمراحل 1–5 من `Mtzallqmy/Maystroon`، commit `bc55fc2f8546c10fc845f6fb14d26af2d31528a0`. التقارير السابقة محفوظة لتوثيق التنفيذ؛ عناوينها وروابط المراجعة القديمة تاريخية.

منصة تحريرية عربية RTL — معتز العلقمي، اليمن، تعز، 2026.

الحالة الحالية: تجهيز الإصدار على الفرع `stage-5-production-readiness`. اكتملت ترحيلات Supabase وعددها 48، والذكاء الاصطناعي معطّل بطلب المالك. النشر وتفعيل البوت وهوية المالك لم تُتحقق بعد. راجع [تدقيق المرحلة الخامسة](docs/STAGE_5_BASELINE_AUDIT.md) و[التقرير الحالي](docs/STAGE_5_REPORT.md). تقارير المراحل السابقة تاريخية، ولا تثبت اكتمال النشر أو إعداد المالك.

## التشغيل

```sh
npm ci
cp .env.example .env.local
npm run dev
```

بدون متغيرات Supabase تُعرض حالة تأسيس صريحة، وتُغلق الإدارة وAPI البيانات. لا يوجد محتوى تجريبي أو مالك افتراضي.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

راجع [تقرير المرحلة](docs/STAGE_1_REPORT.md)، [النشر](docs/DEPLOYMENT.md)، [الأمان](docs/SECURITY.md)، [قاعدة البيانات](docs/DATABASE.md)، [API](docs/API.md).

المرحلة الأولى لا تشمل محرراً متقدماً أو CRUD إدارة أو دمج BotKeep أو Android. لا تُعد جاهزة للإنتاج قبل الربط الخارجي والتحقق من هوية المالك.

## Stage 2 CMS

The stage-2-advanced-cms branch adds the Arabic Tiptap studio, transactional publishing/revisions/scheduling, private media/crop/static templates, authors/categories, moderated comments, daily view aggregates and Arabic full-text search. See docs/STAGE_2_BASELINE_AUDIT.md and docs/STAGE_2_REPORT.md for verified status and external blockers. This branch does not imply owner/bootstrap or Vercel activation is complete.

Run `npm run test:cms` for desktop/mobile integration workflows. It launches a local Supabase protocol fixture (simulated Auth/Storage, actual PostgreSQL migrations/RLS/RPC); no production fixture switch or test user is added to the application. The existing `npm run test:e2e` checks empty/unconfigured public pages. `LIVE_SUPABASE_SMOKE=1 npm run test:e2e` performs opt-in read-only live database checks.

Guides: docs/CMS_ARCHITECTURE.md, EDITOR_GUIDE.md, MEDIA_MANAGEMENT.md, PUBLISHING_WORKFLOW.md, COMMENTS_MODERATION.md, ANALYTICS.md, API.md and SECURITY.md. Keep service-role/rate/PIN/Cron secrets in server environment settings only. Supabase Cron is primary; Vercel preview requires the official repository connection and verified server configuration.

## Stage 3 control center

The `stage-3-admin-security-control-center` branch extends the same app with current database RBAC, protected owner PIN proofs, one-use invitations, administrative revocation, scoped dashboards/analytics/CSV, settings/identity/home/menu/advertisement controls, security/audit/notifications, explicit integration/backup states and maintenance. See [Stage 3 report](docs/STAGE_3_REPORT.md), [owner activation](docs/OWNER_SECURITY.md), [permissions](docs/RBAC_PERMISSIONS.md) and [administration](docs/ADMIN_ARCHITECTURE.md). No default owner/PIN, production fixtures, Telegram bot or Stage 4 integration is created.

`npm run test:cms` also runs control-center desktop/mobile integration tests. Auth/Storage remain local protocol fixtures; SQL permissions/transactions run against the real migrations. Production acceptance still requires confirmed owner bootstrap, deployment server secrets, SMTP/real Auth checks and an available Vercel connection.

## Stage 4 automation

The root Next.js app shares publishing/RBAC with `services/telegram-bot` (Python/aiogram), `packages/ai` and `packages/contracts`. No replacement repository or web app was created. See [Telegram operations](docs/TELEGRAM_BOT.md), [AI architecture](docs/AI_ARCHITECTURE.md), [provider activation](docs/AI_PROVIDERS.md), [RAG](docs/RAG_PIPELINE.md) and [usage/privacy](docs/AI_PRIVACY.md).

Install `services/telegram-bot/requirements-dev.lock` in an activated Python 3.12+ virtual environment, then run `npm run lint:python` and `npm run test:python`. CI runs Node and Python checks. Browser integration additionally launches a deterministic local AI HTTP protocol fixture; it is never a production provider. Real external activation remains blocked as described in the current report.
