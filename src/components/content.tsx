import Link from "next/link";
import Image from "next/image";
import { BookOpen, ArrowUpLeft } from "lucide-react";
import type { Post } from "@/lib/content";
export function Empty({
  title = "لم تُنشر تدوينات بعد",
  description = "ستظهر التدوينات هنا بعد اعتمادها ونشرها.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <BookOpen size={32} aria-hidden />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function PostCard({ post }: { post: Post }) {
  const host = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const asset = post.thumbnail_asset_id || post.cover_asset_id;
  const safeImage =
    post.cover_image &&
    host &&
    post.cover_image.startsWith(host + "/storage/v1/object/public/editorial/");
  return (
    <article className="card">
      {(asset || safeImage) && (
        <Image
          className="cover"
          src={
            asset
              ? `/api/v1/media/${asset}?variant=thumbnail`
              : post.cover_image!
          }
          alt={post.title}
          width={640}
          height={400}
          sizes="(max-width:760px) 100vw, 33vw"
        />
      )}
      <div className="card-body">
        <div className="meta">
          <span>{post.authors?.display_name || "هيئة التحرير"}</span>
          <time dateTime={post.published_at}>
            {new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(
              new Date(post.published_at),
            )}
          </time>
          <span>{post.reading_minutes} دقائق قراءة</span>
        </div>
        <h3>
          <Link href={"/posts/" + post.slug}>{post.title}</Link>
        </h3>
        <p>{post.excerpt}</p>
        <Link href={"/posts/" + post.slug} className="eyebrow">
          اقرأ التدوينة <ArrowUpLeft size={14} style={{ display: "inline" }} />
        </Link>
      </div>
    </article>
  );
}
