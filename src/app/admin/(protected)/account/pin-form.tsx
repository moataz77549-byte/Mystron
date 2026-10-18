"use client";
import { useState } from "react";
export function PinForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const data = new FormData(e.currentTarget);
          const r = await fetch("/auth/pin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pin: data.get("pin"),
              password: data.get("password"),
            }),
          });
          setMessage(
            r.ok
              ? "تم حفظ PIN بأمان."
              : "تعذّر الحفظ. تحقق من كلمة المرور وPIN أو حاول لاحقاً.",
          );
        } catch {
          setMessage("تعذّر الاتصال.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        كلمة المرور الحالية
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>
      <label>
        PIN جديد (6 إلى 12 رقماً)
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{6,12}"
          minLength={6}
          maxLength={12}
          required
          autoComplete="new-password"
        />
      </label>
      <button className="button" disabled={busy}>
        {busy ? "جاري الحفظ…" : "حفظ PIN"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
