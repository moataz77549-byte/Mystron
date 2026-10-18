"use client";
import { useEffect, useState } from "react";
export function TelegramSettings() {
  const [link, setLink] = useState<{
      telegram_id: number;
      linked_at: string;
      enabled: boolean;
    } | null>(null),
    [configured, setConfigured] = useState(false),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(true),
    [message, setMessage] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/v1/admin/telegram", { signal: abort.signal })
      .then((r) => r.json())
      .then((result) => {
        if (result.error) throw new Error();
        setLink(result.data.link);
        setConfigured(result.data.configured);
      })
      .catch(() => {
        if (!abort.signal.aborted) setMessage("تعذر تحميل حالة ربط Telegram.");
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, []);
  async function action(kind: "link" | "unlink") {
    if (
      kind === "unlink" &&
      !confirm("إلغاء ربط Telegram وإيقاف وصوله الإداري؟")
    )
      return;
    setBusy(true);
    setMessage("");
    setUrl("");
    try {
      const response = await fetch("/api/v1/admin/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.code || "FAILED");
      if (kind === "link") {
        setUrl(payload.data.url);
        setMessage(
          "الرابط صالح لخمس دقائق ولمرة واحدة. لا تشاركه؛ لا يكتمل الربط حتى التحقق داخل البوت.",
        );
      } else {
        setLink(null);
        setMessage("أُلغي الربط وأُبطل الوصول.");
      }
    } catch {
      setMessage(
        "تعذرت العملية. تحقق من إعداد البوت واتصال قاعدة البيانات والجلسة.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="control-card">
      <h2>ربط حسابك الإداري</h2>
      <p>
        الربط يعتمد جلسة Auth مؤكدة، ويُراجع الدور والنطاق عند كل أمر. عند
        انتهاء الجلسة أو إبطالها، أعد تسجيل الدخول ثم الربط. لا ترسل PIN أو كلمة
        المرور إلى البوت.
      </p>
      {busy && <p role="status">جارٍ التحميل…</p>}
      {!busy && !configured && (
        <p className="status">
          Telegram غير مُعدّ على الخادم بعد. إنشاء رابط الربط غير مفعّل.
        </p>
      )}
      {link ? (
        <p>
          الحساب المرتبط: <bdi>{link.telegram_id}</bdi> ·{" "}
          {new Date(link.linked_at).toLocaleString("ar-YE", {
            timeZone: "Asia/Aden",
          })}{" "}
          · {link.enabled ? "مفعّل" : "معطّل"}
        </p>
      ) : (
        <p>لا يوجد حساب Telegram مربوط.</p>
      )}
      <div className="ai-actions">
        <button disabled={busy || !configured} onClick={() => action("link")}>
          {link ? "إعادة الربط الآمن" : "إنشاء رابط ربط آمن"}
        </button>
        {link && (
          <button disabled={busy} onClick={() => action("unlink")}>
            إلغاء الربط
          </button>
        )}
      </div>
      {url && (
        <p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            referrerPolicy="no-referrer"
          >
            فتح البوت لإكمال الربط
          </a>
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
