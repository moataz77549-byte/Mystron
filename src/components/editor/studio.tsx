"use client";
import { EditorAiTools } from "@/components/ai/editor-tools";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { editorialExtensions } from "./extensions";
import { SourceFields } from "./source-fields";
import type { EditorialSource } from "@/lib/editor/sources";
import { richText } from "@/lib/editor/text";
import type { JSONContent } from "@tiptap/core";
import { cleanEditorDocument } from "@/lib/editor/client-document";
import {
  browserDraftKey,
  parseBrowserDraft,
  parseLegacyDraft,
  readBrowserDraft,
  storeBrowserDraft,
  subscribeBrowserDraft,
} from "@/lib/editor/browser-draft";
import {
  adminRequest,
  adminErrorMessage,
  AdminRequestError,
} from "@/lib/client/request";
function subscribeOnline(listener: () => void) {
  addEventListener("online", listener);
  addEventListener("offline", listener);
  return () => {
    removeEventListener("online", listener);
    removeEventListener("offline", listener);
  };
}
export type PostRecord = {
  id: string;
  version: number;
  title: string;
  slug: string;
  status: string;
  content_json: JSONContent;
  [key: string]: unknown;
};
type Choice = { id: string; name?: string; display_name?: string };
import { command } from "./command";
const labels: Record<string, string> = {
  draft: "مسودة",
  review: "قيد المراجعة",
  scheduled: "مجدولة",
  published: "منشورة",
  archived: "مؤرشفة",
  unpublished: "غير منشورة",
};
export default function Studio({
  initial,
  authors,
  categories,
  publisher,
  userId,
  scheduler,
}: {
  initial: PostRecord;
  authors: Choice[];
  categories: Choice[];
  publisher: boolean;
  userId: string;
  scheduler: boolean;
}) {
  const [record, setRecord] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [status, setStatus] = useState("محفوظة");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [recoveryResolved, setRecoveryResolved] = useState(false);
  const [backupWarning, setBackupWarning] = useState("");
  const [tagsText, setTagsText] = useState(
    ((initial.tags || []) as string[]).join("،"),
  );
  const [keywordsText, setKeywordsText] = useState(
    ((initial.editorial_keywords || []) as string[]).join("،"),
  );
  const [retryTick, setRetryTick] = useState(0);
  const [focus, setFocus] = useState(false);
  const [preview, setPreview] = useState<"" | "mobile" | "desktop">("");
  const [revisions, setRevisions] = useState<
    { id: string; created_at: string }[]
  >([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [schedule, setSchedule] = useState("");
  const [extras, setExtras] = useState<Record<string, unknown>>({
    author_id: initial.author_id || null,
    primary_category_id: initial.primary_category_id || null,
    category_ids: initial.category_ids || [],
    excerpt: initial.excerpt || "",
    subtitle: initial.subtitle || "",
    seo_title: initial.seo_title || "",
    seo_description: initial.seo_description || "",
    tags: initial.tags || [],
    editorial_keywords: initial.editorial_keywords || [],
    comments_close_at: initial.comments_close_at || null,
    sources: initial.sources || [],
    cover_asset_id: initial.cover_asset_id || null,
    thumbnail_asset_id: initial.thumbnail_asset_id || null,
    share_asset_id: initial.share_asset_id || null,
    canonical_url: initial.canonical_url || "",
    visibility: initial.visibility || "public",
    featured: !!initial.featured,
    allow_comments: initial.allow_comments !== false,
    sharing: initial.sharing || {},
  });
  const [editTick, setEditTick] = useState(0);
  const busy = useRef(false);
  const dirtyFlag = useRef(false);
  const transitionLock = useRef(false);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const retryAttempts = useRef(0);
  const retryNotBefore = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFields = useRef({
    title: initial.title,
    slug: initial.slug,
    extras,
  });
  const [safeInitial] = useState(() =>
    cleanEditorDocument(initial.content_json),
  );
  const epoch = useRef(0);
  const docRef = useRef(safeInitial);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const storageKey = browserDraftKey(userId, record.id);
  const legacyKey = `maystroon-draft-${record.id}`;
  const stored = useSyncExternalStore(
    subscribeBrowserDraft,
    useCallback(
      () => readBrowserDraft(storageKey) || readBrowserDraft(legacyKey),
      [storageKey, legacyKey],
    ),
    () => null,
  );
  const recovery = useMemo(
    () =>
      parseBrowserDraft(stored, userId, record.id) ||
      parseLegacyDraft(stored, userId, record.id),
    [stored, userId, record.id],
  );
  const needsRecovery = !!recovery && !recoveryResolved && !dirty;
  const persistDraft = useCallback(() => {
    storeBrowserDraft(storageKey, {
      schema: 2,
      userId,
      postId: record.id,
      baseVersion: record.version,
      at: Date.now(),
      ...latestFields.current,
      doc: docRef.current,
    });
  }, [storageKey, userId, record.id, record.version]);
  const persistLatest = useRef(persistDraft);
  useEffect(() => {
    persistLatest.current = persistDraft;
  }, [persistDraft]);
  useEffect(
    () => () => {
      if (dirtyFlag.current) {
        try {
          persistLatest.current();
        } catch {}
      }
    },
    [],
  );
  const [words, setWords] = useState(0);
  const [chars, setChars] = useState(0);
  const [headings, setHeadings] = useState<{ pos: number; text: string }[]>([]);
  const [error, setError] = useState("");
  const [mediaOpen, setMediaOpen] = useState(false);
  const [imageTarget, setImageTarget] = useState("content");
  const [media, setMedia] = useState<
    { id: string; display_name: string; alt_text: string }[]
  >([]);
  const changed = useCallback(() => {
    epoch.current++;
    dirtyFlag.current = true;
    setRecoveryResolved(true);
    retryAttempts.current = 0;
    if (retryTimer.current && retryNotBefore.current <= Date.now())
      clearTimeout(retryTimer.current);
    setEditTick((t) => t + 1);
    setDirty(true);
    setStatus("تعديلات غير محفوظة");
  }, []);
  const editor = useEditor({
    immediatelyRender: false,
    onCreate: ({ editor }) => {
      const text = richText(editor.getJSON());
      setWords(text.trim().split(/\s+/).filter(Boolean).length);
      setChars(text.length);
    },
    extensions: editorialExtensions(),
    content: safeInitial,
    onUpdate: ({ editor }) => {
      docRef.current = editor.getJSON();
      const text = richText(editor.getJSON());
      setWords(text.trim().split(/\s+/).filter(Boolean).length);
      setChars(text.length);
      const h: { pos: number; text: string }[] = [];
      editor.state.doc.descendants((n, pos) => {
        if (n.type.name === "heading") h.push({ pos, text: n.textContent });
      });
      setHeadings(h);
      changed();
    },
    editorProps: {
      attributes: {
        class: "prose editor-body",
        dir: "rtl",
        "aria-label": "محتوى التدوينة",
      },
      transformPastedHTML: (html) =>
        html.replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, ""),
    },
  });
  const save = useCallback(
    async (manual = false): Promise<PostRecord | null> => {
      if (busy.current || conflict) return null;
      if (retryNotBefore.current > Date.now()) {
        setStatus("تنتظر المزامنة انتهاء مهلة إعادة المحاولة");
        return null;
      }
      if (!online) {
        setStatus("انقطع الاتصال؛ التعديلات تنتظر عودته");
        return null;
      }
      if (manual) retryAttempts.current = 0;
      busy.current = true;
      setSaving(true);
      const snapshot = epoch.current;
      const started = Date.now();
      const fields = latestFields.current;
      setStatus("جارٍ الحفظ…");
      setError("");
      try {
        const data = await command("posts", {
          id: record.id,
          version: record.version,
          patch: {
            title: fields.title,
            slug: fields.slug,
            ...fields.extras,
            canonical_url: fields.extras.canonical_url || null,
            content_json: docRef.current,
          },
        });
        if (
          !data ||
          data.id !== record.id ||
          !Number.isInteger(data.version) ||
          data.version <= record.version
        )
          throw new AdminRequestError("INVALID_RESPONSE", 503);
        setRecord(data);
        retryAttempts.current = 0;
        retryNotBefore.current = 0;
        if (epoch.current === snapshot) {
          dirtyFlag.current = false;
          setDirty(false);
          setStatus("تم الحفظ");
          try {
            const cached = parseBrowserDraft(
              readBrowserDraft(storageKey),
              userId,
              record.id,
            );
            if (
              !cached ||
              cached.at <= started ||
              (cached.title === fields.title &&
                cached.slug === fields.slug &&
                JSON.stringify(cached.doc) === JSON.stringify(docRef.current) &&
                JSON.stringify(cached.extras) === JSON.stringify(fields.extras))
            )
              storeBrowserDraft(storageKey, null);
            localStorage.removeItem(legacyKey);
          } catch {}
        } else setStatus("تعديلات غير محفوظة");
        return epoch.current === snapshot ? data : null;
      } catch (e) {
        setStatus("تعذّر الحفظ");
        setError(adminErrorMessage(e));
        try {
          persistDraft();
        } catch {
          setBackupWarning(
            "تعذر حفظ نسخة المتصفح. أبقِ الصفحة مفتوحة حتى ينجح حفظ الخادم أو نزّل نسخة.",
          );
        }
        if (e instanceof AdminRequestError && e.code === "VERSION_CONFLICT")
          setConflict(true);
        if (
          e instanceof AdminRequestError &&
          (e.status === 0 || e.status === 429 || e.status >= 500) &&
          retryAttempts.current < 5
        ) {
          retryAttempts.current++;
          const delay = Math.max(
            e.retryAfter * 1000,
            Math.min(30000, 1500 * 2 ** retryAttempts.current),
          );
          retryNotBefore.current = Date.now() + delay;
          retryTimer.current = setTimeout(
            () => setRetryTick((tick) => tick + 1),
            delay,
          );
        }
        return null;
      } finally {
        busy.current = false;
        setSaving(false);
      }
    },
    [
      record.id,
      record.version,
      online,
      conflict,
      persistDraft,
      storageKey,
      legacyKey,
      userId,
    ],
  );
  useEffect(() => {
    if (!dirty) return;
    const backup = setTimeout(() => {
      try {
        persistDraft();
        setBackupWarning("");
      } catch {
        setBackupWarning(
          "تعذر حفظ نسخة المتصفح؛ لا تغلق الصفحة قبل حفظ الخادم.",
        );
      }
    }, 350);
    return () => clearTimeout(backup);
  }, [dirty, editTick, persistDraft]);
  useEffect(() => {
    if (!dirty || !online || conflict || needsRecovery) return;
    const timer = setTimeout(() => void save(), 2500);
    return () => clearTimeout(timer);
  }, [dirty, editTick, online, conflict, needsRecovery, retryTick, save]);
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyFlag.current) {
        try {
          persistLatest.current();
        } catch {
          /* The unload warning still protects the live document. */
        }
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const navigation = (event: MouseEvent) => {
      if (
        !dirtyFlag.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const next = new URL(anchor.href, location.href);
      if (
        next.origin === location.origin &&
        next.pathname === location.pathname &&
        next.search === location.search
      )
        return;
      if (
        !confirm(
          "توجد تعديلات غير محفوظة على الخادم. هل تريد مغادرة المحرر مع الاحتفاظ بنسخة محلية؟",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      try {
        persistLatest.current();
      } catch {
        event.preventDefault();
        event.stopPropagation();
        setBackupWarning(
          "تعذر حفظ النسخة المحلية. احفظ على الخادم أو نزّل نسخة قبل المغادرة.",
        );
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", navigation, true);
    };
  }, [dirty]);
  async function transition(action: string) {
    if (transitionLock.current) return;
    transitionLock.current = true;
    setTransitionBusy(true);
    try {
      let saved = record;
      if (dirty) {
        const result = await save(true);
        if (!result) return;
        saved = result;
      }
      try {
        setRecord(
          await command("transitions", {
            id: record.id,
            version: saved.version,
            action,
            ...(action === "scheduled"
              ? { scheduled_at: new Date(schedule + "+03:00").toISOString() }
              : {}),
          }),
        );
        setError("");
      } catch (e) {
        setError(adminErrorMessage(e));
      }
    } finally {
      transitionLock.current = false;
      setTransitionBusy(false);
    }
  }
  async function loadRevisions() {
    try {
      const result = await adminRequest<{
        data: { id: string; created_at: string }[];
      }>(`/api/v1/admin/data?resource=revisions&post=${record.id}`);
      setRevisions(result.data);
      setError("");
    } catch (error) {
      setError(adminErrorMessage(error));
    }
  }
  function restoreLocal() {
    try {
      const raw = readBrowserDraft(storageKey) || readBrowserDraft(legacyKey);
      const d =
        parseBrowserDraft(raw, userId, record.id) ||
        parseLegacyDraft(raw, userId, record.id);
      if (!d) {
        setError("لا توجد مسودة محلية لهذا المتصفح.");
        return;
      }
      setTitle(d.title);
      setSlug(d.slug);
      const recoveredExtras = { ...latestFields.current.extras, ...d.extras };
      setExtras(recoveredExtras);
      setTagsText(((d.extras.tags || []) as string[]).join("،"));
      setKeywordsText(
        ((d.extras.editorial_keywords || []) as string[]).join("،"),
      );
      latestFields.current = {
        title: d.title,
        slug: d.slug,
        extras: recoveredExtras,
      };
      setRecoveryResolved(true);
      editor?.commands.setContent(d.doc);
      docRef.current = d.doc;
      changed();
    } catch {
      setError("تعذّر استعادة المسودة المحلية.");
    }
  }
  async function showPreview(mode: "mobile" | "desktop") {
    try {
      const j = await adminRequest<{ html: string }>("/api/v1/admin/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docRef.current),
      });
      setPreviewHtml(
        j.html.replace(/\/api\/v1\/media\//g, "/api/v1/admin/media/"),
      );
      setPreview(preview === mode ? "" : mode);
    } catch (e) {
      setError(adminErrorMessage(e));
    }
  }
  useEffect(() => {
    editor?.setEditable(!needsRecovery && !transitionBusy, false);
  }, [editor, needsRecovery, transitionBusy]);
  if (!editor) return <p role="status">جارٍ تحميل المحرر…</p>;
  async function openMedia(target = "content") {
    setImageTarget(target);
    try {
      const j = await adminRequest<{
        data: {
          id: string;
          display_name: string;
          alt_text: string;
          deleted_at?: string | null;
        }[];
      }>("/api/v1/admin/data?resource=media");
      setMedia(j.data.filter((asset) => !asset.deleted_at));
      setMediaOpen(true);
    } catch (error) {
      setError(adminErrorMessage(error));
    }
  }
  const tool = (text: string, fn: () => unknown) => (
    <button key={text} type="button" onClick={() => fn()}>
      {text}
    </button>
  );
  const field = (key: string, value: unknown) => {
    const next = { ...latestFields.current.extras, [key]: value };
    if (
      key === "category_ids" &&
      !(value as string[]).includes(String(next.primary_category_id || ""))
    )
      next.primary_category_id = null;
    latestFields.current = { ...latestFields.current, extras: next };
    setExtras(next);
    changed();
  };
  return (
    <div
      className={`studio ${focus ? "distraction-free" : ""}`}
      aria-busy={saving || transitionBusy}
    >
      {needsRecovery && recovery && (
        <section
          className="control-card draft-recovery"
          aria-label="استعادة المسودة"
        >
          <h2>مسودة متصفح تنتظر المراجعة</h2>
          <p>
            هناك نسخة غير مؤكدة الحفظ بتاريخ{" "}
            {new Date(recovery.at).toLocaleString("ar-YE", {
              timeZone: "Asia/Aden",
            })}
            .{" "}
            {recovery.baseVersion !== record.version
              ? "إصدار الخادم مختلف؛ راجع النسختين قبل اعتماد تعديلاتك."
              : "يمكنك استعادة الكتابة أو متابعة نسخة الخادم."}
          </p>
          <button onClick={restoreLocal}>استعادة هذه المسودة</button>
          <button
            onClick={() => {
              if (confirm("إهمال المسودة المحلية ومتابعة نسخة الخادم؟")) {
                storeBrowserDraft(storageKey, null);
                localStorage.removeItem(legacyKey);
                setRecoveryResolved(true);
              }
            }}
          >
            متابعة نسخة الخادم
          </button>
        </section>
      )}
      <div inert={needsRecovery || transitionBusy}>
        <EditorAiTools postId={record.id} />
        <div className="studio-top">
          <h1>استوديو التحرير</h1>
          <span role="status">
            {!online && dirty
              ? "انقطع الاتصال؛ النسخة المحلية تنتظر عودته"
              : status}{" "}
            ·{" "}
            {record.status === "review" &&
            !dirty &&
            record.approved_version === record.version
              ? "معتمد تحريرياً"
              : labels[record.status] || record.status}
          </span>
          <button
            onClick={() => void save(true)}
            disabled={!dirty || saving || conflict || !online}
          >
            {saving ? "جارٍ الحفظ…" : "حفظ الآن"}
          </button>
          <button onClick={() => setFocus(!focus)}>
            {focus ? "إنهاء التركيز" : "وضع التركيز"}
          </button>
          <button onClick={restoreLocal}>استعادة مسودة المتصفح</button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}{" "}
            {conflict && (
              <button
                onClick={() => {
                  try {
                    persistDraft();
                    dirtyFlag.current = false;
                    window.location.reload();
                  } catch {
                    setBackupWarning(
                      "تعذر حفظ نسختك محلياً. نزّل نسخة قبل إعادة التحميل.",
                    );
                  }
                }}
              >
                فتح إصدار الخادم للمراجعة
              </button>
            )}
          </p>
        )}
        {backupWarning && <p role="alert">{backupWarning}</p>}
        {dirty && (
          <button
            type="button"
            onClick={() => {
              const value = JSON.stringify(
                {
                  title: latestFields.current.title,
                  slug: latestFields.current.slug,
                  extras: latestFields.current.extras,
                  doc: docRef.current,
                },
                null,
                2,
              );
              const url = URL.createObjectURL(
                new Blob([value], { type: "application/json" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `maystroon-draft-${record.id}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            تنزيل نسخة احتياطية من المسودة
          </button>
        )}
        <label>
          العنوان
          <input
            value={title}
            disabled={transitionBusy}
            onChange={(e) => {
              latestFields.current = {
                ...latestFields.current,
                title: e.target.value,
              };
              setTitle(e.target.value);
              changed();
            }}
          />
        </label>
        <label>
          الرابط الدائم
          <input
            dir="auto"
            value={slug}
            disabled={transitionBusy}
            onChange={(e) => {
              latestFields.current = {
                ...latestFields.current,
                slug: e.target.value,
              };
              setSlug(e.target.value);
              changed();
            }}
          />
        </label>
        <div className="editor-toolbar" aria-label="أدوات التحرير">
          <select
            aria-label="نوع العنوان"
            value=""
            onChange={(e) => {
              const level = Number(e.target.value);
              if (level)
                editor
                  .chain()
                  .focus()
                  .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
                  .run();
              else editor.chain().focus().setParagraph().run();
            }}
          >
            <option value="">فقرة / عنوان</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                H{n}
              </option>
            ))}
          </select>
          {tool("عريض", () => editor.chain().focus().toggleBold().run())}
          {tool("مائل", () => editor.chain().focus().toggleItalic().run())}
          {tool("تسطير", () => editor.chain().focus().toggleUnderline().run())}
          {tool("شطب", () => editor.chain().focus().toggleStrike().run())}
          <label>
            لون
            <input
              type="color"
              aria-label="لون النص"
              onChange={(e) =>
                editor.chain().focus().setColor(e.target.value).run()
              }
            />
          </label>
          <label>
            تمييز
            <input
              type="color"
              aria-label="لون التمييز"
              defaultValue="#d5a96a"
              onChange={(e) =>
                editor
                  .chain()
                  .focus()
                  .toggleHighlight({ color: e.target.value })
                  .run()
              }
            />
          </label>
          {["right", "center", "left", "justify"].map((a, i) =>
            tool(["يمين", "وسط", "يسار", "ضبط"][i], () =>
              editor.chain().focus().setTextAlign(a).run(),
            ),
          )}
          {tool("RTL", () =>
            editor
              .chain()
              .focus()
              .updateAttributes("paragraph", { dir: "rtl" })
              .updateAttributes("heading", { dir: "rtl" })
              .run(),
          )}
          {tool("LTR", () =>
            editor
              .chain()
              .focus()
              .updateAttributes("paragraph", { dir: "ltr" })
              .updateAttributes("heading", { dir: "ltr" })
              .run(),
          )}
          {tool("قائمة", () => editor.chain().focus().toggleBulletList().run())}
          {tool("مرقمة", () =>
            editor.chain().focus().toggleOrderedList().run(),
          )}
          {tool("اقتباس", () =>
            editor.chain().focus().toggleBlockquote().run(),
          )}
          {tool("فاصل", () => editor.chain().focus().setHorizontalRule().run())}
          {tool("رابط", () => {
            const href = prompt("رابط HTTP أو HTTPS");
            if (href && /^https?:\/\//i.test(href))
              editor.chain().focus().setLink({ href }).run();
          })}
          {tool("إزالة الرابط", () => editor.chain().focus().unsetLink().run())}
          {tool("جدول", () =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
          )}
          {tool("صف +", () => editor.chain().focus().addRowAfter().run())}
          {tool("عمود +", () => editor.chain().focus().addColumnAfter().run())}
          {tool("حذف جدول", () => editor.chain().focus().deleteTable().run())}
          {tool("كود", () => editor.chain().focus().toggleCodeBlock().run())}
          {tool("بيت شعري", () =>
            editor
              .chain()
              .focus()
              .insertContent([{ type: "poetryVerse" }, { type: "paragraph" }])
              .run(),
          )}
          {tool("اقتباس موثّق", () =>
            editor
              .chain()
              .focus()
              .insertContent([{ type: "citation" }, { type: "paragraph" }])
              .run(),
          )}
          {["callout", "poetry", "footnote"].map((n, i) =>
            tool(["بطاقة / تنبيه", "أبيات شعرية", "ملاحظة تحريرية"][i], () =>
              editor
                .chain()
                .focus()
                .insertContent({ type: n, content: [{ type: "paragraph" }] })
                .run(),
            ),
          )}
          {tool("فيديو", () => {
            const id = prompt("معرّف فيديو YouTube (11 حرفاً)");
            if (id && /^[a-zA-Z0-9_-]{11}$/.test(id))
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "video",
                  attrs: {
                    src: `https://www.youtube-nocookie.com/embed/${id}`,
                  },
                })
                .run();
          })}
          {tool("صورة من المكتبة", () => openMedia())}
          {tool("تراجع", () => editor.chain().focus().undo().run())}
          {tool("إعادة", () => editor.chain().focus().redo().run())}
        </div>
        {mediaOpen && (
          <div className="media-grid">
            {media.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  if (imageTarget === "content")
                    editor
                      .chain()
                      .focus()
                      .insertContent({
                        type: "image",
                        attrs: {
                          assetId: m.id,
                          src: `/api/v1/admin/media/${m.id}`,
                          alt: m.alt_text || "",
                        },
                      })
                      .run();
                  else field(imageTarget, m.id);
                  setMediaOpen(false);
                }}
              >
                {m.display_name}
              </button>
            ))}
            {!media.length && (
              <p>
                المكتبة فارغة.{" "}
                <a href="/admin/media" target="_blank" rel="noreferrer">
                  رفع صورة
                </a>
              </p>
            )}
            <button onClick={() => setMediaOpen(false)}>إغلاق المكتبة</button>
          </div>
        )}
        <EditorContent editor={editor} />
        <p>
          {words} كلمة · {chars} حرف · {Math.max(1, Math.ceil(words / 200))}{" "}
          دقائق قراءة
        </p>
        {headings.length > 0 && (
          <nav aria-label="فهرس المحرر">
            {headings.map((h) => (
              <button
                key={h.pos}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .setTextSelection(h.pos + 1)
                    .run()
                }
              >
                {h.text}
              </button>
            ))}
          </nav>
        )}
        <div className="preview-controls">
          <button onClick={() => void showPreview("mobile")}>
            معاينة الهاتف
          </button>
          <button onClick={() => void showPreview("desktop")}>
            معاينة الكمبيوتر
          </button>
        </div>
        {preview && (
          <section className={`article-preview ${preview}`}>
            <h2>{title}</h2>
            <p>{String(extras.excerpt || "")}</p>
            <div
              className="prose"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </section>
        )}
        <details id="publishing" className="publishing-fields" open={!focus}>
          <summary>بيانات التدوينة والنشر وSEO</summary>
          <label>
            الكاتب
            <select
              aria-label="الكاتب"
              value={String(extras.author_id || "")}
              onChange={(e) => field("author_id", e.target.value || null)}
            >
              <option value="">اختر الكاتب</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>الأقسام</legend>
            {categories.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={(extras.category_ids as string[]).includes(c.id)}
                  onChange={(e) =>
                    field(
                      "category_ids",
                      e.target.checked
                        ? [...(extras.category_ids as string[]), c.id]
                        : (extras.category_ids as string[]).filter(
                            (id) => id !== c.id,
                          ),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
          </fieldset>
          <label>
            القسم الأساسي
            <select
              aria-label="القسم الأساسي"
              value={String(extras.primary_category_id || "")}
              onChange={(e) =>
                field("primary_category_id", e.target.value || null)
              }
            >
              <option value="">اختر القسم</option>
              {categories
                .filter((c) => (extras.category_ids as string[]).includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          {[
            ["subtitle", "العنوان الفرعي"],
            ["excerpt", "الملخص"],
            ["seo_title", "عنوان SEO"],
            ["seo_description", "وصف SEO"],
            ["canonical_url", "الرابط الأساسي Canonical"],
          ].map(([k, l]) => (
            <label key={k}>
              {l}
              <textarea
                value={String(extras[k] || "")}
                onChange={(e) => field(k, e.target.value)}
              />
            </label>
          ))}
          <label>
            الوسوم (فواصل عربية)
            <input
              value={tagsText}
              onChange={(e) => {
                setTagsText(e.target.value);
                field(
                  "tags",
                  e.target.value
                    .split(/[،,]/)
                    .map((v) => v.trim())
                    .filter(Boolean),
                );
              }}
            />
          </label>
          <label>
            الكلمات المفتاحية التحريرية
            <input
              value={keywordsText}
              onChange={(e) => {
                setKeywordsText(e.target.value);
                field(
                  "editorial_keywords",
                  e.target.value
                    .split(/[،,]/)
                    .map((v) => v.trim())
                    .filter(Boolean),
                );
              }}
            />
          </label>
          <label>
            إغلاق التعليقات — عدن UTC+3
            <input
              type="datetime-local"
              value={
                extras.comments_close_at
                  ? new Date(
                      new Date(String(extras.comments_close_at)).getTime() +
                        10800000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                field(
                  "comments_close_at",
                  e.target.value
                    ? new Date(e.target.value + "+03:00").toISOString()
                    : null,
                )
              }
            />
          </label>
          <SourceFields
            value={extras.sources as EditorialSource[]}
            onChange={(value) => field("sources", value)}
          />
          {["cover_asset_id", "thumbnail_asset_id", "share_asset_id"].map(
            (k, i) => (
              <label key={k}>
                {
                  [
                    "معرّف الصورة الرئيسية",
                    "معرّف الصورة المصغرة",
                    "معرّف صورة المشاركة",
                  ][i]
                }
                <input
                  dir="ltr"
                  value={String(extras[k] || "")}
                  onChange={(e) => field(k, e.target.value || null)}
                />
                <button type="button" onClick={() => void openMedia(k)}>
                  اختيار من المكتبة
                </button>
              </label>
            ),
          )}
          <p>
            <a href="/admin/media" target="_blank" rel="noreferrer">
              فتح مكتبة الوسائط لنسخ معرّف الصورة
            </a>
          </p>
          <label>
            الظهور
            <select
              value={String(extras.visibility)}
              onChange={(e) => field("visibility", e.target.value)}
            >
              <option value="public">عام</option>
              <option value="private">خاص</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!extras.featured}
              onChange={(e) => field("featured", e.target.checked)}
            />
            تدوينة مميزة
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!extras.allow_comments}
              onChange={(e) => field("allow_comments", e.target.checked)}
            />
            السماح بالتعليقات
          </label>
        </details>
        <div className="editor-toolbar">
          <button
            disabled={transitionBusy || saving || conflict || !online}
            onClick={() => void transition("review")}
          >
            إرسال للمراجعة
          </button>
          {publisher && (
            <>
              {record.status === "review" && (
                <button
                  disabled={
                    transitionBusy ||
                    saving ||
                    conflict ||
                    !online ||
                    (!dirty && record.approved_version === record.version)
                  }
                  onClick={() => void transition("approve")}
                >
                  اعتماد النسخة الحالية
                </button>
              )}
              <button
                disabled={transitionBusy || saving || conflict || !online}
                onClick={() => void transition("publish")}
              >
                نشر
              </button>
              <button
                disabled={transitionBusy || saving || conflict || !online}
                onClick={() => void transition("unpublished")}
              >
                إلغاء النشر
              </button>
              <button
                disabled={transitionBusy || saving || conflict || !online}
                onClick={() => void transition("archived")}
              >
                أرشفة
              </button>
            </>
          )}
          {scheduler && (
            <>
              <label>
                موعد النشر — عدن UTC+3
                <input
                  type="datetime-local"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                />
              </label>
              <button
                disabled={
                  !schedule || transitionBusy || saving || conflict || !online
                }
                onClick={() => void transition("scheduled")}
              >
                جدولة
              </button>
              <button
                disabled={transitionBusy || saving || conflict || !online}
                onClick={() => void transition("draft")}
              >
                إلغاء الجدولة / مسودة
              </button>
            </>
          )}
        </div>
        <fieldset>
          <legend>أزرار المشاركة</legend>
          {[
            ["facebook", "Facebook"],
            ["x", "X"],
            ["telegram", "Telegram"],
            ["whatsapp", "WhatsApp"],
            ["webshare", "مشاركة الجهاز"],
            ["copy", "نسخ الرابط"],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={
                  (extras.sharing as Record<string, boolean>)?.[key] !== false
                }
                onChange={(e) =>
                  field("sharing", {
                    ...(extras.sharing as Record<string, boolean>),
                    [key]: e.target.checked,
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <button onClick={() => void loadRevisions()}>سجل النسخ السابقة</button>
        {revisions.map((r) => (
          <div key={r.id}>
            <time>{new Date(r.created_at).toLocaleString("ar-YE")}</time>
            <button
              disabled={dirty}
              onClick={async () => {
                try {
                  const d = await command("revisions", {
                    id: r.id,
                    version: record.version,
                  });
                  setRecord(d);
                  setTitle(d.title);
                  setSlug(d.slug);
                  docRef.current = d.content_json;
                  editor.commands.setContent(
                    cleanEditorDocument(d.content_json),
                    { emitUpdate: false },
                  );
                  dirtyFlag.current = false;
                  storeBrowserDraft(storageKey, null);
                  localStorage.removeItem(legacyKey);
                  setStatus(
                    "تمت استعادة النسخة؛ راجع بيانات التدوينة بعد إعادة التحميل.",
                  );
                  window.location.reload();
                } catch (e) {
                  setError(adminErrorMessage(e));
                }
              }}
            >
              استعادة
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
