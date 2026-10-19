"use client";
import { useState } from "react";
import { adminErrorMessage, adminRequest } from "@/lib/client/request";
export function MagicLogin() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>الدخول برابط آمن عبر البريد</summary>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const form = new FormData(e.currentTarget);
          try {
            await adminRequest("/auth/magic", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: form.get("email") }),
            });
            setMessage(
              "إذا كان الحساب مسجلاً فسيصلك رابط الدخول. لا يمنح الرابط صلاحية إدارية جديدة.",
            );
          } catch (error) {
            setMessage(adminErrorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          البريد لاستلام رابط الدخول
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <button className="button outline" disabled={busy}>
          إرسال رابط دخول
        </button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
