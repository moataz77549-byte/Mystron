"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Send, Unlink } from "lucide-react";
import {
  adminErrorMessage,
  adminRequest,
  AdminRequestError,
} from "@/lib/client/request";
type TelegramLink = {
  telegram_id: number;
  linked_at: string;
  enabled: boolean;
};
type Phase =
  | "loading"
  | "unlinked"
  | "creating"
  | "ready"
  | "linked"
  | "expired"
  | "failed";
const phases: Record<Phase, string> = {
  loading: "جارٍ تحميل حالة الربط",
  unlinked: "غير مرتبط",
  creating: "جارٍ إنشاء الرابط",
  ready: "الرابط جاهز",
  linked: "تم الربط",
  expired: "انتهت صلاحية الرابط",
  failed: "فشل الربط",
};
export function TelegramSettings() {
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [configured, setConfigured] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [pending, setPending] = useState<{
    url: string;
    expires: number;
    issued: number;
  } | null>(null);
  const [clock, setClock] = useState(0);
  const [retryUntil, setRetryUntil] = useState(0);
  const [message, setMessage] = useState("");
  const [expiredSession, setExpiredSession] = useState(false);
  const inflight = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await adminRequest<{
      data: { link: TelegramLink | null; configured: boolean };
    }>("/api/v1/admin/telegram", { signal });
    return result.data;
  }, []);
  const onFailure = useCallback((error: unknown) => {
    setMessage(adminErrorMessage(error));
    setPhase("failed");
    if (error instanceof AdminRequestError) {
      if (error.status === 429) {
        setClock(Date.now());
        setRetryUntil(Date.now() + Math.max(1, error.retryAfter || 300) * 1000);
      }
      if (error.status === 401) setExpiredSession(true);
    }
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    refresh(abort.signal)
      .then((current) => {
        if (!abort.signal.aborted) {
          setLink(current.link);
          setConfigured(current.configured);
          setPhase(current.link?.enabled ? "linked" : "unlinked");
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) onFailure(error);
      });
    return () => abort.abort();
  }, [refresh, onFailure]);
  useEffect(() => {
    if (!pending && !retryUntil) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (retryUntil && retryUntil <= now) setRetryUntil(0);
      if (pending && pending.expires <= now) {
        setPending(null);
        setPhase("expired");
        setMessage("انتهت صلاحية رابط الربط. أنشئ رابطاً جديداً.");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [pending, retryUntil]);
  useEffect(() => {
    if (!pending) return;
    const issued = pending.issued;
    const abort = new AbortController();
    async function check() {
      if (document.visibilityState === "hidden") return;
      try {
        const result = await refresh(abort.signal);
        if (abort.signal.aborted) return;
        setLink(result.link);
        setConfigured(result.configured);
        const current = result.link;
        if (
          !abort.signal.aborted &&
          current?.enabled &&
          new Date(current.linked_at).getTime() >= issued - 1000
        ) {
          setPending(null);
          setPhase("linked");
          setMessage("تم ربط حساب Telegram بنجاح.");
        }
      } catch (error) {
        if (
          !abort.signal.aborted &&
          error instanceof AdminRequestError &&
          error.status === 401
        ) {
          setPending(null);
          onFailure(error);
        }
      }
    }
    const timer = setInterval(() => void check(), 5000);
    window.addEventListener("focus", check);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [pending, refresh, onFailure]);
  async function action(kind: "link" | "unlink") {
    if (inflight.current || (kind === "link" && retryUntil > Date.now()))
      return;
    if (
      kind === "unlink" &&
      !confirm("إلغاء ربط Telegram وإيقاف وصوله الإداري؟")
    )
      return;
    inflight.current = true;
    setPhase("creating");
    setMessage("");
    setPending(null);
    try {
      const result = await adminRequest<{
        data: { url?: string; expires_in?: number };
      }>("/api/v1/admin/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind }),
      });
      if (kind === "link") {
        const url = new URL(result.data.url || "");
        if (
          url.origin !== "https://t.me" ||
          !/^[a-f0-9]{64}$/.test(url.searchParams.get("start") || "")
        )
          throw new AdminRequestError("INVALID_RESPONSE");
        const issued = Date.now();
        setClock(issued);
        setPending({
          url: url.href,
          issued,
          expires: issued + (result.data.expires_in || 300) * 1000,
        });
        setPhase("ready");
        setMessage(
          "الرابط صالح لخمس دقائق ولمرة واحدة. افتح البوت لإكمال الربط ولا تشارك الرابط.",
        );
      } else {
        setLink(null);
        setPhase("unlinked");
        setMessage("أُلغي الربط وأُبطل الوصول.");
      }
    } catch (error) {
      onFailure(error);
    } finally {
      inflight.current = false;
    }
  }
  const busy = phase === "loading" || phase === "creating";
  return (
    <section className="control-card telegram-panel" aria-busy={busy}>
      <span className="eyebrow">
        <Send size={18} aria-hidden="true" /> TELEGRAM · مساحة العمل المتصلة
      </span>
      <h2>ربط حسابك الإداري</h2>
      <p>
        أنشئ رابطاً آمناً من جلستك الحالية، ثم افتحه في محادثة خاصة مع البوت.
        تُراجع صلاحياتك عند كل أمر. لا ترسل كلمة المرور أو PIN إلى البوت.
      </p>
      <p role="status" aria-live="polite">
        <span className="status-badge">{phases[phase]}</span> {message}
      </p>
      {!busy && !configured && (
        <p className="status">إعدادات البوت غير مكتملة على الخادم.</p>
      )}
      {link && (
        <p>
          الحساب المرتبط: <bdi>{link.telegram_id}</bdi> ·{" "}
          <time dateTime={link.linked_at}>
            {new Date(link.linked_at).toLocaleString("ar-YE", {
              timeZone: "Asia/Aden",
            })}
          </time>{" "}
          · {link.enabled ? "مفعّل" : "معطّل"}
        </p>
      )}
      <div className="ai-actions">
        <button
          disabled={busy || !configured || !!retryUntil || expiredSession}
          onClick={() => void action("link")}
        >
          <Link2 size={18} aria-hidden="true" />
          {phase === "creating"
            ? "جارٍ تنفيذ الطلب…"
            : link
              ? "إعادة الربط الآمن"
              : "إنشاء رابط ربط آمن"}
        </button>
        {link && (
          <button
            disabled={busy || expiredSession}
            onClick={() => void action("unlink")}
          >
            <Unlink size={18} aria-hidden="true" /> إلغاء الربط
          </button>
        )}
        <button
          disabled={busy || !!pending}
          onClick={() => {
            setPhase("loading");
            void refresh()
              .then((result) => {
                setLink(result.link);
                setConfigured(result.configured);
                setPhase(result.link?.enabled ? "linked" : "unlinked");
              })
              .catch(onFailure);
          }}
        >
          تحديث الحالة
        </button>
      </div>
      {!!retryUntil && (
        <p>
          يمكن إعادة المحاولة بعد{" "}
          {Math.max(0, Math.ceil((retryUntil - clock) / 1000))} ثانية.
        </p>
      )}
      {pending && (
        <div className="control-card">
          <a
            className="button"
            href={pending.url}
            target="_blank"
            rel="noreferrer noopener"
            referrerPolicy="no-referrer"
          >
            فتح البوت لإكمال الربط
          </a>
          <p>
            ينتهي الرابط خلال{" "}
            {Math.max(0, Math.ceil((pending.expires - clock) / 1000))} ثانية.
            يُحفظ الرمز في ذاكرة هذه الصفحة فقط.
          </p>
        </div>
      )}
      {expiredSession && (
        <Link className="button" href="/admin/login">
          تسجيل الدخول مجدداً
        </Link>
      )}
    </section>
  );
}
