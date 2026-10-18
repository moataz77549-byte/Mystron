import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { publicAuthor, slugRedirect } from "@/lib/public-catalog";
import { databaseConfigured } from "@/lib/env";
import { posts } from "@/lib/content";
import { PostCard, Empty } from "@/components/content";
import { safeLink } from "@/lib/editor/document";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!databaseConfigured()) return {};
  const a = await publicAuthor((await params).slug);
  return a
    ? {
        title: a.display_name,
        description: a.bio,
        alternates: { canonical: `/authors/${a.slug}` },
      }
    : {};
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!databaseConfigured()) notFound();
  const { slug } = await params;
  const a = await publicAuthor(slug);
  if (!a) {
    const r = await slugRedirect("author", slug);
    if (r) permanentRedirect(`/authors/${r}`);
    notFound();
  }
  const p = await posts({ ...(await searchParams), author: slug });
  return (
    <>
      <header className="author-profile">
        {a.avatar_asset_id && (
          <Image
            src={`/api/v1/media/${a.avatar_asset_id}`}
            width={160}
            height={160}
            alt={a.display_name}
          />
        )}
        <h1>{a.display_name}</h1>
        <p>{a.bio}</p>
        <p>{[a.country, a.city].filter(Boolean).join("، ")}</p>
        <nav>
          {Object.entries(a.links || {}).map(
            ([name, url]) =>
              safeLink(url) && (
                <a
                  key={name}
                  href={String(url)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {name}
                </a>
              ),
          )}
          {safeLink(a.website) && <a href={a.website}>الموقع الإلكتروني</a>}
        </nav>
      </header>
      <h2>تدوينات الكاتب</h2>
      {p.data.length ? (
        <div className="grid">
          {p.data.map((x) => (
            <PostCard key={x.id} post={x} />
          ))}
        </div>
      ) : (
        <Empty />
      )}
      <nav>
        {p.page > 1 && <Link href={`?page=${p.page - 1}`}>السابق</Link>}
        {p.total > p.page * p.pageSize && (
          <Link href={`?page=${p.page + 1}`}>التالي</Link>
        )}
      </nav>
    </>
  );
}
