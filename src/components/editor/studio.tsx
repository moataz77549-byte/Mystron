"use client";
import { EditorAiTools } from "@/components/ai/editor-tools";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Node, Extension, mergeAttributes } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
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
const ImageAsset = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: { default: null },
      caption: { default: "" },
    };
  },
});
const Direction = Extension.create({
  name: "direction",
  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "blockquote",
          "poetry",
          "callout",
          "footnote",
        ],
        attributes: {
          dir: {
            default: "rtl",
            parseHTML: (e) => e.getAttribute("dir"),
            renderHTML: (a) => ({ dir: a.dir }),
          },
        },
      },
    ];
  },
});
function block(name: string) {
  return Node.create({
    name,
    group: "block",
    content: "block+",
    parseHTML() {
      return [{ tag: `aside.editor-${name}` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "aside",
        mergeAttributes(HTMLAttributes, { class: `editor-${name}` }),
        0,
      ];
    },
  });
}
const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "iframe" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "iframe",
      mergeAttributes(HTMLAttributes, { title: "فيديو", loading: "lazy" }),
    ];
  },
});
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
}: {
  initial: PostRecord;
  authors: Choice[];
  categories: Choice[];
  publisher: boolean;
}) {
  const [record, setRecord] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [status, setStatus] = useState("محفوظة");
  const [dirty, setDirty] = useState(false);
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
  const epoch = useRef(0);
  const docRef = useRef(initial.content_json);
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
    setEditTick((t) => t + 1);
    setDirty(true);
    setStatus("تعديلات غير محفوظة");
  }, []);
  const editor = useEditor({
    immediatelyRender: false,
    onCreate: ({ editor }) => {
      const text = editor.getText();
      setWords(text.trim().split(/\s+/).filter(Boolean).length);
      setChars(text.length);
    },
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      ImageAsset,
      Direction,
      block("callout"),
      block("poetry"),
      block("footnote"),
      Video,
    ],
    content: initial.content_json,
    onUpdate: ({ editor }) => {
      docRef.current = editor.getJSON();
      const text = editor.getText();
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
  const save = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const snapshot = epoch.current;
    setStatus("جارٍ الحفظ…");
    setError("");
    try {
      const data = await command("posts", {
        id: record.id,
        version: record.version,
        patch: {
          title,
          slug,
          ...extras,
          canonical_url: extras.canonical_url || null,
          content_json: docRef.current,
        },
      });
      setRecord(data);
      if (epoch.current === snapshot) {
        setDirty(false);
        setStatus("تم الحفظ");
        try {
          localStorage.removeItem(`maystroon-draft-${record.id}`);
        } catch {}
      } else setStatus("تعديلات غير محفوظة");
    } catch (e) {
      setStatus("تعذّر الحفظ");
      setError(e instanceof Error ? e.message : "خطأ");
    } finally {
      busy.current = false;
    }
  }, [record.id, record.version, title, slug, extras]);
  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(
        `maystroon-draft-${record.id}`,
        JSON.stringify({
          title,
          slug,
          extras,
          doc: docRef.current,
          at: Date.now(),
        }),
      );
    } catch {}
    const timer = setTimeout(() => void save(), 2500);
    return () => clearTimeout(timer);
  }, [dirty, editTick, title, slug, extras, record.id, save]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function transition(action: string) {
    if (dirty) {
      setError("احفظ التعديلات أولاً قبل تغيير حالة النشر.");
      return;
    }
    try {
      setRecord(
        await command("transitions", {
          id: record.id,
          version: record.version,
          action,
          ...(action === "scheduled"
            ? { scheduled_at: new Date(schedule + "+03:00").toISOString() }
            : {}),
        }),
      );
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  async function loadRevisions() {
    const r = await fetch(
      `/api/v1/admin/data?resource=revisions&post=${record.id}`,
    );
    const j = await r.json();
    if (r.ok) setRevisions(j.data);
    else setError(j.error?.code || "خطأ");
  }
  function restoreLocal() {
    try {
      const d = JSON.parse(
        localStorage.getItem(`maystroon-draft-${record.id}`) || "null",
      );
      if (!d) {
        setError("لا توجد مسودة محلية لهذا المتصفح.");
        return;
      }
      setTitle(d.title);
      setSlug(d.slug);
      setExtras(d.extras);
      editor?.commands.setContent(d.doc);
      docRef.current = d.doc;
      changed();
    } catch {
      setError("تعذّر استعادة المسودة المحلية.");
    }
  }
  async function showPreview(mode: "mobile" | "desktop") {
    try {
      const r = await fetch("/api/v1/admin/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docRef.current),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.code);
      setPreviewHtml(
        j.html.replace(/\/api\/v1\/media\//g, "/api/v1/admin/media/"),
      );
      setPreview(preview === mode ? "" : mode);
    } catch (e) {
      setError(String(e));
    }
  }
  if (!editor) return <p role="status">جارٍ تحميل المحرر…</p>;
  async function openMedia(target = "content") {
    setImageTarget(target);
    const r = await fetch("/api/v1/admin/data?resource=media");
    const j = await r.json();
    if (r.ok) {
      setMedia(
        j.data.filter((a: { deleted_at?: string | null }) => !a.deleted_at),
      );
      setMediaOpen(true);
    } else setError(j.error?.code || "خطأ");
  }
  const tool = (text: string, fn: () => unknown) => (
    <button key={text} type="button" onClick={() => fn()}>
      {text}
    </button>
  );
  const field = (key: string, value: unknown) => {
    setExtras((e) => ({ ...e, [key]: value }));
    changed();
  };
  return (
    <div className={`studio ${focus ? "distraction-free" : ""}`}>
      <EditorAiTools postId={record.id} />
      <div className="studio-top">
        <h1>استوديو التحرير</h1>
        <span role="status">
          {status} · {labels[record.status] || record.status}
        </span>
        <button onClick={() => void save()} disabled={!dirty}>
          حفظ الآن
        </button>
        <button onClick={() => setFocus(!focus)}>
          {focus ? "إنهاء التركيز" : "وضع التركيز"}
        </button>
        <button onClick={restoreLocal}>استعادة مسودة المتصفح</button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}{" "}
          {error.includes("VERSION_CONFLICT") &&
            "هناك تعديل أحدث. احتفظ بالمسودة المحلية وأعد تحميل الصفحة."}
        </p>
      )}
      <label>
        العنوان
        <input
          value={title}
          onChange={(e) => {
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
          onChange={(e) => {
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
        {tool("مرقمة", () => editor.chain().focus().toggleOrderedList().run())}
        {tool("اقتباس", () => editor.chain().focus().toggleBlockquote().run())}
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
                attrs: { src: `https://www.youtube-nocookie.com/embed/${id}` },
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
        {words} كلمة · {chars} حرف · {Math.max(1, Math.ceil(words / 200))} دقائق
        قراءة
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
      <details className="publishing-fields" open={!focus}>
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
            value={(extras.tags as string[]).join("،")}
            onChange={(e) =>
              field(
                "tags",
                e.target.value
                  .split(/[،,]/)
                  .map((v) => v.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
        <label>
          الكلمات المفتاحية التحريرية
          <input
            value={(extras.editorial_keywords as string[]).join("،")}
            onChange={(e) =>
              field(
                "editorial_keywords",
                e.target.value
                  .split(/[،,]/)
                  .map((v) => v.trim())
                  .filter(Boolean),
              )
            }
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
        <label>
          المصادر (عنوان | رابط، مصدر في كل سطر)
          <textarea
            value={(extras.sources as { title: string; url: string }[])
              .map((s) => `${s.title} | ${s.url}`)
              .join("\n")}
            onChange={(e) =>
              field(
                "sources",
                e.target.value
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => {
                    const [title, ...url] = line.split("|");
                    return { title: title.trim(), url: url.join("|").trim() };
                  }),
              )
            }
          />
        </label>
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
        <button onClick={() => void transition("review")}>
          إرسال للمراجعة
        </button>
        {publisher && (
          <>
            <button onClick={() => void transition("publish")}>نشر</button>
            <button onClick={() => void transition("unpublished")}>
              إلغاء النشر
            </button>
            <button onClick={() => void transition("archived")}>أرشفة</button>
            <label>
              موعد النشر — عدن UTC+3
              <input
                type="datetime-local"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              />
            </label>
            <button
              disabled={!schedule}
              onClick={() => void transition("scheduled")}
            >
              جدولة
            </button>
            <button onClick={() => void transition("draft")}>
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
                editor.commands.setContent(d.content_json);
                setStatus(
                  "تمت استعادة النسخة؛ راجع بيانات التدوينة بعد إعادة التحميل.",
                );
                window.location.reload();
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            استعادة
          </button>
        </div>
      ))}
    </div>
  );
}
