"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "number"
    | "checkbox"
    | "textarea"
    | "select"
    | "color"
    | "datetime-local"
    | "multi";
  required?: boolean;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  help?: string;
};
export async function command(resource: string, body: unknown) {
  const r = await fetch("/api/v1/admin/" + resource, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.code || "SERVICE_UNAVAILABLE");
  return d.data;
}
export const errorMessage = (code: string) =>
  code.includes("PIN_SETUP_REQUIRED")
    ? "عيّن PIN في مركز الأمان أولاً."
    : code.includes("PIN_VERIFICATION_REQUIRED")
      ? "تحقق من PIN وكلمة المرور في مركز الأمان ثم أعد المحاولة."
      : code.includes("VERSION_CONFLICT")
        ? "تغيرت البيانات. حدّث الصفحة قبل الحفظ."
        : code.includes("OWNER")
          ? "هذه العملية محمية للمالك."
          : code === "FORBIDDEN"
            ? "لا تملك صلاحية هذه العملية."
            : code === "INVITATION_DELIVERY_FAILED"
              ? "حُفظت الدعوة وتعذر إرسال البريد. تحقق من إعدادات Supabase Auth."
              : "تعذر تنفيذ العملية. تحقق من المدخلات والصلاحيات وحاول مجدداً.";
export function ControlForm({
  fields,
  initial = {},
  submit,
  label = "حفظ",
  confirm,
  successMessage = "تم الحفظ.",
}: {
  fields: Field[];
  initial?: Record<string, unknown>;
  submit: (v: Record<string, unknown>) => Promise<unknown>;
  label?: string;
  confirm?: string;
  successMessage?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <form
      className="form control-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const f = new FormData(e.currentTarget);
        const value: Record<string, unknown> = {};
        fields.forEach(
          (x) =>
            (value[x.key] =
              x.type === "multi"
                ? f.getAll(x.key).map(String)
                : x.type === "checkbox"
                  ? f.has(x.key)
                  : x.type === "number"
                    ? Number(f.get(x.key))
                    : String(f.get(x.key) || "")),
        );
        setBusy(true);
        try {
          await submit(value);
          setMessage(successMessage);
          router.refresh();
        } catch (error) {
          setMessage(errorMessage(error instanceof Error ? error.message : ""));
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <label key={f.key}>
          {f.label}
          {f.type === "select" || f.type === "multi" ? (
            <select
              multiple={f.type === "multi"}
              name={f.key}
              defaultValue={
                f.type === "multi"
                  ? Array.isArray(initial[f.key])
                    ? (initial[f.key] as string[])
                    : []
                  : String(initial[f.key] ?? "")
              }
              required={f.required}
            >
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              name={f.key}
              defaultValue={String(initial[f.key] ?? "")}
              required={f.required}
              rows={4}
              maxLength={5000}
            />
          ) : (
            <input
              name={f.key}
              type={f.type || "text"}
              defaultValue={
                f.type === "checkbox" ? undefined : String(initial[f.key] ?? "")
              }
              defaultChecked={
                f.type === "checkbox" ? Boolean(initial[f.key]) : undefined
              }
              min={f.min}
              max={f.max}
              required={f.required}
              maxLength={f.type === "text" ? 500 : undefined}
            />
          )}{" "}
          {f.help && <small>{f.help}</small>}
        </label>
      ))}
      <button className="button" disabled={busy}>
        {busy ? "جارٍ الحفظ…" : label}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
export function Action({
  resource,
  body,
  label,
  danger = false,
}: {
  resource: string;
  body: unknown;
  label: string;
  danger?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <>
      <button
        className="button outline"
        disabled={busy}
        onClick={async () => {
          if (danger && !confirm("تأكيد تنفيذ هذه العملية؟")) return;
          setBusy(true);
          try {
            await command(resource, body);
            setMessage("تم التنفيذ.");
            router.refresh();
          } catch (e) {
            setMessage(errorMessage(e instanceof Error ? e.message : ""));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "جارٍ التنفيذ…" : label}
      </button>
      <span role="status">{message}</span>
    </>
  );
}
