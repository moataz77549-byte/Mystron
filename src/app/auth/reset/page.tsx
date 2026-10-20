import Link from "next/link";
import { sessionDatabase } from "@/lib/supabase";
import { PasswordForm } from "@/components/control/password";
export const metadata = {
  title: "استعادة كلمة المرور",
  robots: { index: false, follow: false },
};
export default async function ResetPassword() {
  const { data, error } = await (await sessionDatabase()).auth.getUser();
  return (
    <section className="prose">
      <h1>استعادة كلمة المرور</h1>
      {error || !data.user?.email_confirmed_at ? (
        <>
          <p role="alert">
            انتهت جلسة الاستعادة أو الرابط غير صالح. اطلب رابطاً جديداً من صفحة
            الدخول.
          </p>
          <Link href="/admin/login">صفحة الدخول</Link>
        </>
      ) : (
        <PasswordForm />
      )}
    </section>
  );
}
