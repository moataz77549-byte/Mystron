import { requirePermission } from "@/lib/auth";
import { TagsManager } from "@/components/editor/tags";
import type { TagPage } from "@/lib/editorial/tag-schema";
export default async function TagsPage() {
  const { db, permissions } = await requirePermission("posts.read");
  const result = await db.rpc("admin_tag_list", { p_page: 1, p_q: "" });
  if (result.error)
    return (
      <p role="alert">
        تعذر تحميل الوسوم. تحقق من تطبيق تحديث قاعدة البيانات الخاص بهذه النسخة.
      </p>
    );
  return (
    <TagsManager
      initial={result.data as TagPage}
      canUpdate={!!permissions["posts.update"]}
    />
  );
}
