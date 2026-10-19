import type { JSONContent } from "@tiptap/core";
import { cleanEditorDocument } from "./client-document";
import { z } from "zod";
import { sourceSchema } from "./sources";
const extrasSchema = z
  .object({
    author_id: z.uuid().nullable(),
    primary_category_id: z.uuid().nullable(),
    category_ids: z.array(z.uuid()).max(30),
    excerpt: z.string().max(2000),
    subtitle: z.string().max(300),
    seo_title: z.string().max(200),
    seo_description: z.string().max(500),
    tags: z.array(z.string().max(80)).max(30),
    editorial_keywords: z.array(z.string().max(80)).max(30),
    comments_close_at: z.iso.datetime().nullable(),
    sources: z.array(sourceSchema).max(50),
    cover_asset_id: z.uuid().nullable(),
    thumbnail_asset_id: z.uuid().nullable(),
    share_asset_id: z.uuid().nullable(),
    canonical_url: z.string().max(2000),
    visibility: z.enum(["public", "private"]),
    featured: z.boolean(),
    allow_comments: z.boolean(),
    sharing: z.record(z.string(), z.boolean()),
  })
  .partial()
  .strict();
export type BrowserDraft = {
  schema: 2;
  userId: string;
  postId: string;
  baseVersion: number;
  at: number;
  title: string;
  slug: string;
  extras: Record<string, unknown>;
  doc: JSONContent;
};
export const browserDraftKey = (userId: string, postId: string) =>
  `maystroon-draft-v2:${userId}:${postId}`;
export function parseBrowserDraft(
  raw: string | null,
  userId: string,
  postId: string,
): BrowserDraft | null {
  try {
    if (!raw || raw.length > 1000000) return null;
    const value = JSON.parse(raw);
    if (
      value.schema !== 2 ||
      value.userId !== userId ||
      value.postId !== postId ||
      !Number.isInteger(value.baseVersion) ||
      !Number.isFinite(value.at) ||
      typeof value.title !== "string" ||
      value.title.length > 300 ||
      typeof value.slug !== "string" ||
      value.slug.length > 200 ||
      !value.extras ||
      typeof value.extras !== "object" ||
      Array.isArray(value.extras)
    )
      return null;
    return {
      ...value,
      extras: extrasSchema.parse(value.extras),
      doc: cleanEditorDocument(value.doc),
    };
  } catch {
    return null;
  }
}
export function subscribeBrowserDraft(listener: () => void) {
  addEventListener("storage", listener);
  addEventListener("maystroon-draft-change", listener);
  return () => {
    removeEventListener("storage", listener);
    removeEventListener("maystroon-draft-change", listener);
  };
}
export function readBrowserDraft(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function storeBrowserDraft(key: string, value: BrowserDraft | null) {
  if (value) localStorage.setItem(key, JSON.stringify(value));
  else localStorage.removeItem(key);
  dispatchEvent(new Event("maystroon-draft-change"));
}
/** Legacy drafts can be offered explicitly only for the post already authorized
 * by the server. Never enumerate another account's browser draft keys. */
export function parseLegacyDraft(
  raw: string | null,
  userId: string,
  postId: string,
) {
  try {
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value.schema !== undefined) return null;
    return parseBrowserDraft(
      JSON.stringify({ ...value, schema: 2, userId, postId, baseVersion: 0 }),
      userId,
      postId,
    );
  } catch {
    return null;
  }
}
