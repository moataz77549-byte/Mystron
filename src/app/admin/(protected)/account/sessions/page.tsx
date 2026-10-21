import { requireAdmin } from "@/lib/auth";
import { AccountSessions } from "@/components/control/account-sessions";
import type { AccountSessionPage } from "@/lib/editorial/account-sessions";
export default async function SessionsPage() {
  const { db } = await requireAdmin();
  const result = await db.rpc("admin_my_sessions", { p_page: 1 });
  if (result.error)
    return (
      <p role="alert">
        تعذر تحميل الجلسات. تحقق من تحديث قاعدة البيانات واتصال الخدمة.
      </p>
    );
  return <AccountSessions initial={result.data as AccountSessionPage} />;
}
