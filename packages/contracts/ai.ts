import { z } from "zod";
export const summaryTypes = [
  "short",
  "medium",
  "detailed",
  "points",
  "ideas",
] as const;
export const editorialActions = [
  "title",
  "rewrite",
  "proofread",
  "shorten",
  "expand",
  "seo",
  "excerpt",
  "tags",
  "headings",
  "image",
  "social",
] as const;
export const chatInput = z
  .object({
    message: z.string().trim().min(2).max(2000),
    post_id: z.uuid().optional(),
    stream: z.boolean().optional(),
  })
  .strict();
export const searchInput = z
  .object({
    message: z.string().trim().min(2).max(100),
    related_post_id: z.uuid().optional(),
  })
  .strict();
export const summaryInput = z
  .object({
    post_id: z.uuid(),
    type: z.enum(summaryTypes).default("short"),
    stream: z.boolean().optional(),
  })
  .strict();
export const editorialInput = z
  .object({
    post_id: z.uuid(),
    action: z.enum(editorialActions),
    selection: z.string().max(8000).optional(),
  })
  .strict();
export const aiSettings = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(["compatible", "botkeep"]),
    model: z.string().max(200),
    embedding_model: z.string().max(200),
    streaming: z.boolean(),
    max_output_tokens: z.number().int().min(64).max(4096),
    daily_requests: z.number().int().min(1).max(100000),
    monthly_requests: z.number().int().min(1).max(1000000),
    daily_tokens: z.number().int().min(1000).max(100000000),
    session_requests: z.number().int().min(1).max(1000),
    visitor_requests: z.number().int().min(1).max(1000),
    admin_requests: z.number().int().min(1).max(10000),
    allow_private_editorial: z.boolean(),
    language: z.enum(["ar", "en"]),
  })
  .strict();
export type AISettings = z.infer<typeof aiSettings>;
export type Citation = {
  id: number;
  post_id: string;
  title: string;
  url: string;
  quote: string;
};
export type AIAnswer = {
  answer: string;
  sources: Citation[];
  request_id: string;
  automated: true;
  retrieval: "hybrid" | "keyword";
  cached?: boolean;
};
