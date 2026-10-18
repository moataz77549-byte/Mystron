"use client";
import Link from "next/link";
import { DataTable } from "./table";
import { useCallback, useEffect, useState } from "react";
import { type AISettings, aiSettings } from "../../../packages/contracts/ai";
type Row = Record<string, unknown>;
const sections = [
  ["providers", "المزودون"],
  ["models", "النماذج"],
  ["usage", "الاستخدام"],
  ["settings", "الإعدادات"],
  ["knowledge", "فهرس المعرفة"],
];
const numeric: [keyof AISettings, string][] = [
  ["max_output_tokens", "أقصى Tokens للإجابة"],
  ["daily_requests", "حد الطلبات اليومي"],
  ["monthly_requests", "حد الطلبات الشهري"],
  ["daily_tokens", "ميزانية Tokens اليومية التقديرية"],
  ["session_requests", "حد الجلسة اليومي"],
  ["visitor_requests", "حد الزائر اليومي"],
  ["admin_requests", "حد المشرف اليومي"],
];
export function AiControl({ section }: { section: string }) {
  const [data, setData] = useState<Row | null>(null),
    [settings, setSettings] = useState<AISettings>(),
    [version, setVersion] = useState(1),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const endpoint = section === "knowledge" ? "index-status" : section;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(
        `/api/v1/admin/ai/${endpoint}?page=${page}`,
        { signal },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.code);
      return payload.data;
    },
    [endpoint, page],
  );
  const show = useCallback(
    (value: Row) => {
      setError("");
      setData(value);
      if (section === "settings") {
        const { singleton: _s, version, updated_at: _u, ...values } = value;
        void _s;
        void _u;
        setSettings(aiSettings.parse(values));
        setVersion(Number(version));
      }
    },
    [section],
  );
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal)
      .then(show)
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "تعذر تحميل البيانات. تحقق من إعداد الخدمة واتصالها وصلاحياتك.",
          );
      });
    return () => abort.abort();
  }, [load, show]);
  async function command(action: string, body: unknown) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/v1/admin/ai/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.code);
      setMessage(
        action === "settings"
          ? "حُفظت الإعدادات."
          : action === "reindex"
            ? `أضيفت ${payload.data.queued} مهمة فهرسة.`
            : "نجح اختبار التوليد الفعلي: " + payload.data.sample,
      );
      if (action !== "test") show(await load());
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(
        code.startsWith("PIN_")
          ? "يلزم إعداد PIN أو إعادة التحقق الحساس أسفل الصفحة."
          : code === "VERSION_CONFLICT"
            ? "تغيرت الإعدادات. حدّث الصفحة قبل الحفظ."
            : "فشلت العملية. تحقق من الصلاحية والخدمة والأسرار والحدود.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <nav className="control-tabs" aria-label="إدارة الذكاء الاصطناعي">
        {sections.map(([key, label]) => (
          <Link
            aria-current={key === section ? "page" : undefined}
            key={key}
            href={"/admin/ai/" + key}
          >
            {label}
          </Link>
        ))}
      </nav>
      <p>
        الأسرار تُدار في الاستضافة فقط. نجاح اختبار محلي لا يعني اتصالاً فعلياً
        بالمزود. تعطيل AI لا يعطل البحث العادي.
      </p>
      {error && (
        <p role="alert" className="status">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">جارٍ تحميل البيانات الفعلية…</p>}
      {message && <p role="status">{message}</p>}
      {section === "settings" && settings && (
        <form
          className="control-form control-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm("اعتماد سياسة الذكاء الاصطناعي وحدود الاستخدام؟"))
              void command("settings", { settings, version });
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) =>
                setSettings({ ...settings, enabled: e.target.checked })
              }
            />{" "}
            تفعيل المساعد وفق بوابة البيئة AI_ENABLED
          </label>
          <label>
            المزود
            <select
              value={settings.provider}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  provider: e.target.value as AISettings["provider"],
                })
              }
            >
              <option value="compatible">OpenAI-compatible API</option>
              <option value="botkeep">API مستضاف على BotKeep</option>
            </select>
          </label>
          <label>
            معرف نموذج التوليد
            <input
              value={settings.model}
              maxLength={200}
              onChange={(e) =>
                setSettings({ ...settings, model: e.target.value })
              }
            />
          </label>
          <label>
            معرف نموذج Embeddings
            <input
              value={settings.embedding_model}
              maxLength={200}
              onChange={(e) =>
                setSettings({ ...settings, embedding_model: e.target.value })
              }
            />
          </label>
          <label>
            لغة الإجابات
            <select
              value={settings.language}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  language: e.target.value as "ar" | "en",
                })
              }
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.streaming}
              onChange={(e) =>
                setSettings({ ...settings, streaming: e.target.checked })
              }
            />{" "}
            طلب Streaming إذا أكدت البيئة دعمه — تُحجز الإجابة حتى التحقق من
            المصادر
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.allow_private_editorial}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  allow_private_editorial: e.target.checked,
                })
              }
            />{" "}
            السماح للمحرر المصرح بإرسال نصه الخاص إلى المزود الخارجي بعد طلب
            صريح
          </label>
          {numeric.map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                value={Number(settings[key])}
                onChange={(e) =>
                  setSettings({ ...settings, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <button disabled={busy}>حفظ السياسة</button>
        </form>
      )}
      {section === "providers" && data && (
        <section className="control-card">
          <h2>حالة الإعداد</h2>
          <p>المزود المختار: {String(data.selected)}</p>
          <p>
            {(data.status as { enabled: boolean })?.enabled
              ? "مهيأ — اختبر الاتصال للتحقق الفعلي"
              : "غير مفعّل أو غير مهيأ"}
          </p>
          <p>
            BotKeep هنا محول لواجهة يحددها المالك، وليس عنوان استدلال مفترضاً.
          </p>
          <button
            disabled={busy || !(data.status as { enabled: boolean })?.enabled}
            onClick={() => command("test", {})}
          >
            اختبار النموذج فعلياً
          </button>
        </section>
      )}
      {section === "models" && data && (
        <section className="control-card">
          <h2>نماذج أعادها المزود</h2>
          {(data.models as string[])?.length ? (
            <ul>
              {(data.models as string[]).map((id) => (
                <li key={id}>
                  <bdi>{id}</bdi>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              لا توجد نماذج معروضة. قد لا يدعم المزود قائمة النماذج؛ أدخل معرفاً
              موثقاً في الإعدادات.
            </p>
          )}
          <Link href="/admin/ai/settings">اختيار النموذج في الإعدادات</Link>
        </section>
      )}
      {section === "usage" && data && (
        <>
          <p>
            الرموز reported من المزود، وestimated للحجز المحافظ. التكلفة «غير
            متاحة» حين لا يوجد تسعير موثق. لا تُخزن نصوص المحادثات.
          </p>
          <DataTable
            rows={(data.rows as Row[]) || []}
            columns={[
              ["model_id", "النموذج"],
              ["request_type", "النوع"],
              ["input_tokens", "رموز الدخول"],
              ["output_tokens", "رموز الخروج"],
              ["token_accuracy", "دقة القياس"],
              ["status", "الحالة"],
              ["latency_ms", "الزمن ms"],
              ["estimated_cost", "التكلفة"],
            ]}
          />
          {!(data.rows as Row[])?.length && (
            <p className="status">لا توجد طلبات مسجلة.</p>
          )}
          <p>إجمالي السجلات: {String(data.total)}</p>
        </>
      )}
      {section === "knowledge" && data && (
        <section className="control-card">
          <h2>فهرس المقالات العامة</h2>
          <p>المقاطع: {String(data.chunks)}</p>
          <p>نماذج الأبعاد الفعلية: {JSON.stringify(data.profiles)}</p>
          <button
            disabled={busy}
            onClick={() => {
              if (confirm("إضافة المقالات العامة إلى طابور الفهرسة؟"))
                void command("reindex", {});
            }}
          >
            طلب إعادة الفهرسة
          </button>
          <p>
            الفهرسة تنفذ في العامل. عند إلغاء النشر يمنع المصدر فوراً من
            الاسترجاع، حتى قبل معالجة المهمة.
          </p>
          <ul>
            {(data.jobs as Row[])?.map((job) => (
              <li key={String(job.id)}>
                {String(job.kind)} · {String(job.status)} · المحاولات{" "}
                {String(job.attempts)} {String(job.last_error || "")}
              </li>
            ))}
          </ul>
        </section>
      )}
      {["usage", "knowledge"].includes(section) && (
        <nav className="pagination" aria-label="ترقيم بيانات AI">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            السابق
          </button>
          <span>الصفحة {page}</span>
          <button
            disabled={
              section === "usage"
                ? page * 25 >= Number(data?.total || 0)
                : ((data?.jobs as Row[]) || []).length < 25
            }
            onClick={() => setPage(page + 1)}
          >
            التالي
          </button>
        </nav>
      )}
    </>
  );
}
