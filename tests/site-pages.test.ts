import { it, expect } from "vitest";
import {
  sitePageInput,
  sitePagePath,
} from "../src/lib/editorial/site-pages-schema";
import { renderDocument } from "../src/lib/editor/document";
it("preserves canonical legacy page URLs and validates page input without raw HTML", () => {
  expect(sitePagePath("privacy")).toBe("/privacy");
  expect(sitePagePath("سياسة-التحرير")).toBe("/pages/سياسة-التحرير");
  const page = {
    slug: "about",
    title: "حول المنصة",
    description: "",
    is_published: false,
    content_json: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "<script>alert(1)</script>" }],
        },
      ],
    },
  };
  expect(sitePageInput.parse(page).title).toBe("حول المنصة");
  expect(renderDocument(page.content_json)).not.toContain("<script>");
  expect(
    sitePageInput.safeParse({ ...page, content_html: "<script>" }).success,
  ).toBe(false);
  expect(
    sitePageInput.safeParse({ ...page, slug: "../../admin" }).success,
  ).toBe(false);
});
