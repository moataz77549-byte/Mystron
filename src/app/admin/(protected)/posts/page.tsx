import { requireAdmin } from "@/lib/auth";
import PostList from "@/components/editor/post-list";
import { postListArguments, postQuerySchema } from "@/lib/editorial/post-query";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db, permissions } = await requireAdmin();
  const parsed = postQuerySchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <p role="alert">
        فلاتر غير صالحة. افتح قائمة المقالات دون معاملات إضافية.
      </p>
    );
  const query = parsed.data;
  const [{ data, error }, authors, categories] = await Promise.all([
    db.rpc("admin_post_list_filtered", postListArguments(query)),
    db
      .from("authors")
      .select("id,display_name")
      .is("deleted_at", null)
      .order("display_name"),
    db
      .from("categories")
      .select("id,name")
      .is("deleted_at", null)
      .order("sort_order"),
  ]);
  if (error) throw new Error("تعذر تحميل التدوينات");
  return (
    <PostList
      key={JSON.stringify(query)}
      initial={data.rows}
      initialTotal={data.total}
      initialQuery={query}
      authors={(authors.data || []).map((author) => ({
        id: author.id,
        name: author.display_name,
      }))}
      categories={categories.data || []}
      analytics={!!permissions["analytics.read"]}
      create={!!permissions["posts.create"]}
      publisher={!!permissions["posts.publish"]}
    />
  );
}
