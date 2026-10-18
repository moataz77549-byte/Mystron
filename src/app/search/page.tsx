import { publicDatabase } from "@/lib/supabase";
import { categories } from "@/lib/content";
import { posts } from "@/lib/content";
import { databaseConfigured } from "@/lib/env";
import { Empty, PostCard } from "@/components/content";
import Link from "next/link";
import { HybridSearch } from "@/components/ai/search";
export const metadata = { title: "البحث", robots: { index: false } };
export default async function Search({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  let result: Awaited<ReturnType<typeof posts>> | null = null;
  let error = false;
  if (databaseConfigured()) {
    try {
      result = await posts(p);
    } catch {
      error = true;
    }
  }
  const cats = databaseConfigured() ? await categories().catch(() => []) : [];
  const authors = databaseConfigured()
    ? (
        await publicDatabase()
          .from("authors")
          .select("slug,display_name")
          .eq("is_active", true)
          .is("deleted_at", null)
      ).data || []
    : [];
  return (
    <section className="prose" style={{ maxWidth: "none" }}>
      <h1>ابحث بين السطور</h1>
      <form action="/search" className="search-form">
        <label style={{ flex: 1 }}>
          العنوان والملخص والمحتوى
          <input
            name="q"
            defaultValue={p.q || ""}
            maxLength={100}
            placeholder="ما الذي تود قراءته؟"
          />
        </label>
        <label>
          القسم
          <select name="category" defaultValue={p.category || ""}>
            <option value="">جميع الأقسام</option>
            {cats.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          الكاتب
          <select name="author" defaultValue={p.author || ""}>
            <option value="">جميع الكتّاب</option>
            {authors.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          الترتيب
          <select name="sort" defaultValue={p.sort || "newest"}>
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
          </select>
        </label>
        <button className="button" type="submit">
          بحث
        </button>
      </form>
      {process.env.AI_ENABLED === "true" && p.q && (
        <HybridSearch query={p.q.slice(0, 100)} />
      )}
      {result?.data.length ? (
        <>
          <div className="grid">
            {result.data.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          <div className="pagination">
            {result.page > 1 && (
              <Link
                href={
                  "/search?" +
                  new URLSearchParams({
                    q: p.q || "",
                    ...(p.category ? { category: p.category } : {}),
                    ...(p.author ? { author: p.author } : {}),
                    ...(p.sort ? { sort: p.sort } : {}),
                    page: String(result.page - 1),
                  })
                }
              >
                السابق
              </Link>
            )}
            {result.total > result.page * result.pageSize && (
              <Link
                href={
                  "/search?" +
                  new URLSearchParams({
                    q: p.q || "",
                    ...(p.category ? { category: p.category } : {}),
                    ...(p.author ? { author: p.author } : {}),
                    ...(p.sort ? { sort: p.sort } : {}),
                    page: String(result.page + 1),
                  })
                }
              >
                التالي
              </Link>
            )}
          </div>
        </>
      ) : (
        <Empty
          title={
            error
              ? "تعذّر البحث"
              : !databaseConfigured()
                ? "البحث قيد التجهيز"
                : "لا توجد نتائج"
          }
          description={
            error
              ? "تحقق من خيارات البحث وحاول لاحقاً."
              : "تظهر هنا التدوينات المنشورة المتاحة للقراءة."
          }
        />
      )}
    </section>
  );
}
