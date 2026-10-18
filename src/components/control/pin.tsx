"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function PinProtection({ configured }: { configured: boolean }) {
  const [mode, setMode] = useState<"save" | "verify">(
    configured ? "verify" : "save",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <section className="control-card">
      <h2>حماية PIN</h2>
      <p>
        {configured ? "تم تعيين PIN." : "لم يُعيّن PIN بعد."} يحمي العمليات
        الحساسة ولا يحل محل تسجيل الدخول. تعديل الصلاحيات والأمان يتطلب كلمة
        المرور الحالية أيضاً.
      </p>
      <div className="toolbar">
        <button className="button outline" onClick={() => setMode("verify")}>
          التحقق من PIN
        </button>
        <button className="button outline" onClick={() => setMode("save")}>
          {configured ? "تغيير أو إعادة تعيين PIN" : "تعيين PIN"}
        </button>
      </div>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          setBusy(true);
          try {
            const password = String(data.get("password") || "");
            const r = await fetch("/auth/pin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: mode,
                pin: data.get("pin"),
                ...(password ? { password } : {}),
                ttl_seconds: Number(data.get("ttl") || 600),
                required: data.get("required") === "on",
              }),
            });
            const result = await r.json();
            if (!r.ok) {
              setMessage(
                result.error?.code === "PIN_LOCKED" || r.status === 429
                  ? "محاولات متكررة. انتظر قبل إعادة المحاولة."
                  : "تعذر التحقق. تحقق من PIN وكلمة المرور وإعدادات الخادم.",
              );
              return;
            }
            form.reset();
            setMessage(
              `نجح التحقق لمدة ${result.data.expires_in / 60} دقائق${result.data.strong ? "، مع إعادة مصادقة قوية." : "."}`,
            );
            router.refresh();
          } catch {
            setMessage("تعذر الاتصال.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {mode === "save" ? "PIN جديد" : "PIN الحالي"}
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6,12}"
            minLength={6}
            maxLength={12}
            autoComplete={mode === "save" ? "new-password" : "off"}
            required
          />
        </label>
        <label>
          كلمة المرور الحالية{" "}
          {mode === "verify" ? "(مطلوبة للصلاحيات والأمان)" : ""}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required={mode === "save"}
            maxLength={128}
          />
        </label>
        {mode === "save" && (
          <>
            <label>
              صلاحية التحقق بالثواني
              <input
                name="ttl"
                type="number"
                min={60}
                max={900}
                defaultValue={600}
                required
              />
            </label>
            <label>
              <input name="required" type="checkbox" defaultChecked />
              طلب PIN للعمليات الحساسة
            </label>
            <p>
              تظل عمليات الصلاحيات والأمان بحاجة إلى PIN وإعادة المصادقة دائماً.
            </p>
          </>
        )}
        <button className="button" disabled={busy}>
          {busy ? "جارٍ التحقق…" : mode === "save" ? "حفظ PIN" : "تحقق"}
        </button>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}
