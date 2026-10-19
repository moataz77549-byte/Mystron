/** Shared text extraction: structured literary nodes participate in reading time,
 * search, accessibility and knowledge indexing just like paragraphs. */
type TextNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TextNode[];
};
export function richText(node: TextNode): string {
  if (node.type === "text") return node.text || "";
  const keys =
    node.type === "poetryVerse"
      ? ["first", "second"]
      : node.type === "citation"
        ? ["quote", "author", "book", "page"]
        : node.type === "callout"
          ? ["title"]
          : node.type === "image"
            ? ["alt", "caption"]
            : [];
  return [
    ...keys.map((key) =>
      typeof node.attrs?.[key] === "string" ? (node.attrs[key] as string) : "",
    ),
    ...(node.content || []).map(richText),
  ]
    .filter(Boolean)
    .join(" ");
}
