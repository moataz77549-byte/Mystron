import { z } from "zod";
export const tagQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    q: z.string().max(80).default(""),
  })
  .strict();
export const tagMerge = z
  .object({
    source: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => !!value.trim()),
    target: z.string().trim().min(1).max(80),
    expected_count: z.number().int().min(0).max(500),
  })
  .strict()
  .refine((value) => value.source !== value.target);
export type TagPage = {
  rows: { tag: string; posts: number; editable_posts: number }[];
  total: number;
  page: number;
  page_size: number;
};
