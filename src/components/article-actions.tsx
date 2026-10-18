"use client";
import { useEffect, useState } from "react";
type Comment = {
  id: string;
  parent_id: string | null;
  depth: number;
  guest_name: string;
  body: string;
  created_at: string;
};
export function ArticleActions({
  id,
  title,
  url,
  commentsEnabled,
  commentsOpen = true,
  repliesEnabled = true,
  maxDepth = 3,
  preModeration = true,
  sharing = {},
}: {
  id: string;
  title: string;
  url: string;
  commentsEnabled: boolean;
  commentsOpen?: boolean;
  repliesEnabled?: boolean;
  maxDepth?: number;
  preModeration?: boolean;
  sharing?: Record<string, boolean>;
}) {
  const [message, setMessage] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [parent, setParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const share = url;
  useEffect(() => {
    void fetch(`/api/v1/posts/${id}/views`, { method: "POST" }).catch(() => {});
  }, [id]);
  useEffect(() => {
    if (!commentsEnabled) return;
    let active = true;
    void fetch(`/api/v1/posts/${id}/comments?page=${page}`)
      .then(async (r) => {
        const j = await r.json();
        if (!active) return;
        if (r.ok) {
          setComments(j.data);
          setTotal(j.total);
        } else setMessage("التعليقات غير متاحة الآن.");
      })
      .catch(() => {
        if (active) setMessage("تعذر تحميل التعليقات.");
      });
    return () => {
      active = false;
    };
  }, [id, commentsEnabled, page]);
  const enc = encodeURIComponent(share);
  const txt = encodeURIComponent(title);
  return (
    <>
      <nav className="share-buttons" aria-label="مشاركة التدوينة">
        {[
          ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc}`],
          ["X", `https://twitter.com/intent/tweet?url=${enc}&text=${txt}`],
          ["Telegram", `https://t.me/share/url?url=${enc}&text=${txt}`],
          ["WhatsApp", `https://wa.me/?text=${txt}%20${enc}`],
        ]
          .filter(([name]) => sharing[name.toLowerCase()] !== false)
          .map(([name, url]) => (
            <a key={name} href={url} target="_blank" rel="noopener noreferrer">
              {name}
            </a>
          ))}
        {sharing.copy !== false && (
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(share);
                setMessage("تم نسخ الرابط");
              } catch {
                setMessage("تعذر النسخ؛ انسخ الرابط من شريط العنوان.");
              }
            }}
          >
            نسخ الرابط
          </button>
        )}
        {sharing.webshare !== false && (
          <button
            onClick={async () => {
              try {
                if (navigator.share)
                  await navigator.share({ title, url: share });
                else setMessage("المشاركة المباشرة غير مدعومة في هذا الجهاز.");
              } catch {
                setMessage("لم تتم المشاركة.");
              }
            }}
          >
            مشاركة الجهاز
          </button>
        )}
        <a href="#article-top">العودة للأعلى</a>
      </nav>
      <p role="status">{message}</p>
      {commentsEnabled && (
        <section id="comments">
          <h2>التعليقات</h2>
          <p>
            تُراجع جميع التعليقات قبل ظهورها. أسماء الزوار غير موثقة، ولا تمنحهم
            صفة فريق التحرير.
          </p>
          {comments.map((c) => (
            <article
              className="comment"
              key={c.id}
              style={{ marginInlineStart: `${Math.min(c.depth, 3) * 1.5}rem` }}
            >
              <h3>
                {c.guest_name} <small>زائر</small>
              </h3>
              <time>{new Date(c.created_at).toLocaleDateString("ar-YE")}</time>
              <p>{c.body}</p>
              {c.parent_id && (
                <small>رد على تعليق {c.parent_id.slice(0, 8)}</small>
              )}
              {commentsOpen && repliesEnabled && c.depth < maxDepth && (
                <button onClick={() => setParent(c.id)}>رد</button>
              )}
              <button
                onClick={async () => {
                  const reason = prompt("سبب الإبلاغ");
                  if (!reason) return;
                  const r = await fetch(`/api/v1/comments/${c.id}/reports`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason }),
                  });
                  setMessage(
                    r.ok ? "تم إرسال البلاغ للمراجعة" : "تعذر إرسال البلاغ",
                  );
                }}
              >
                إبلاغ
              </button>
            </article>
          ))}
          {!comments.length && <p>لا توجد تعليقات معتمدة.</p>}
          <nav>
            {page > 1 && (
              <button onClick={() => setPage((p) => p - 1)}>السابق</button>
            )}
            {total > page * 30 && (
              <button onClick={() => setPage((p) => p + 1)}>التالي</button>
            )}
          </nav>
          {commentsOpen ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const f = e.currentTarget;
                const values = new FormData(f);
                try {
                  const r = await fetch(`/api/v1/posts/${id}/comments`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: values.get("name"),
                      email: values.get("email"),
                      body: values.get("body"),
                      website: values.get("website"),
                      parent_id: parent,
                    }),
                  });
                  setMessage(
                    r.ok
                      ? "أُرسل تعليقك للمراجعة."
                      : "تعذر إرسال التعليق؛ تحقق من المدخلات أو حاول لاحقاً.",
                  );
                  if (r.ok) {
                    f.reset();
                    setParent(null);
                  }
                } catch {
                  setMessage("تعذر الاتصال");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h3>{parent ? "كتابة رد" : "أضف تعليقاً"}</h3>
              {parent && (
                <button type="button" onClick={() => setParent(null)}>
                  إلغاء الرد
                </button>
              )}
              <label>
                الاسم
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
              <label>
                البريد (اختياري، لا يظهر للزوار)
                <input
                  type="email"
                  name="email"
                  maxLength={254}
                  autoComplete="email"
                />
              </label>
              <label className="honeypot" aria-hidden="true">
                الموقع
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
              <label>
                التعليق دون روابط
                <textarea name="body" required maxLength={5000} rows={5} />
              </label>
              <button disabled={busy}>
                {preModeration ? "إرسال للمراجعة" : "إرسال التعليق"}
              </button>
            </form>
          ) : (
            <p>أُغلق استقبال تعليقات جديدة على هذه التدوينة.</p>
          )}
        </section>
      )}
    </>
  );
}
