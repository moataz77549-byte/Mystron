import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { richText } from "./text";
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
};
const types = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "hardBreak",
  "horizontalRule",
  "codeBlock",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "image",
  "callout",
  "poetry",
  "poetryVerse",
  "citation",
  "footnote",
  "video",
]);
const markTypes = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "textStyle",
  "highlight",
]);
export function validateDocument(value: unknown): RichNode {
  if (JSON.stringify(value).length > 800_000)
    throw new Error("DOCUMENT_TOO_LARGE");
  let count = 0;
  function walk(n: unknown, depth: number): RichNode {
    if (depth > 30 || ++count > 10000) throw new Error("DOCUMENT_TOO_COMPLEX");
    const parsed = z
      .object({
        type: z.string(),
        text: z.string().max(100000).optional(),
        attrs: z.record(z.string(), z.unknown()).optional(),
        marks: z
          .array(
            z.object({
              type: z.string(),
              attrs: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .max(8)
          .optional(),
        content: z.array(z.unknown()).optional(),
      })
      .strict()
      .parse(n);
    if (
      !types.has(parsed.type) ||
      parsed.marks?.some((m) => !markTypes.has(m.type))
    )
      throw new Error("INVALID_NODE");
    return {
      ...parsed,
      content: parsed.content?.map((c) => walk(c, depth + 1)),
    };
  }
  const doc = walk(value, 0);
  if (doc.type !== "doc") throw new Error("INVALID_DOCUMENT");
  return doc;
}
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function safeLink(value: unknown): string | null {
  try {
    const u = new URL(String(value));
    return ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function documentText(doc: RichNode): string {
  return richText(doc);
}
export function documentMedia(doc: RichNode): string[] {
  const ids = new Set<string>();
  function walk(n: RichNode) {
    if (
      n.type === "image" &&
      typeof n.attrs?.assetId === "string" &&
      z.uuid().safeParse(n.attrs.assetId).success
    )
      ids.add(n.attrs.assetId);
    n.content?.forEach(walk);
  }
  walk(doc);
  return [...ids];
}
export function documentHeadings(doc: RichNode) {
  const rows: { id: string; level: number; text: string }[] = [];
  function walk(n: RichNode) {
    if (n.type === "heading")
      rows.push({
        id: `heading-${rows.length}`,
        level: Number(n.attrs?.level) || 2,
        text: documentText(n),
      });
    n.content?.forEach(walk);
  }
  walk(doc);
  return rows;
}
export function renderDocument(value: unknown): string {
  const doc = validateDocument(value);
  let heading = 0;
  function render(n: RichNode): string {
    const a = n.attrs || {};
    const body = (n.content || []).map(render).join("");
    const dir = a.dir === "ltr" ? "ltr" : "rtl";
    const align = ["left", "right", "center", "justify"].includes(
      String(a.textAlign),
    )
      ? String(a.textAlign)
      : "start";
    const common = ` dir="${dir}" style="text-align:${align}"`;
    if (n.type === "text") {
      let text = escape(n.text);
      for (const m of n.marks || []) {
        const tags: Record<string, string> = {
          bold: "strong",
          italic: "em",
          underline: "u",
          strike: "s",
          code: "code",
        };
        if (tags[m.type]) text = `<${tags[m.type]}>${text}</${tags[m.type]}>`;
        else if (m.type === "link") {
          const url = safeLink(m.attrs?.href);
          if (url)
            text = `<a href="${escape(url)}" rel="nofollow noopener noreferrer">${text}</a>`;
        } else if (["textStyle", "highlight"].includes(m.type)) {
          const color = String(m.attrs?.color || "");
          if (/^#[a-f0-9]{3,8}$/i.test(color))
            text = `<span style="${m.type === "highlight" ? "background-color" : "color"}:${color}">${text}</span>`;
        }
      }
      return text;
    }
    if (n.type === "doc") return body;
    if (n.type === "heading") {
      const l = Math.min(6, Math.max(1, Number(a.level) || 2));
      return `<h${l} id="heading-${heading++}"${common}>${body}</h${l}>`;
    }
    if (n.type === "paragraph") return `<p${common}>${body}</p>`;
    const tags: Record<string, string> = {
      blockquote: "blockquote",
      bulletList: "ul",
      orderedList: "ol",
      listItem: "li",
      table: "table",
      tableRow: "tr",
      tableCell: "td",
      tableHeader: "th",
    };
    if (tags[n.type])
      return `<${tags[n.type]}${common}>${body}</${tags[n.type]}>`;
    if (n.type === "hardBreak") return "<br>";
    if (n.type === "horizontalRule") return "<hr>";
    if (n.type === "codeBlock")
      return `<pre dir="ltr"><code>${body}</code></pre>`;
    if (n.type === "image" && z.uuid().safeParse(a.assetId).success)
      return `<figure><img src="/api/v1/media/${escape(a.assetId)}?variant=optimized" alt="${escape(a.alt)}" loading="lazy"><figcaption>${escape(a.caption)}</figcaption></figure>`;
    if (n.type === "video") {
      const u = safeLink(a.src);
      if (u) {
        const url = new URL(u);
        if (
          ["www.youtube-nocookie.com"].includes(url.hostname) &&
          /^\/embed\/[a-zA-Z0-9_-]{11}$/.test(url.pathname)
        )
          return `<iframe src="${escape(url.origin + url.pathname)}" title="فيديو مضمّن" loading="lazy" allowfullscreen></iframe>`;
      }
      return "";
    }
    if (n.type === "poetryVerse") {
      const size = ["small", "normal", "large"].includes(String(a.size))
        ? a.size
        : "normal";
      return `<div class="editor-poetry-verse verse-${size}" dir="rtl"><span>${escape(a.first)}</span><span>${escape(a.second)}</span></div>`;
    }
    if (n.type === "citation") {
      const source = [a.author, a.book, a.page ? `ص ${String(a.page)}` : ""]
        .filter(Boolean)
        .map(escape)
        .join(" — ");
      const url = safeLink(a.url);
      return `<figure class="editor-citation"><blockquote${common}>${escape(a.quote)}</blockquote><figcaption>${source}${url ? ` <a href="${escape(url)}" rel="nofollow noopener noreferrer">المصدر</a>` : ""}</figcaption></figure>`;
    }
    if (n.type === "callout") {
      const kind = ["info", "note", "warning", "author"].includes(
        String(a.kind),
      )
        ? a.kind
        : "info";
      return `<aside class="editor-callout callout-${kind}"${common}>${a.title ? `<strong>${escape(a.title)}</strong>` : ""}${body}</aside>`;
    }
    if (["poetry", "footnote"].includes(n.type))
      return `<aside class="editor-${n.type}"${common}>${body}</aside>`;
    return "";
  }
  return sanitizeHtml(render(doc), {
    allowedTags: [
      "p",
      "div",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "strong",
      "em",
      "u",
      "s",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "br",
      "hr",
      "table",
      "tr",
      "td",
      "th",
      "figure",
      "img",
      "figcaption",
      "aside",
      "span",
      "a",
      "iframe",
    ],
    allowedAttributes: {
      "*": ["dir", "style", "id", "class"],
      a: ["href", "rel"],
      img: ["src", "alt", "loading"],
      iframe: ["src", "title", "loading", "allowfullscreen"],
    },
    allowedIframeHostnames: ["www.youtube-nocookie.com"],
    allowedSchemes: ["https", "http"],
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify|start)$/],
        color: [/^#[a-f0-9]{3,8}$/i],
        "background-color": [/^#[a-f0-9]{3,8}$/i],
      },
    },
    transformTags: {
      img: (tag, attrs) => ({
        tagName: tag,
        attribs: /^\/api\/v1\/media\/[0-9a-f-]{36}\?variant=optimized$/.test(
          attrs.src || "",
        )
          ? attrs
          : {},
      }),
    },
  });
}
export const normalizeArabic = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي");
