"use client";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import Link from "next/link";
import { type AIAnswer, summaryTypes } from "../../../packages/contracts/ai";
type Entry = { role: "user" | "assistant"; text: string; answer?: AIAnswer };
const labels = {
  short: "مختصر",
  medium: "متوسط",
  detailed: "مفصل",
  points: "نقاط أساسية",
  ideas: "أهم الأفكار",
};
const errors: Record<string, string> = {
  AI_DISABLED: "المساعد غير مفعّل حالياً. يظل البحث العادي متاحاً.",
  AI_UNCONFIGURED: "لم تُضبط خدمة الذكاء الاصطناعي بعد.",
  AI_QUOTA_EXCEEDED: "بلغت حد الاستخدام. حاول في وقت لاحق.",
  RATE_LIMITED: "طلبات متقاربة؛ انتظر قليلاً.",
  SOURCE_CHANGED: "تغيرت صلاحية المصدر أو نسخته أثناء التوليد. أعد المحاولة.",
  AI_UNGROUNDED_OUTPUT: "تعذر التحقق من مصادر الإجابة. أعد المحاولة.",
  POST_NOT_FOUND: "هذه التدوينة غير متاحة للعامة.",
  PROVIDER_TIMEOUT: "انتهت مهلة المزود. يمكنك إعادة المحاولة.",
  CANCELLED: "أُوقف التوليد.",
};
export default function Assistant({
  postId,
  initialAction,
}: {
  postId?: string;
  initialAction?: "summary";
}) {
  const [message, setMessage] = useState(""),
    [entries, setEntries] = useState<Entry[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [state, setState] = useState<{
      enabled: boolean;
      streaming: boolean;
      reason?: string;
    }>(),
    [type, setType] = useState<(typeof summaryTypes)[number]>("short");
  const [retryAvailable, setRetryAvailable] = useState(false);
  const controller = useRef<AbortController | null>(null),
    last = useRef<{ text: string; summary: boolean; related?: boolean } | null>(
      null,
    ),
    output = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/v1/ai/status", { signal: abort.signal })
      .then((r) => r.json())
      .then((r) => setState(r.data))
      .catch(() => {
        if (!abort.signal.aborted) setError("تعذر تحميل حالة المساعد.");
      });
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    output.current?.scrollTo({
      top: output.current.scrollHeight,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [entries, busy]);
  async function ask(text: string, summary = false, related = false) {
    if (busy) return;
    if (summary && !postId) {
      setError("افتح تدوينة لاستخدام تلخيص المقال.");
      return;
    }
    last.current = { text, summary, related };
    setRetryAvailable(true);
    setError("");
    setBusy(true);
    setEntries((previous) => [...previous, { role: "user", text }]);
    setMessage("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch(
        related
          ? "/api/v1/ai/search"
          : summary
            ? "/api/v1/ai/summarize"
            : "/api/v1/ai/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            related
              ? { message: "مقالات مشابهة", related_post_id: postId }
              : summary
                ? { post_id: postId, type, stream: state?.streaming }
                : {
                    message: text,
                    ...(postId ? { post_id: postId } : {}),
                    stream: state?.streaming,
                  },
          ),
          signal: abort.signal,
        },
      );
      let payload;
      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        const raw = await response.text();
        payload = JSON.parse(
          raw
            .split("\n")
            .find((line) => line.startsWith("data:"))
            ?.slice(5) || "{}",
        );
      } else payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.code || "AI_UNAVAILABLE");
      const answer = payload.data as AIAnswer;
      setEntries((previous) => [
        ...previous,
        { role: "assistant", text: answer.answer, answer },
      ]);
    } catch (cause) {
      const code = abort.signal.aborted
        ? "CANCELLED"
        : cause instanceof Error
          ? cause.message
          : "AI_UNAVAILABLE";
      setError(
        errors[code] ||
          "تعذر إكمال الطلب. الموقع والبحث العادي يعملان بصورة مستقلة عن المساعد.",
      );
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  return (
    <section className="ai-assistant" aria-label="مساعد ما يسطرون">
      <div className="ai-assistant-heading">
        <h2>مساعد ما يسطرون</h2>
        <button
          type="button"
          onClick={() => {
            controller.current?.abort();
            setEntries([]);
            setError("");
            last.current = null;
            setRetryAvailable(false);
          }}
        >
          محادثة جديدة
        </button>
      </div>
      <p className="muted">
        إجابات آلية قد تخطئ. راجع المصادر. لا تُحفظ المحادثة في حسابك؛ تُزال
        الرسائل عند إغلاق النافذة. لا ترسل أسراراً.
      </p>
      {!state ? (
        <p role="status">جارٍ التحقق من الخدمة…</p>
      ) : !state.enabled ? (
        <p className="status">
          {errors[state.reason || "AI_DISABLED"] || "المساعد غير متاح حالياً."}{" "}
          <Link href="/search">استخدم البحث</Link>
        </p>
      ) : null}
      {postId && (
        <div className="ai-shortcuts">
          <label>
            نوع التلخيص
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {summaryTypes.map((value) => (
                <option key={value} value={value}>
                  {labels[value]}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!state?.enabled || busy}
            onClick={() => ask("تلخيص التدوينة — " + labels[type], true)}
          >
            {initialAction === "summary"
              ? "تلخيص هذه التدوينة"
              : "لخّص هذه التدوينة"}
          </button>
          <button
            disabled={!state?.enabled || busy}
            onClick={() => ask("ما أبرز الأفكار في هذه التدوينة؟")}
          >
            ما أبرز الأفكار؟
          </button>
          <button
            disabled={!state?.enabled || busy}
            onClick={() =>
              ask("اشرح الموضوع الوارد في هذه التدوينة اعتماداً على النص.")
            }
          >
            اشرح هذا الموضوع
          </button>
          <button
            disabled={!state?.enabled || busy}
            onClick={() => ask("اعرض مقالات مشابهة", false, true)}
          >
            اعرض مقالات مشابهة
          </button>
        </div>
      )}
      {postId && (
        <p className="muted">
          في التدوينات الطويلة، يقتصر الملخص على المقاطع المسترجعة؛ راجع النص
          الكامل.
        </p>
      )}
      <div
        ref={output}
        className="ai-messages"
        role="log"
        aria-live="polite"
        aria-label="المحادثة"
      >
        {entries.length === 0 && (
          <p className="status">
            اسأل عن التدوينات المنشورة، أو اطلب نقاطها الأساسية. المساعد لا ينفذ
            عمليات إدارية.
          </p>
        )}
        {entries.map((entry, i) => (
          <article key={i} className={"ai-message " + entry.role}>
            <strong>
              {entry.role === "user" ? "أنت" : "إجابة آلية من المساعد"}
            </strong>
            <Markdown
              skipHtml
              disallowedElements={["a", "img", "iframe", "script", "style"]}
              unwrapDisallowed
            >
              {entry.text}
            </Markdown>
            {entry.answer?.sources.length ? (
              <div className="ai-sources">
                <h3>المصادر المستخدمة</h3>
                {entry.answer.sources.map((source) => (
                  <blockquote key={source.id}>
                    <Link href={source.url}>
                      [{source.id}] {source.title}
                    </Link>
                    <p>{source.quote}</p>
                  </blockquote>
                ))}
              </div>
            ) : null}
            {entry.role === "assistant" && (
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(entry.text);
                  } catch {
                    setError("تعذر النسخ. يمكنك تحديد النص ونسخه.");
                  }
                }}
              >
                نسخ الإجابة
              </button>
            )}
          </article>
        ))}
        {busy && <p role="status">جارٍ البحث والتوليد والتحقق من المصادر…</p>}
      </div>
      {error && (
        <p role="alert" className="status">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (message.trim()) void ask(message.trim());
        }}
      >
        <label htmlFor="ai-question">سؤالك عن ما يسطرون</label>
        <textarea
          id="ai-question"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={3}
          disabled={!state?.enabled || busy}
        />
        <div className="ai-actions">
          <button
            className="button"
            disabled={!state?.enabled || busy || message.trim().length < 2}
          >
            إرسال
          </button>
          {busy && (
            <button type="button" onClick={() => controller.current?.abort()}>
              إيقاف التوليد
            </button>
          )}
          {error && retryAvailable && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                last.current &&
                ask(
                  last.current.text,
                  last.current.summary,
                  last.current.related,
                )
              }
            >
              إعادة المحاولة
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
