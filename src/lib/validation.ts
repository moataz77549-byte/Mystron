import { z } from "zod";
export const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  category: z
    .string()
    .regex(/^[\p{L}\p{N}_-]+$/u)
    .or(z.literal(""))
    .optional(),
  author: z
    .string()
    .regex(/^[\p{L}\p{N}_-]+$/u)
    .or(z.literal(""))
    .optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});
export const pinSchema = z
  .string()
  .regex(/^\d{6,12}$/, "استخدم من 6 إلى 12 رقماً");
export const uploadSchema = z.object({
  type: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});
