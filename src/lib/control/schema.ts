import { z } from "zod";
export const menuSchema = z
  .object({
    parent_id: z.uuid().nullable(),
    location: z.enum(["header", "mobile", "footer", "secondary"]),
    label: z.string().min(1).max(100),
    target_type: z.enum(["page", "category", "external"]),
    href: z.string().max(2000).nullable(),
    category_id: z.uuid().nullable(),
    is_active: z.boolean(),
    sort_order: z.number().int().min(-10000).max(10000),
  })
  .strict();
export const userSchema = z
  .object({
    user_id: z.uuid(),
    role_id: z.uuid().nullable(),
    enabled: z.boolean(),
    scope: z.enum(["all", "restricted"]),
    category_ids: z.array(z.uuid()).max(50),
    revoke: z.boolean(),
  })
  .strict();
export const inviteSchema = z
  .object({
    email: z.email().max(254),
    role_id: z.uuid(),
    scope: z.enum(["all", "restricted"]),
    category_ids: z.array(z.uuid()).max(50),
    hours: z.number().int().min(1).max(168),
  })
  .strict();
export const roleSchema = z
  .object({
    role_id: z.uuid(),
    permission: z.string().max(100),
    scope: z.enum(["own", "all"]),
    enabled: z.boolean(),
  })
  .strict();
export const userPermissionSchema = z
  .object({
    user_id: z.uuid(),
    permission: z.string().max(100),
    scope: z.enum(["own", "all"]),
    enabled: z.boolean(),
    effect: z.enum(["allow", "deny"]),
  })
  .strict();
export const integrationSchema = z
  .object({
    id: z.enum([
      "supabase",
      "vercel",
      "telegram",
      "botkeep",
      "ai",
      "analytics",
    ]),
    enabled: z.boolean(),
    config: z
      .object({
        label: z.string().max(100).optional(),
        note: z.string().max(500).optional(),
      })
      .strict(),
  })
  .strict();
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
