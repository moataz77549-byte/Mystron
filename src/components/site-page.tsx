import { renderDocument } from "@/lib/editor/document";
import type { SitePage } from "@/lib/editorial/site-pages-schema";
export function SitePageContent({ page }: { page: SitePage }) {
  return (
    <article className="prose">
      <h1>{page.title}</h1>
      {page.description && <p className="lede">{page.description}</p>}
      <div
        dangerouslySetInnerHTML={{ __html: renderDocument(page.content_json) }}
      />
    </article>
  );
}
