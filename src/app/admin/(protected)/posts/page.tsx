import { requireAdmin } from "@/lib/auth";
import PostList from "@/components/editor/post-list";
export default async function Page() {
  const { db, permissions } = await requireAdmin();
  const { data, error } = await db.rpc("admin_post_list", {
    p_page: 1,
    p_q: "",
    p_status: "",
  });
  if (error) throw new Error("تعذر تحميل التدوينات");
  return (
    <PostList
      initial={data.rows}
      create={!!permissions["posts.create"]}
      publisher={!!permissions["posts.publish"]}
    />
  );
}
