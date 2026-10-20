import { requirePermission } from "@/lib/auth";
import Moderation from "@/components/editor/moderation";
import { z } from "zod";
const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    status: z
      .enum(["pending", "approved", "rejected", "hidden", "all"])
      .default("pending"),
  })
  .strict();
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await requirePermission("comments.moderate");
  const parsed = querySchema.safeParse(await searchParams);
  if (!parsed.success) return <p role="alert">فلاتر التعليقات غير صالحة.</p>;
  const { page, status } = parsed.data;
  let query = db
    .from("comments")
    .select("id,guest_name,body,status,post_id,deleted_at", { count: "exact" })
    .is("deleted_at", null);
  if (status !== "all") query = query.eq("status", status);
  const result = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 25, page * 25 - 1);
  if (result.error) throw new Error("تعذر تحميل التعليقات");
  return (
    <Moderation
      key={page + ":" + status}
      initial={result.data}
      page={page}
      total={result.count || 0}
      filter={status}
    />
  );
}
