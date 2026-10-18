import { databaseConfigured } from "@/lib/env";
import { MagicLogin } from "@/components/control/magic-login";
import { privilegedDatabase } from "@/lib/supabase";
import { LoginForm } from "./login-form";
export const metadata = {
  title: "دخول الإدارة",
  robots: { index: false, follow: false },
};
export default async function Login() {
  const setup =
    databaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? await privilegedDatabase().rpc("owner_setup_state")
      : null;
  return (
    <div className="prose">
      <h1>دخول الإدارة</h1>
      <p>
        سجّل الدخول بحساب مؤكد وممنوح صلاحية مسبقاً. تطابق البريد لا يمنح دور
        المالك.
      </p>
      {(setup?.data === "pending_setup" ||
        (databaseConfigured() && (!setup || setup.error))) && (
        <p className="status">
          Pending Setup — إعداد المالك ينتظر التحقق الموثوق من الخادم. لن يمنح
          تطابق البريد صلاحية تلقائية.
        </p>
      )}
      {databaseConfigured() ? (
        <>
          <LoginForm />
          <MagicLogin />
        </>
      ) : (
        <p className="status">
          تسجيل الدخول غير مفعّل حتى ربط Supabase وإعداد الهوية.
        </p>
      )}
    </div>
  );
}
