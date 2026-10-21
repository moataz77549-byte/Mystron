import { z } from "zod";
export const postStates = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "unpublished",
  "archived",
  "trash",
] as const;
export const postLabels: Record<string, string> = {
  draft: "مسودة",
  review: "قيد المراجعة",
  approved: "معتمد تحريرياً",
  scheduled: "مجدولة",
  published: "منشورة",
  unpublished: "غير منشورة",
  archived: "مؤرشفة",
  trash: "محذوفة مؤقتاً",
};
export const postSorts: Record<string, string> = {
  updated: "آخر تعديل",
  created: "الأحدث إنشاءً",
  oldest: "الأقدم تعديلاً",
  title: "العنوان",
  published: "تاريخ النشر",
  views: "الأكثر مشاهدة",
};
const optionalId = z.union([z.uuid(), z.literal("")]).default("");
const optionalDate = z.union([z.iso.date(), z.literal("")]).default("");
export const postQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    q: z.string().max(100).default(""),
    status: z.enum(["", ...postStates]).default(""),
    author_id: optionalId,
    category_id: optionalId,
    from: optionalDate,
    to: optionalDate,
    sort: z
      .enum(["updated", "created", "oldest", "title", "published", "views"])
      .default("updated"),
    page_size: z.coerce
      .number()
      .refine((n) => [25, 50, 100].includes(n))
      .default(25),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "INVALID_PERIOD",
  });
export type PostQuery = z.infer<typeof postQuerySchema>;
export function postListArguments(query: PostQuery) {
  const { page, q, status, ...filters } = query;
  return { p_page: page, p_q: q, p_status: status, p_filters: filters };
}
