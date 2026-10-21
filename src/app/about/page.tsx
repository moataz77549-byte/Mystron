import { publishedPage } from "@/lib/editorial/site-pages";
import { SitePageContent } from "@/components/site-page";
export async function generateMetadata() {
  const page = await publishedPage("about");
  return {
    title: page?.title || "حول ما يسطرون",
    description: page?.description,
    alternates: { canonical: "/about" },
    openGraph: {
      title: page?.title || "حول ما يسطرون",
      description: page?.description,
      url: "/about",
    },
  };
}
export default async function About() {
  const page = await publishedPage("about");
  if (page) return <SitePageContent page={page} />;
  return (
    <article className="prose">
      <span className="eyebrow">عن المنصة</span>
      <h1>نكتب ليتّسع الأفق.</h1>
      <p>
        ما يسطرون منصة عربية تجمع المعرفة والثقافة والناس والحياة. تنطلق من
        اليمن، تعز، بإشراف معتز العلقمي.
      </p>
      <p>
        نحرص على وضوح المصادر، ونسبة الاقتباسات إلى أصحابها، والفصل بين الخبر
        والرأي. المحتوى الطبي للتثقيف ولا يغني عن مراجعة المختص.
      </p>
      <p>المنصة في مرحلة التأسيس. ستُضاف المواد بعد مراجعتها واعتمادها.</p>
    </article>
  );
}
