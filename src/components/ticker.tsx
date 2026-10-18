"use client";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { Pause, Play } from "lucide-react";
export function Ticker({
  items,
}: {
  items: {
    id: string;
    text: string;
    url: string | null;
    pages?: string[];
    style?: string;
    sponsored?: boolean;
    image_asset_id?: string | null;
  }[];
}) {
  const [paused, setPaused] = useState(false);
  const pathname = usePathname();
  items = items.filter((i) => !i.pages?.length || i.pages.includes(pathname));
  if (!items.length) return null;
  return (
    <div className={"ticker " + (paused ? "paused" : "")}>
      <strong>على السطر</strong>
      <div className="ticker-window">
        <div className="ticker-track">
          {items.map((i) => (
            <span key={i.id} className={"ticker-" + i.style}>
              {i.sponsored && <small>إعلان مدفوع · </small>}
              {i.image_asset_id && (
                <Image
                  src={`/api/v1/media/${i.image_asset_id}?variant=thumbnail`}
                  width={32}
                  height={32}
                  alt=""
                />
              )}
              {i.url && /^(https:\/\/|\/(?!\/))/.test(i.url) ? (
                <a href={i.url}>{i.text}</a>
              ) : (
                i.text
              )}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={() => setPaused(!paused)}
        aria-label={paused ? "تشغيل الشريط" : "إيقاف الشريط"}
      >
        {paused ? <Play size={18} /> : <Pause size={18} />}
      </button>
    </div>
  );
}
