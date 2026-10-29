import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publishedPage } from "@/lib/editorial/site-pages";
import { SitePageContent } from "@/components/site-page";
import { sitePagePath } from "@/lib/editorial/site-pages-schema";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await publishedPage(slug);
  return page
    ? {
        title: page.title,
        description: page.description,
        alternates: { canonical: sitePagePath(slug) },
        openGraph: {
          title: page.title,
          description: page.description,
          url: sitePagePath(slug),
          type: "website",
        },
      }
    : { robots: { index: false, follow: false } };
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  // The canonical legacy paths retain their existing URLs.
  if (["about", "privacy"].includes(slug)) notFound();
  const page = await publishedPage(slug);
  if (!page) notFound();
  return <SitePageContent page={page} />;
}
