import { notFound, permanentRedirect } from "next/navigation";
import { slugRedirect } from "@/lib/public-catalog";
import { categories, posts } from "@/lib/content";
import { databaseConfigured } from "@/lib/env";
import { Empty, PostCard } from "@/components/content";
import Image from "next/image";
import Link from "next/link";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title: databaseConfigured()
      ? (await categories()).find((c) => c.slug === slug)?.name || "القسم"
      : "القسم",
    alternates: { canonical: "/categories/" + slug },
  };
}
export default async function Category({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  if (!databaseConfigured())
    return (
      <div className="prose">
        <Empty title="الأقسام قيد التجهيز" />
      </div>
    );
  const { slug } = await params;
  const c = (await categories()).find((c) => c.slug === slug);
  if (!c) {
    const r = await slugRedirect("category", slug);
    if (r) permanentRedirect("/categories/" + r);
    notFound();
  }
  const p = await searchParams;
  const result = await posts({ category: slug, page: p.page });
  return (
    <section className="prose" style={{ maxWidth: "none" }}>
      <h1>{c.name}</h1>
      {c.image_asset_id && (
        <Image
          src={`/api/v1/media/${c.image_asset_id}?variant=optimized`}
          width={900}
          height={500}
          sizes="100vw"
          alt={c.name}
        />
      )}
      <p>{c.description}</p>
      {result.data.length ? (
        <div className="grid">
          {result.data.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <Empty />
      )}
      <div className="pagination">
        {result.page > 1 && (
          <Link href={"?page=" + String(result.page - 1)}>السابق</Link>
        )}
        {result.total > result.page * result.pageSize && (
          <Link href={"?page=" + String(result.page + 1)}>التالي</Link>
        )}
      </div>
    </section>
  );
}
