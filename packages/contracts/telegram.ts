import { z } from "zod";
const sender = z
  .object({ id: z.number().int().positive(), is_bot: z.boolean().optional() })
  .passthrough();
const chat = z
  .object({ id: z.number().int().positive(), type: z.literal("private") })
  .passthrough();
const file = z
  .object({
    file_id: z.string().min(1).max(256),
    file_size: z.number().int().nonnegative().optional(),
  })
  .passthrough();
const message = z
  .object({
    message_id: z.number().int(),
    chat,
    from: sender.optional(),
    text: z.string().max(5000).optional(),
    caption: z.string().max(2000).optional(),
    photo: z.array(file).max(10).optional(),
    document: file
      .extend({ file_name: z.string().max(300).optional() })
      .optional(),
  })
  .passthrough();
export const telegramUpdate = z
  .object({
    update_id: z.number().int().nonnegative(),
    message: message.optional(),
    callback_query: z
      .object({
        id: z.string().max(100),
        from: sender,
        message: message.optional(),
        data: z.string().max(64).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .refine((u) => Boolean(u.message || u.callback_query));
export type TelegramUpdate = z.infer<typeof telegramUpdate>;
export type BotReply = {
  text: string;
  keyboard?: { text: string; callback_data?: string; url?: string }[][];
  edit_message_id?: number;
  callback_query_id?: string;
  auth_fingerprint?: string;
  permission?: string;
  post_ids?: string[];
};
