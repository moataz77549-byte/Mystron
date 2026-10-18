"use client";
import Image from "next/image";
import { usePathname } from "next/navigation";
type Ad = {
  id: string;
  text: string;
  url: string | null;
  sponsored: boolean;
  image_asset_id: string | null;
  pages: string[];
  placement: string;
  style: string;
};
export function Advertisements({
  items,
  placement,
}: {
  items: Ad[];
  placement: string;
}) {
  const path = usePathname();
  const visible = items.filter(
    (i) =>
      i.placement === placement && (!i.pages.length || i.pages.includes(path)),
  );
  if (!visible.length) return null;
  return (
    <section
      className={"advertisement-placement placement-" + placement}
      aria-label="إعلانات وتنبيهات"
    >
      {visible.map((a) => (
        <aside className={"article-ad ticker-" + a.style} key={a.id}>
          <strong>{a.sponsored ? "إعلان مدفوع" : "تنبيه تحريري"}</strong>
          <p>
            {a.url && /^(https:\/\/|\/(?!\/))/.test(a.url) ? (
              <a
                href={a.url}
                rel={
                  a.sponsored
                    ? "sponsored noopener noreferrer"
                    : "noopener noreferrer"
                }
              >
                {a.text}
              </a>
            ) : (
              a.text
            )}
          </p>
          {a.image_asset_id && (
            <Image
              src={"/api/v1/media/" + a.image_asset_id + "?variant=thumbnail"}
              width={320}
              height={180}
              alt=""
            />
          )}
        </aside>
      ))}
    </section>
  );
}
