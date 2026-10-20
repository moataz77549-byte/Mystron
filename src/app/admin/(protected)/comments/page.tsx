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
  const result = await db.rpc("admin_comment_list", {
    p_page: page,
    p_status: status,
  });
  if (result.error) throw new Error("تعذر تحميل التعليقات");
  return (
    <Moderation
      key={page + ":" + status}
      initial={result.data.rows}
      page={page}
      total={result.data.total}
      filter={status}
    />
  );
}
