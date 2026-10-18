"use client";
import { useState } from "react";
import { editorialActions } from "../../../packages/contracts/ai";
const labels = {
  title: "اقتراح عنوان",
  rewrite: "تحسين الصياغة",
  proofread: "تدقيق لغوي",
  shorten: "اختصار النص",
  expand: "توسيع فقرة",
  seo: "وصف SEO",
  excerpt: "اقتراح ملخص",
  tags: "اقتراح وسوم",
  headings: "عناوين فرعية",
  image: "فكرة صورة",
  social: "صياغة مشاركة",
};
export function EditorAiTools({ postId }: { postId: string }) {
  const [action, setAction] =
      useState<(typeof editorialActions)[number]>("title"),
    [selection, setSelection] = useState(""),
    [result, setResult] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="control-card">
      <summary>المساعد التحريري — اقتراحات للمراجعة</summary>
      <p>
        يُرسل النص المحفوظ إلى المزود عند تفعيل الخدمة والسياسة. لا يستبدل
        المساعد المحتوى ولا ينشره. راجع المصادر والحقائق، خصوصاً المحتوى الطبي.
      </p>
      <label>
        الأداة
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as typeof action)}
        >
          {editorialActions.map((key) => (
            <option key={key} value={key}>
              {labels[key]}
            </option>
          ))}
        </select>
      </label>
      <label>
        مقطع اختياري من النص المحفوظ
        <textarea
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          maxLength={8000}
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/v1/admin/ai/editorial", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                post_id: postId,
                action,
                ...(selection ? { selection } : {}),
              }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error?.code);
            setResult(payload.data.suggestion);
          } catch (cause) {
            setError(
              cause instanceof Error && cause.message === "PRIVATE_AI_DISABLED"
                ? "إرسال المحتوى الخاص إلى المزود معطل في سياسة المالك."
                : "تعذر إنشاء الاقتراح. تحقق من الخدمة والسياسة وحفظ النص والصلاحية.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "جارٍ إعداد الاقتراح…" : "إنشاء اقتراح"}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div className="ai-editor-result">
          <h3>اقتراح آلي — لم يُطبّق</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{result}</p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result);
              } catch {
                setError("تعذر النسخ. حدد النص يدوياً.");
              }
            }}
          >
            نسخ الاقتراح للتطبيق اليدوي
          </button>
        </div>
      )}
    </details>
  );
}
