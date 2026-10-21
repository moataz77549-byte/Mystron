import { z } from "zod";

/** Actual v1 public read response, shared by API tests and the Android fixture. */
export const publicAuthorDto = z.object({
  display_name: z.string(),
  slug: z.string(),
  bio: z.string().nullable().optional(),
});
export const publicCategoryDto = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
});
export const publicPostDto = z.object({
  id: z.uuid(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable().optional(),
  subtitle: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  content_json: z.record(z.string(), z.unknown()).nullable().optional(),
  cover_image: z.string().nullable().optional(),
  cover_asset_id: z.uuid().nullable().optional(),
  thumbnail_asset_id: z.uuid().nullable().optional(),
  published_at: z.iso.datetime({ offset: true }).nullable().optional(),
  reading_minutes: z.number().int().nullable().optional(),
  authors: publicAuthorDto.nullable(),
  featured: z.boolean(),
  tags: z.array(z.string()),
  sources: z.array(z.record(z.string(), z.unknown())),
});
export const publicPostPageDto = z.object({
  data: z.array(publicPostDto),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(50),
});
export type PublicPostDto = z.infer<typeof publicPostDto>;
export type PublicPostPageDto = z.infer<typeof publicPostPageDto>;
