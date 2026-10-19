import { z } from "zod";
const webLink = z
  .string()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "رابط غير صالح");
export const sourceSchema = z
  .object({
    title: z.string().max(300),
    url: webLink.default(""),
    author: z.string().max(300).optional(),
    page: z.string().max(100).optional(),
    published_at: z.union([z.iso.date(), z.literal("")]).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type EditorialSource = z.infer<typeof sourceSchema>;
