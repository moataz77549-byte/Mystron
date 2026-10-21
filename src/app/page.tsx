import { publicAdvertisements } from "@/lib/control/advertisements";
import { Advertisements } from "@/components/control/advertisements";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import {
  homeData,
  posts,
  popularPosts,
  featuredPost,
  publicPostFields,
} from "@/lib/content";
import type { Post } from "@/lib/content";
import { publicDatabase } from "@/lib/supabase";
import { publicConfiguration } from "@/lib/control/settings-service";
import { Empty, PostCard } from "@/components/content";
import { Ticker } from "@/components/ticker";
import { categoryAccent } from "@/lib/editorial/catalog-metadata";
export default async function Home() {
  const [d, config, advertisements] = await Promise.all([
    homeData(),
    publicConfiguration(),
    publicAdvertisements(),
  ]);
  const sections = await Promise.all(
    config.home.sections
      .filter((s) => s.enabled)
      .map(async (s) => {
        let items: Post[] = [];
        if (d.state === "ready" && s.type !== "hero")
          try {
            if (s.type === "featured" && !s.post_ids?.length) {
              const featured = await featuredPost();
              items = featured ? [featured] : [];
            } else if (s.type === "manual" || s.type === "featured") {
              if (s.post_ids?.length) {
                const result = await publicDatabase()
                  .from("posts")
                  .select(publicPostFields)
                  .in("id", s.post_ids)
                  .limit(s.limit);
                if (!result.error)
                  items = (result.data || []) as unknown as Post[];
                items.sort(
                  (a, b) =>
                    s.post_ids!.indexOf(a.id) - s.post_ids!.indexOf(b.id),
                );
              }
            } else if (s.type === "popular") items = await popularPosts();
            else if (s.type === "category") {
              const category = d.categories.find((c) => c.id === s.category_id);
              if (category)
                items = (
                  await posts({
                    category: category.slug,
                    pageSize: String(s.limit),
                  })
                ).data;
            } else items = (await posts({ pageSize: String(s.limit) })).data;
          } catch {}
        return { config: s, items: items.slice(0, s.limit) };
      }),
  );
  return (
    <>
      <Ticker items={d.ticker} />
      <Advertisements items={advertisements} placement="home" />
      {d.state !== "ready" && (
        <p className="status" role="status">
          {d.state === "unconfigured"
            ? "المنصة في مرحلة التأسيس. لم يُربط مصدر المحتوى بعد."
            : "تعذّر تحميل المحتوى الآن. يرجى المحاولة لاحقاً."}
        </p>
      )}
      {sections.map(({ config: s, items }) =>
        s.type === "hero" ? (
          <section className="intro" key={s.id}>
            <div>
              <span className="eyebrow">المعرفة · الثقافة · الحياة</span>
              <h1>{s.title}</h1>
              <p>{s.description}</p>
              <Link href="/about" className="button outline">
                تعرّف على ما يسطرون
              </Link>
            </div>
            <div className="intro-mark" aria-hidden>
              <BookOpen />
            </div>
          </section>
        ) : !items.length && s.hide_empty ? null : (
          <section className="section" key={s.id}>
            <div className="section-heading">
              <h2>{s.title}</h2>
              <Link href="/search">استكشف التدوينات ←</Link>
            </div>
            {items.length ? (
              <div className="grid">
                {items.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </div>
            ) : (
              <Empty />
            )}
          </section>
        ),
      )}
      <section className="section">
        <h2>أبواب المعرفة</h2>
        {d.categories.length ? (
          <div className="grid">
            {d.categories.map((c) => (
              <Link
                className="category-card"
                key={c.id}
                href={"/categories/" + c.slug}
                style={{
                  borderBlockStart: `4px solid ${categoryAccent(c.color)}`,
                }}
              >
                <h3>{c.name}</h3>
                <span>{c.description || "اكتشف تدوينات هذا القسم"} ←</span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="الأقسام قيد التجهيز"
            description="ستظهر الأقسام المعتمدة بعد اكتمال ربط قاعدة البيانات."
          />
        )}
      </section>
    </>
  );
}
