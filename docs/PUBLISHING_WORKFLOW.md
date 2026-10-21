# Publishing workflow

Database states: draft, review, scheduled, published, archived, unpublished. Transition commands use `review`, `scheduled`, `publish`, `archived`, `unpublished`, `draft`, `delete`, `restore`, `duplicate`. Only OWNER/ADMIN/EDITOR publish or schedule. AUTHOR may send an owned draft to review, duplicate it or delete it. Soft restoration returns draft.

Publication checks content, author, primary category and category assignment in the same locked transaction, sets the publication timestamp, writes a revision/audit/run record and enables referenced images. Slugs are unique and previous slugs redirect only when the target is visible publicly. Redirect chains are updated; reusing an old alias is rejected.

UI date/time uses Asia/Aden (UTC+3), explicitly displayed. ISO timestamptz values are stored in UTC. Schedule modification and cancellation use the edit page. Job execution checks that the scheduling user's confirmed identity still holds a publisher role.

Primary scheduler: Supabase pg_cron job `maystroon-publish-due`, every minute. It calls private.publish_due, locks due rows with SKIP LOCKED and changes scheduled -> published atomically. Repeated execution does not duplicate successful publication. Failed validation increments attempts, records a failure and retries after 15 minutes; after five failed attempts the post returns to review. Inspect /admin/scheduled and dashboard run history.

An optional GET /api/v1/cron/publish HTTP fallback requires a minimum-32-character CRON_SECRET and exact Bearer token. It calls the same engine and revalidates paths. No Vercel Cron schedule is configured, so no Vercel-plan minute precision is claimed. Database Cron is enabled on the chosen Supabase project; generic environments without pg_cron skip activation and require another scheduler.

Daily retention job `maystroon-retention` removes raw view identifiers older than 30 days, comment reports older than 30 days and optional comment email contacts older than 90 days. Public aggregate view counts remain. Publication pages/sitemap are dynamic, so direct database jobs do not leave a static page displaying a draft.

## تحديث المتابعة — 2026-10-21

دمج الوسوم يمر بمحرك cms_save_post القائم داخل transaction مع تحقق الصلاحية والنطاق والعدد المتوقع، دون مسار نشر موازٍ. قرار APPROVED المستقل لم يُنفذ بعد ولا تُعرض دورة النشر على أنها مستوفية لهذا البند.
