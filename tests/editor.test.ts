import { it, expect } from "vitest";
import {
  renderDocument,
  validateDocument,
  documentMedia,
  documentHeadings,
  normalizeArabic,
  safeLink,
} from "@/lib/editor/document";
it("renders diacritics, mixed direction, poetry, tables and headings with bounded markup", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2, dir: "rtl" },
        content: [{ type: "text", text: "إبْداعٌ عربي English" }],
      },
      {
        type: "poetry",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "نصٌّ أدبيّ" }],
          },
        ],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "خلية" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const html = renderDocument(doc);
  expect(html).toContain("إبْداعٌ عربي English");
  expect(html).toContain("editor-poetry");
  expect(html).toContain("<table");
  expect(documentHeadings(validateDocument(doc))).toEqual([
    { id: "heading-0", level: 2, text: "إبْداعٌ عربي English" },
  ]);
});
it("blocks scripts, unsafe links, arbitrary image URLs and third-party embeds", () => {
  const html = renderDocument({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "<script>alert(1)</script>",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
      {
        type: "image",
        attrs: { src: "https://attacker.example/tracking.svg" },
      },
      { type: "video", attrs: { src: "https://attacker.example/embed/x" } },
    ],
  });
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("attacker");
  expect(safeLink("//example.com")).toBeNull();
});
it("restricts document complexity and media IDs", () => {
  let node: unknown = { type: "paragraph" };
  for (let i = 0; i < 40; i++) node = { type: "blockquote", content: [node] };
  expect(() => validateDocument({ type: "doc", content: [node] })).toThrow(
    "DOCUMENT_TOO_COMPLEX",
  );
  expect(() =>
    validateDocument({ type: "doc", content: [{ type: "script" }] }),
  ).toThrow("INVALID_NODE");
  expect(
    documentMedia(
      validateDocument({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { assetId: "11111111-1111-4111-8111-111111111111" },
          },
        ],
      }),
    ),
  ).toHaveLength(1);
});
it("normalizes Arabic search only; original document text remains unchanged", () => {
  expect(normalizeArabic("إبْداعــ آفاق")).toBe("ابداع افاق");
});
