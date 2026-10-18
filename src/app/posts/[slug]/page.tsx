import { SummaryLauncher } from "@/components/ai/launcher";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { publicAdvertisements } from "@/lib/control/advertisements";
import { Advertisements } from "@/components/control/advertisements";
import { publicCommentOptions } from "@/lib/control/comment-options";
import { post, posts } from "@/lib/content";
import { databaseConfigured, siteUrl } from "@/lib/env";
import { slugRedirect, viewCount } from "@/lib/public-catalog";
import {
  renderDocument,
  documentHeadings,
  safeLink,
} from "@/lib/editor/document";
import { ArticleActions } from "@/components/article-actions";
import { PostCard } from "@/components/content";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!databaseConfigured()) return {};
  const p = await post((await params).slug);
  if (!p) return {};
  const canonical =
    safeLink(p.canonical_url) || new URL(`/posts/${p.slug}`, siteUrl()).href;
  const image = p.share_asset_id || p.cover_asset_id;
  return {
    title: p.seo_title || p.title,
    description: p.seo_description || p.excerpt,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: p.seo_title || p.title,
      description: p.seo_description || p.excerpt || "",
      publishedTime: p.published_at,
      modifiedTime: p.updated_at,
      url: canonical,
      ...(image
        ? {
            images: [
              new URL(`/api/v1/media/${image}?variant=social`, siteUrl()).href,
            ],
          }
        : {}),
    },
    twitter: {
      card: image ? ("summary_large_image" as const) : ("summary" as const),
      title: p.seo_title || p.title,
      description: p.seo_description || p.excerpt || "",
      ...(image
        ? {
            images: [
              new URL(`/api/v1/media/${image}?variant=social`, siteUrl()).href,
            ],
          }
        : {}),
    },
  };
}
export default async function Article({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!databaseConfigured()) notFound();
  const { slug } = await params;
  const p = await post(slug);
  if (!p) {
    const r = await slugRedirect("post", slug);
    if (r) permanentRedirect(`/posts/${r}`);
    notFound();
  }
  let html = "";
  let headings: ReturnType<typeof documentHeadings> = [];
  try {
    html = renderDocument(p.content_json);
    headings = documentHeadings(p.content_json);
  } catch {}
  const [related, stats, ads, commentOptions] = await Promise.all([
    posts({ author: p.authors?.slug, pageSize: "4" }),
    viewCount(p.id),
    publicAdvertisements(),
    publicCommentOptions(),
  ]);
  const views = stats;
  const canonical =
    safeLink(p.canonical_url) || new URL(`/posts/${p.slug}`, siteUrl()).href;
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title,
    datePublished: p.published_at,
    dateModified: p.updated_at,
    author: {
      "@type": "Person",
      name: p.authors?.display_name || "هيئة التحرير",
      ...(p.authors
        ? { url: new URL(`/authors/${p.authors.slug}`, siteUrl()).href }
        : {}),
    },
    mainEntityOfPage: canonical,
    ...(p.cover_asset_id
      ? { image: new URL(`/api/v1/media/${p.cover_asset_id}`, siteUrl()).href }
      : {}),
  };
  return (
    <>
      <div className="reading-layout">
        <article id="article-top" className="reading-article">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(ld).replace(/</g, "\\u003c"),
            }}
          />
          <nav aria-label="مسار التنقل">
            <Link href="/">الرئيسية</Link> / <span>{p.title}</span>
          </nav>
          <header>
            <span className="eyebrow">
              {p.authors ? (
                <Link href={`/authors/${p.authors.slug}`}>
                  {p.authors.display_name}
                </Link>
              ) : (
                "هيئة التحرير"
              )}{" "}
              · {p.reading_minutes} دقائق قراءة
              {views !== undefined && ` · ${views} مشاهدة مسجلة`}
            </span>
            <h1>{p.title}</h1>
            {p.subtitle && <h2>{p.subtitle}</h2>}
            <p className="article-deck">{p.excerpt}</p>
            <time dateTime={p.published_at}>
              {new Intl.DateTimeFormat("ar-YE", { dateStyle: "long" }).format(
                new Date(p.published_at),
              )}
            </time>
            {p.cover_asset_id && (
              <Image
                className="article-cover"
                src={`/api/v1/media/${p.cover_asset_id}?variant=optimized`}
                width={1600}
                height={900}
                sizes="(max-width:760px) 100vw, 900px"
                alt={p.title}
                priority
              />
            )}
          </header>
          {headings.length > 1 && (
            <nav className="article-toc" aria-label="فهرس المقال">
              <h2>في هذه التدوينة</h2>
              {headings.map((h) => (
                <a key={h.id} href={`#${h.id}`}>
                  {h.text}
                </a>
              ))}
            </nav>
          )}
          <Advertisements items={ads} placement="article" />
          <div className="prose article-body">
            {html ? (
              <div dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <p>{p.content}</p>
            )}
          </div>
          {p.sources?.length > 0 && (
            <section>
              <h2>المصادر والمراجع</h2>
              <ol>
                {p.sources.map((s, i) => (
                  <li key={i}>
                    {safeLink(s.url) ? (
                      <a href={s.url} rel="noopener noreferrer nofollow">
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <Advertisements items={ads} placement="article_after" />

          {process.env.AI_ENABLED === "true" && (
            <SummaryLauncher postId={p.id} />
          )}
          <ArticleActions
            id={p.id}
            title={p.title}
            url={new URL(`/posts/${p.slug}`, siteUrl()).href}
            commentsEnabled={p.allow_comments && commentOptions.enabled}
            commentsOpen={
              (!p.comments_close_at ||
                new Date(p.comments_close_at) > new Date()) &&
              (!commentOptions.close_days ||
                new Date(p.published_at).getTime() +
                  commentOptions.close_days * 86400000 >
                  new Date().getTime())
            }
            repliesEnabled={commentOptions.replies}
            maxDepth={commentOptions.max_depth}
            preModeration={commentOptions.pre_moderation}
            sharing={p.sharing}
          />
        </article>
        <aside className="article-sidebar">
          <Advertisements items={ads} placement="sidebar" />
        </aside>
      </div>
      <section>
        <h2>من تدوينات الكاتب</h2>
        <div className="grid">
          {related.data
            .filter((x) => x.id !== p.id)
            .slice(0, 3)
            .map((x) => (
              <PostCard key={x.id} post={x} />
            ))}
        </div>
      </section>
    </>
  );
}
