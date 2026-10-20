"use client";
import { useRef, useState } from "react";
import { adminRequest, adminErrorMessage } from "@/lib/client/request";
export function RecoveryForm() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <details className="control-card">
      <summary>نسيت كلمة المرور؟</summary>
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy.current) return;
          busy.current = true;
          setPending(true);
          setMessage("");
          const form = event.currentTarget;
          try {
            await adminRequest("/auth/recovery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: new FormData(form).get("recovery-email"),
              }),
            });
            setMessage(
              "إذا كان البريد مسجلاً، فستصلك رسالة استعادة. تحقق من البريد الوارد وغير المرغوب فيه.",
            );
          } catch (error) {
            setMessage(adminErrorMessage(error));
          } finally {
            busy.current = false;
            setPending(false);
          }
        }}
      >
        <label>
          بريد استعادة كلمة المرور
          <input
            name="recovery-email"
            type="email"
            required
            maxLength={254}
            dir="ltr"
            autoComplete="email"
          />
        </label>
        <button className="button" disabled={pending}>
          {pending ? "جارٍ طلب الرابط…" : "إرسال رابط الاستعادة"}
        </button>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </details>
  );
}
export function PasswordForm() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="form control-card"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy.current || done) return;
        const form = event.currentTarget;
        const fields = new FormData(form);
        if (fields.get("password") !== fields.get("confirmation")) {
          setMessage("كلمتا المرور غير متطابقتين.");
          return;
        }
        busy.current = true;
        setPending(true);
        setMessage("");
        try {
          const result = await adminRequest<{
            data: { updated: boolean; signed_out: boolean };
          }>("/auth/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              password: fields.get("password"),
              confirmation: fields.get("confirmation"),
            }),
          });
          if (!result.data.updated) throw new Error("PASSWORD_UPDATE_FAILED");
          form.reset();
          setDone(true);
          setMessage(
            result.data.signed_out
              ? "حُفظت كلمة المرور. سجّل الدخول مجدداً بالكلمة الجديدة."
              : "حُفظت كلمة المرور، لكن تعذر إنهاء جميع الجلسات. سجّل الخروج وراجع الجلسات النشطة.",
          );
        } catch (error) {
          setMessage(adminErrorMessage(error));
        } finally {
          busy.current = false;
          setPending(false);
        }
      }}
    >
      <h2>تعيين كلمة مرور جديدة</h2>
      <p>استخدم من 12 إلى 128 حرفاً. لا تشارك كلمة المرور أو رابط الاستعادة.</p>
      <label>
        كلمة المرور الجديدة
        <input
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          dir="ltr"
          disabled={done}
        />
      </label>
      <label>
        تأكيد كلمة المرور الجديدة
        <input
          name="confirmation"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          dir="ltr"
          disabled={done}
        />
      </label>
      <button className="button" disabled={pending || done}>
        {pending ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {done && (
        <a className="button" href="/admin/login">
          تسجيل الدخول مجدداً
        </a>
      )}
    </form>
  );
}
