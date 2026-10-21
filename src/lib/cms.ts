import "server-only";
import { z } from "zod";
import { sitePageInput } from "./editorial/site-pages-schema";
import { sourceSchema } from "./editor/sources";
import { revalidatePath } from "next/cache";
import { authorizedUser } from "./auth";
import {
  validateDocument,
  renderDocument,
  documentText,
  documentMedia,
  safeLink,
} from "./editor/document";
const uuid = z.uuid();
const nullableId = uuid.nullable();
const short = z.string().max(300);
const url = z
  .string()
  .max(2000)
  .refine((v) => !v || !!safeLink(v), "رابط غير صالح")
  .nullable();
export const postPatch = z
  .object({
    title: z.string().min(1).max(300),
    slug: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[\p{L}\p{N}_-]+$/u),
    subtitle: short.nullable().optional(),
    excerpt: z.string().max(2000).nullable().optional(),
    content_json: z.unknown().optional(),
    author_id: nullableId.optional(),
    primary_category_id: nullableId.optional(),
    category_ids: z.array(uuid).max(30).optional(),
    cover_asset_id: nullableId.optional(),
    thumbnail_asset_id: nullableId.optional(),
    share_asset_id: nullableId.optional(),
    tags: z.array(z.string().max(80)).max(30).optional(),
    editorial_keywords: z.array(z.string().max(80)).max(30).optional(),
    sources: z.array(sourceSchema).max(50).optional(),
    seo_title: z.string().max(200).nullable().optional(),
    seo_description: z.string().max(500).nullable().optional(),
    canonical_url: url.optional(),
    sharing: z
      .object({
        facebook: z.boolean().optional(),
        x: z.boolean().optional(),
        telegram: z.boolean().optional(),
        whatsapp: z.boolean().optional(),
        webshare: z.boolean().optional(),
        copy: z.boolean().optional(),
      })
      .strict()
      .optional(),
    visibility: z.enum(["public", "private"]).optional(),
    featured: z.boolean().optional(),
    allow_comments: z.boolean().optional(),
    comments_close_at: z.iso.datetime().nullable().optional(),
  })
  .strict();
const categoryPatch = z
  .object({
    name: short,
    slug: short.regex(/^[\p{L}\p{N}_-]+$/u),
    description: z.string().max(3000).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    sort_order: z.number().int().min(-10000).max(10000).optional(),
    is_active: z.boolean().optional(),
    parent_id: nullableId.optional(),
    image_asset_id: nullableId.optional(),
    icon: short.nullable().optional(),
    action: z.enum(["save", "delete", "restore"]).optional(),
  })
  .strict();
const authorPatch = z
  .object({
    display_name: short,
    short_name: short.nullable().optional(),
    slug: short.regex(/^[\p{L}\p{N}_-]+$/u),
    bio: z.string().max(10000).nullable().optional(),
    specialty: z.string().trim().max(200).nullable().optional(),
    country: short.nullable().optional(),
    city: short.nullable().optional(),
    website: url.optional(),
    links: z
      .record(
        z.string().max(40),
        z
          .string()
          .max(2000)
          .refine((v) => !!safeLink(v)),
      )
      .optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().optional(),
    avatar_asset_id: nullableId.optional(),
    action: z.enum(["save", "delete", "restore"]).optional(),
  })
  .strict();
const tickerPatch = z
  .object({
    text: z.string().min(1).max(500),
    url: url.optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().optional(),
    starts_at: z.iso.datetime().optional(),
    ends_at: z.iso.datetime().nullable().optional(),
    image_asset_id: nullableId.optional(),
    style: z.enum(["navy", "gold", "teal", "burgundy"]).optional(),
    pages: z.array(z.string().max(200)).max(30).optional(),
    placement: z
      .enum([
        "ticker",
        "top",
        "home",
        "article",
        "article_after",
        "sidebar",
        "footer",
      ])
      .optional(),
    sponsored: z.boolean().optional(),
    action: z.enum(["save", "delete"]).optional(),
  })
  .strict();
const base = z
  .object({
    id: uuid.nullable().optional(),
    version: z.number().int().positive().optional(),
    patch: z.unknown().optional(),
    action: z.string().optional(),
    scheduled_at: z.iso.datetime().nullable().optional(),
    transfer_to: nullableId.optional(),
    items: z
      .array(z.object({ id: uuid, version: z.number().int() }))
      .max(50)
      .optional(),
  })
  .strict();
export async function cmsCommand(resource: string, raw: unknown) {
  const identity = await authorizedUser();
  if (!identity) throw new Error("UNAUTHORIZED");
  const b = base.parse(raw);
  let rpc: string;
  let args: Record<string, unknown>;
  if (resource === "posts") {
    rpc = "cms_save_post";
    const patch = postPatch.parse(b.patch);
    const doc =
      patch.content_json === undefined
        ? undefined
        : validateDocument(patch.content_json);
    args = {
      p_id: b.id || null,
      p_expected_version: b.version || null,
      p_patch: {
        ...patch,
        ...(doc
          ? {
              content_json: doc,
              content_html: renderDocument(doc),
              content: documentText(doc),
              media_ids: documentMedia(doc),
            }
          : {}),
      },
    };
  } else if (resource === "pages") {
    const patch = sitePageInput.parse(b.patch);
    rpc = "cms_save_page";
    args = {
      p_id: b.id || null,
      p_expected_version: b.version || null,
      p_patch: { ...patch, content_json: validateDocument(patch.content_json) },
    };
  } else if (resource === "transitions") {
    rpc = "cms_transition_post";
    args = {
      p_id: uuid.parse(b.id),
      p_expected_version: z.number().int().parse(b.version),
      p_action: z
        .enum([
          "approve",
          "publish",
          "unpublished",
          "review",
          "scheduled",
          "archived",
          "delete",
          "restore",
          "duplicate",
          "draft",
        ])
        .parse(b.action),
      p_scheduled_at: b.scheduled_at || null,
    };
  } else if (resource === "revisions") {
    rpc = "cms_restore_revision";
    args = {
      p_revision_id: uuid.parse(b.id),
      p_expected_version: z.number().int().parse(b.version),
    };
  } else if (resource === "categories") {
    rpc = "cms_save_category";
    args = {
      p_id: b.id || null,
      p_patch: categoryPatch.parse(b.patch),
      p_transfer_to: b.transfer_to || null,
    };
  } else if (resource === "category-transfer") {
    rpc = "cms_move_category_posts";
    args = { p_from: uuid.parse(b.id), p_to: uuid.parse(b.transfer_to) };
  } else if (resource === "authors") {
    rpc = "cms_save_author";
    args = { p_id: b.id || null, p_patch: authorPatch.parse(b.patch) };
  } else if (resource === "ticker") {
    rpc = "cms_save_ticker";
    args = { p_id: b.id || null, p_patch: tickerPatch.parse(b.patch) };
  } else if (resource === "comments") {
    rpc = "cms_moderate_comment";
    args = {
      p_id: uuid.parse(b.id),
      p_action: z
        .enum(["approved", "rejected", "hidden", "delete"])
        .parse(b.action),
    };
  } else if (resource === "bulk") {
    rpc = "cms_bulk_transition";
    args = {
      p_items: b.items,
      p_action: z
        .enum([
          "publish",
          "unpublished",
          "review",
          "archived",
          "delete",
          "restore",
        ])
        .parse(b.action),
    };
  } else if (resource === "media") {
    rpc = "cms_update_media";
    args = {
      p_id: uuid.parse(b.id),
      p_patch: z
        .object({
          display_name: short.optional(),
          alt_text: short.nullable().optional(),
          caption: z.string().max(2000).nullable().optional(),
          folder: short.optional(),
          action: z.enum(["save", "delete"]).optional(),
        })
        .strict()
        .parse(b.patch),
    };
  } else if (resource === "publishing") {
    rpc = "cms_publishing_settings";
    args = {
      p_value: z
        .object({
          timezone: z.literal("Asia/Aden"),
          default_comments: z.boolean(),
          comments_close_days: z.number().int().min(0).max(3650),
          default_visibility: z.enum(["public", "private"]),
          view_retention_days: z.literal(30),
        })
        .strict()
        .parse(b.patch),
    };
  } else throw new Error("NOT_FOUND");
  const { data, error } = await identity.db.rpc(rpc, args);
  if (error) {
    if (
      (resource === "categories" || resource === "authors") &&
      error.message.includes("UNKNOWN_FIELD") &&
      ((b.patch as Record<string, unknown>)?.color !== undefined ||
        (b.patch as Record<string, unknown>)?.specialty !== undefined)
    )
      throw new Error("SCHEMA_UPDATE_REQUIRED");
    const known = [
      "PIN_SETUP_REQUIRED",
      "PIN_VERIFICATION_REQUIRED",
      "VERSION_CONFLICT",
      "FORBIDDEN",
      "NOT_FOUND",
      "PUBLICATION_INCOMPLETE",
      "INVALID_SCHEDULE",
      "CATEGORY_IN_USE",
      "CATEGORY_CYCLE",
      "AUTHOR_IN_USE",
      "MEDIA_IN_USE",
      "INVALID_MEDIA",
      "SLUG_RESERVED",
      "POST_DELETED",
      "APPROVAL_REQUIRES_REVIEW",
    ];
    throw new Error(
      known.find((c) => error.message.includes(c)) || "INVALID_OPERATION",
    );
  }
  revalidatePath("/", "layout");
  return data;
}
