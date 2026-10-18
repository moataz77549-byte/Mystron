import "server-only";
import { publicDatabase } from "../supabase";
import { z } from "zod";
const schema = z
  .object({
    enabled: z.boolean(),
    replies: z.boolean(),
    max_depth: z.number().int().min(0).max(3),
    pre_moderation: z.boolean(),
    close_days: z.number().int().min(0).max(3650),
  })
  .strict();
export async function publicCommentOptions() {
  const { data, error } = await publicDatabase().rpc("public_comment_options");
  const result = schema.safeParse(data);
  return !error && result.success
    ? result.data
    : {
        enabled: false,
        replies: false,
        max_depth: 0,
        pre_moderation: true,
        close_days: 0,
      };
}
