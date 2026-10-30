import { databaseConfigured } from "@/lib/env";
import { MagicLogin } from "@/components/control/magic-login";
import { privilegedDatabase } from "@/lib/supabase";
import { LoginForm } from "./login-form";
import { RecoveryForm } from "@/components/control/password";
export const metadata = {
  title: "دخول الإدارة",
  robots: { index: false, follow: false },
};
const reasons: Record<string, string> = {
  oauth: "تعذر بدء تسجيل الدخول عبر GitHub. تحقق من إعدادات مزود GitHub في Supabase.",
  "link-invalid":
    "رابط البريد غير صالح أو انتهت صلاحيته. اطلب رابط دخول جديداً.",
  session: "انتهت الجلسة الإدارية، يرجى تسجيل الدخول مجدداً.",
  access: "الحساب لا يمتلك صلاحية إدارية مفعّلة. تواصل مع المالك.",
  service: "تعذر التحقق من صلاحيات الحساب حالياً. حاول بعد قليل.",
  email: "يلزم تأكيد البريد الإلكتروني قبل الدخول.",
};
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const reason = (await searchParams).reason;
  const setup =
    databaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? await privilegedDatabase().rpc("owner_setup_state")
      : null;
  return (
    <div className="prose">
      <h1>دخول الإدارة</h1>
      {reason && reasons[reason] && (
        <p className="status" role="alert">
          {reasons[reason]}
        </p>
      )}
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
          <div className="auth-provider-login">
            <p>أو استخدم حساب GitHub المرتبط بهويتك الإدارية:</p>
            <a className="button" href="/auth/github">
              المتابعة باستخدام GitHub
            </a>
            <p className="text-muted">
              تسجيل الدخول عبر GitHub لا يمنح أي صلاحية إدارية تلقائياً.
            </p>
          </div>
          <MagicLogin />
          <RecoveryForm />
        </>
      ) : (
        <p className="status">
          تسجيل الدخول غير مفعّل حتى ربط Supabase وإعداد الهوية.
        </p>
      )}
    </div>
  );
}
