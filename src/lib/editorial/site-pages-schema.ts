import { z } from "zod";
export const sitePageInput = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[\p{L}\p{N}_-]+$/u),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(500),
    content_json: z.unknown(),
    is_published: z.boolean(),
  })
  .strict();
export type SitePage = z.infer<typeof sitePageInput> & {
  id: string;
  version: number;
  updated_at: string;
};
export function sitePagePath(slug: string) {
  return ["about", "privacy"].includes(slug) ? "/" + slug : "/pages/" + slug;
}
