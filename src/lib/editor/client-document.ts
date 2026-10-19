import type { JSONContent } from "@tiptap/core";
const nodes = new Set([
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
const marks = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "textStyle",
  "highlight",
]);
export function editorLink(value: unknown) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function editorVideo(value: unknown) {
  const link = editorLink(value);
  if (!link) return null;
  const url = new URL(link);
  return url.origin === "https://www.youtube-nocookie.com" &&
    /^\/embed\/[\w-]{11}$/.test(url.pathname) &&
    !url.search &&
    !url.hash
    ? link
    : null;
}
export function editorImage(value: unknown) {
  return typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
    ? `/api/v1/admin/media/${value}?variant=optimized`
    : null;
}
/** Treat saved RPC JSON and browser drafts as untrusted before handing them to
 * ProseMirror. Public rendering separately validates and sanitizes on the server. */
export function cleanEditorDocument(value: unknown): JSONContent {
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 800000)
    throw new Error("INVALID_DOCUMENT");
  let count = 0;
  function walk(value: unknown, depth: number): JSONContent {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      depth > 30 ||
      ++count > 10000
    )
      throw new Error("INVALID_DOCUMENT");
    const node = value as Record<string, unknown>;
    if (typeof node.type !== "string" || !nodes.has(node.type))
      throw new Error("INVALID_DOCUMENT");
    if (
      node.text !== undefined &&
      (typeof node.text !== "string" || node.text.length > 100000)
    )
      throw new Error("INVALID_DOCUMENT");
    const input =
      node.attrs && typeof node.attrs === "object"
        ? (node.attrs as Record<string, unknown>)
        : {};
    const attrs: Record<string, unknown> = {};
    if (["rtl", "ltr"].includes(String(input.dir))) attrs.dir = input.dir;
    if (
      ["left", "right", "center", "justify"].includes(String(input.textAlign))
    )
      attrs.textAlign = input.textAlign;
    if (node.type === "heading")
      attrs.level =
        Number.isInteger(input.level) &&
        Number(input.level) >= 1 &&
        Number(input.level) <= 6
          ? input.level
          : 2;
    if (
      node.type === "orderedList" &&
      Number.isInteger(input.start) &&
      Number(input.start) > 0 &&
      Number(input.start) <= 10000
    )
      attrs.start = input.start;
    for (const key of ["colspan", "rowspan"])
      if (
        Number.isInteger(input[key]) &&
        Number(input[key]) > 0 &&
        Number(input[key]) <= 50
      )
        attrs[key] = input[key];
    if (
      Array.isArray(input.colwidth) &&
      input.colwidth.length <= 50 &&
      input.colwidth.every((n) => Number.isInteger(n) && n > 0 && n <= 2000)
    )
      attrs.colwidth = input.colwidth;
    if (
      node.type === "codeBlock" &&
      typeof input.language === "string" &&
      /^[\w+-]{1,30}$/.test(input.language)
    )
      attrs.language = input.language;
    if (node.type === "image") {
      attrs.assetId = editorImage(input.assetId) ? input.assetId : null;
      attrs.src = editorImage(input.assetId) || "";
      attrs.alt = typeof input.alt === "string" ? input.alt.slice(0, 2000) : "";
      attrs.caption =
        typeof input.caption === "string" ? input.caption.slice(0, 2000) : "";
    }
    if (node.type === "video") attrs.src = editorVideo(input.src) || "";
    if (
      [
        "citation",
        "blockquote",
        "callout",
        "poetryVerse",
        "poetry",
        "footnote",
      ].includes(node.type)
    ) {
      for (const key of [
        "author",
        "book",
        "page",
        "title",
        "first",
        "second",
        "quote",
      ])
        if (typeof input[key] === "string")
          attrs[key] = input[key].slice(
            0,
            ["first", "second", "quote"].includes(key) ? 100000 : 300,
          );
      if (input.url) attrs.url = editorLink(input.url) || "";
      if (["info", "note", "warning", "author"].includes(String(input.kind)))
        attrs.kind = input.kind;
      if (["small", "normal", "large"].includes(String(input.size)))
        attrs.size = input.size;
    }
    const result: JSONContent = { type: node.type, attrs };
    if (typeof node.text === "string") result.text = node.text;
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) throw new Error("INVALID_DOCUMENT");
      result.content = node.content.map((child) => walk(child, depth + 1));
    }
    if (Array.isArray(node.marks))
      result.marks = node.marks.flatMap((value) => {
        if (!value || typeof value !== "object" || !marks.has(value.type))
          return [];
        if (value.type === "link") {
          const href = editorLink(value.attrs?.href);
          return href ? [{ type: "link", attrs: { href } }] : [];
        }
        if (["textStyle", "highlight"].includes(value.type)) {
          const color = value.attrs?.color;
          return typeof color === "string" && /^#[a-f0-9]{3,8}$/i.test(color)
            ? [{ type: value.type, attrs: { color } }]
            : [];
        }
        return [{ type: value.type }];
      });
    return result;
  }
  const result = walk(value, 0);
  if (result.type !== "doc") throw new Error("INVALID_DOCUMENT");
  return result;
}
