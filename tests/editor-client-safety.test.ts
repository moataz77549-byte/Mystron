import { expect, it } from "vitest";
import {
  cleanEditorDocument,
  editorVideo,
  editorImage,
} from "../src/lib/editor/client-document";
import { parseBrowserDraft } from "../src/lib/editor/browser-draft";
it("keeps exact Arabic text while blocking tracking media, unsafe embeds and styles before editor rendering", () => {
  const text = "بِسْمِ اللَّهِ — Arabic / English 2026";
  const doc = cleanEditorDocument({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {
          dir: "rtl",
          textAlign: "left;background:url(https://attacker.test)",
        },
        content: [
          {
            type: "text",
            text,
            marks: [
              { type: "link", attrs: { href: "javascript:alert(1)" } },
              {
                type: "textStyle",
                attrs: { color: "red;url(https://attacker.test)" },
              },
            ],
          },
        ],
      },
      {
        type: "image",
        attrs: { src: "https://attacker.test/tracker.svg", onload: "danger" },
      },
      { type: "video", attrs: { src: "https://attacker.test/embed/x" } },
    ],
  });
  expect(doc.content?.[0].content?.[0].text).toBe(text);
  expect(JSON.stringify(doc)).not.toMatch(/attacker|javascript|onload/);
  expect(
    editorVideo("https://www.youtube-nocookie.com/embed/abcdefghijk"),
  ).not.toBeNull();
  expect(
    editorVideo("https://www.youtube-nocookie.com:444/embed/abcdefghijk"),
  ).toBeNull();
  expect(editorImage("../secret")).toBeNull();
});
it("binds browser recovery to both user and post and keeps the base version for conflict review", () => {
  const draft = {
    schema: 2,
    userId: "owner-a",
    postId: "post-a",
    baseVersion: 3,
    at: 100,
    title: "مسودة",
    slug: "draft",
    extras: {},
    doc: { type: "doc", content: [{ type: "paragraph" }] },
  };
  expect(
    parseBrowserDraft(JSON.stringify(draft), "owner-b", "post-a"),
  ).toBeNull();
  expect(
    parseBrowserDraft(JSON.stringify(draft), "owner-a", "post-b"),
  ).toBeNull();
  expect(
    parseBrowserDraft(JSON.stringify(draft), "owner-a", "post-a")?.baseVersion,
  ).toBe(3);
  expect(parseBrowserDraft("broken", "owner-a", "post-a")).toBeNull();
});
