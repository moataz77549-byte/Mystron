import { z } from "zod";
export const reportQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    status: z.enum(["pending", "resolved", "all"]).default("pending"),
  })
  .strict();
export const reportAction = z
  .object({
    id: z.uuid(),
    action: z.enum(["dismissed", "hidden", "rejected"]),
  })
  .strict();
export type ReportPage = {
  rows: {
    id: string;
    comment_id: string;
    reason: string;
    created_at: string;
    resolved_at: string | null;
    resolution: string | null;
    body: string;
    guest_name: string;
    comment_status: string;
    post_id: string;
    post_title: string;
  }[];
  total: number;
  page: number;
  page_size: number;
};
