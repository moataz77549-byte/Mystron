"use client";
import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Link from "next/link";
import { editorialExtensions } from "./extensions";
import { cleanEditorDocument } from "@/lib/editor/client-document";
import { sitePagePath, type SitePage } from "@/lib/editorial/site-pages-schema";
import { adminErrorMessage } from "@/lib/client/request";
import { command } from "./command";
const empty = { title: "", slug: "", description: "", is_published: false };
export function SitePagesEditor({
  initial,
  editable,
}: {
  initial: SitePage[];
  editable: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [record, setRecord] = useState<SitePage | null>(null);
  const [fields, setFields] = useState(empty);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const epoch = useRef(0);
  const lock = useRef(false);
  function changed() {
    epoch.current++;
    setDirty(true);
    setMessage("تعديلات غير محفوظة");
  }
  const editor = useEditor({
    immediatelyRender: false,
    extensions: editorialExtensions(),
    editable,
    content: { type: "doc", content: [{ type: "paragraph" }] },
    onUpdate: changed,
    editorProps: {
      attributes: {
        class: "prose editor-body",
        dir: "rtl",
        "aria-label": "محتوى الصفحة",
      },
      transformPastedHTML: (html) =>
        html.replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, ""),
    },
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const nav = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a");
      if (
        a &&
        a.target !== "_blank" &&
        !window.confirm("توجد تعديلات غير محفوظة. هل تريد مغادرة الصفحة؟")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", nav, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", nav, true);
    };
  }, [dirty]);
  function open(row: SitePage | null) {
    if (
      busy ||
      (dirty && !window.confirm("توجد تعديلات غير محفوظة. هل تريد تركها؟"))
    )
      return;
    setRecord(row);
    setFields(
      row
        ? {
            title: row.title,
            slug: row.slug,
            description: row.description,
            is_published: row.is_published,
          }
        : empty,
    );
    editor?.commands.setContent(
      cleanEditorDocument(
        row?.content_json || { type: "doc", content: [{ type: "paragraph" }] },
      ),
      { emitUpdate: false },
    );
    setDirty(false);
    setMessage("");
    epoch.current++;
  }
  async function save() {
    if (lock.current || !editor) return;
    lock.current = true;
    setBusy(true);
    const snapshot = epoch.current;
    setMessage("جارٍ الحفظ…");
    try {
      const result: SitePage = await command("pages", {
        id: record?.id || null,
        ...(record ? { version: record.version } : {}),
        patch: { ...fields, content_json: editor.getJSON() },
      });
      setRecord(result);
      setRows((old) => [result, ...old.filter((row) => row.id !== result.id)]);
      if (epoch.current === snapshot) {
        setDirty(false);
        setMessage("تم الحفظ.");
      } else setMessage("حُفظت النسخة السابقة؛ توجد تعديلات جديدة غير محفوظة.");
    } catch (e) {
      setMessage(adminErrorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="catalog">
      <section>
        <h2>الصفحات المحفوظة</h2>
        {editable && (
          <button type="button" disabled={busy} onClick={() => open(null)}>
            إضافة صفحة
          </button>
        )}
        {!rows.length && (
          <p>
            لا توجد صفحات مخصصة بعد. صفحات «حول المنصة» و«الخصوصية» الحالية
            محفوظة حتى نشر بديل لهما بالرابط about أو privacy.
          </p>
        )}
        {rows.map((row) => (
          <article key={row.id}>
            <h3>{row.title}</h3>
            <p>
              {row.is_published ? "منشورة" : "مسودة"} · الإصدار {row.version}
            </p>
            <button disabled={busy} onClick={() => open(row)}>
              فتح {row.title}
            </button>
            {row.is_published && (
              <Link
                href={sitePagePath(row.slug)}
                target="_blank"
                rel="noopener"
              >
                عرض الصفحة
              </Link>
            )}
          </article>
        ))}
      </section>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        aria-busy={busy}
      >
        <h2>{record ? "تعديل الصفحة" : "صفحة جديدة"}</h2>
        <label>
          عنوان الصفحة
          <input
            required
            maxLength={200}
            disabled={!editable}
            value={fields.title}
            onChange={(e) => {
              setFields({ ...fields, title: e.target.value });
              changed();
            }}
          />
        </label>
        <label>
          رابط الصفحة
          <input
            required
            maxLength={120}
            readOnly={!!record}
            disabled={!editable || busy}
            value={fields.slug}
            onChange={(e) => {
              setFields({ ...fields, slug: e.target.value });
              changed();
            }}
          />
        </label>
        <p dir="ltr">{sitePagePath(fields.slug)}</p>
        <label>
          وصف الصفحة
          <textarea
            maxLength={500}
            disabled={!editable}
            value={fields.description}
            onChange={(e) => {
              setFields({ ...fields, description: e.target.value });
              changed();
            }}
          />
        </label>
        {editable && (
          <div
            className="editor-toolbar"
            role="toolbar"
            aria-label="أدوات تحرير الصفحة"
          >
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              عريض
            </button>
            <button
              type="button"
              onClick={() =>
                editor?.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              عنوان فرعي
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              قائمة
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().undo().run()}
            >
              تراجع
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().redo().run()}
            >
              إعادة
            </button>
          </div>
        )}
        <EditorContent editor={editor} />
        <label>
          <input
            type="checkbox"
            disabled={!editable}
            checked={fields.is_published}
            onChange={(e) => {
              setFields({ ...fields, is_published: e.target.checked });
              changed();
            }}
          />
          نشر الصفحة للعامة
        </label>
        {editable && (
          <button disabled={busy || !dirty}>
            {busy ? "جارٍ الحفظ…" : "حفظ الصفحة"}
          </button>
        )}
        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </div>
  );
}
