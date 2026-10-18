"use client";
import { useState, useCallback, useRef, useSyncExternalStore } from "react";
import NextImage from "next/image";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { command } from "./command";
type Asset = {
  id: string;
  display_name: string;
  alt_text: string;
  caption: string;
  folder: string;
  width: number;
  height: number;
  size_bytes: number;
  animated: boolean;
  deleted_at: string | null;
};
export default function MediaLibrary({ initial }: { initial: Asset[] }) {
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [assets, setAssets] = useState(initial);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState<Asset | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [ratio, setRatio] = useState(16 / 9);
  const [area, setArea] = useState<Area | null>(null);
  const [outputWidth, setOutputWidth] = useState(1200);
  const [template, setTemplate] = useState("الأخبار");
  const [templateReady, setTemplateReady] = useState(false);
  const [headline, setHeadline] = useState("");
  const [color, setColor] = useState("#111D31");
  const [related, setRelated] = useState<string[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  async function upload(files: FileList | File[] | null) {
    if (!files) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const f = new FormData();
        f.set("file", file);
        const r = await fetch("/api/v1/admin/media/upload", {
          method: "POST",
          body: f,
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error?.code);
        setAssets((a) => [j.data, ...a]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const completed = useCallback(
    (_: Area, pixels: Area) =>
      setArea(
        Number.isFinite(pixels.width) &&
          pixels.width > 0 &&
          Number.isFinite(pixels.height) &&
          pixels.height > 0
          ? pixels
          : null,
      ),
    [],
  );
  async function select(a: Asset) {
    setItem({ ...a });
    setTemplateReady(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    const r = await fetch(`/api/v1/admin/media/usage?id=${a.id}`);
    const j = await r.json();
    if (r.ok) setRelated(j.data);
    else setError(j.error?.code || "تعذر تحميل الاستخدام");
  }
  async function saveMeta() {
    if (!item) return;
    try {
      const d = await command("media", {
        id: item.id,
        patch: {
          display_name: item.display_name,
          alt_text: item.alt_text || "",
          caption: item.caption || "",
          folder: item.folder || "",
        },
      });
      setAssets((a) => a.map((x) => (x.id === d.id ? d : x)));
      setItem(d);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  async function cropImage() {
    if (!item || !area) return;
    setBusy(true);
    try {
      const r = await fetch("/api/v1/admin/media/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: item.id,
          rotation,
          left: area.x,
          top: area.y,
          width: area.width,
          height: area.height,
          output_width: outputWidth,
          output_height: Math.round(outputWidth / ratio),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.code);
      setAssets((a) => [j.data, ...a]);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function drawTemplate() {
    if (!item || !canvas.current) return;
    try {
      const c = canvas.current;
      c.width = 1200;
      c.height = 630;
      const ctx = c.getContext("2d")!;
      const image = new Image();
      image.src = `/api/v1/admin/media/${item.id}?variant=optimized`;
      await image.decode();
      await document.fonts.ready;
      ctx.drawImage(image, 0, 0, 1200, 630);
      const g = ctx.createLinearGradient(0, 0, 0, 630);
      g.addColorStop(0, "#111D3120");
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1200, 630);
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillStyle = "#D5A96A";
      ctx.font = '32px "IBM Plex Sans Arabic"';
      ctx.fillText("ما يسطرون · " + template, 1140, 90);
      if (template === "من بطون الكتب") {
        ctx.fillStyle = "#D5A96A";
        ctx.fillRect(1160, 180, 6, 360);
      }
      if (template === "الاقتباسات") {
        ctx.textAlign = "center";
      }
      ctx.fillStyle = "#F7F3EB";
      ctx.font = 'bold 56px "IBM Plex Sans Arabic"';
      const words = headline.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const next = line + " " + w;
        if (ctx.measureText(next).width > 1050 && line) {
          lines.push(line);
          line = w;
        } else line = next;
      }
      if (line) lines.push(line);
      if (lines.length > 4)
        throw new Error("اختصر عنوان القالب إلى أربعة أسطر");
      lines.forEach((l, i) =>
        ctx.fillText(
          l.trim(),
          template === "الاقتباسات" ? 600 : 1140,
          350 + i * 70,
        ),
      );
      setTemplateReady(true);
      setError("");
    } catch (e) {
      setTemplateReady(false);
      setError(String(e));
    }
  }
  async function exportTemplate(save: boolean) {
    const c = canvas.current;
    if (!c) return;
    c.toBlob(async (blob) => {
      if (!blob) return;
      if (save) {
        await upload([
          new File([blob], "maystroon-template.png", { type: "image/png" }),
        ]);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "maystroon-template.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    }, "image/png");
  }
  return (
    <>
      <h1>مكتبة الوسائط</h1>
      <div
        className="upload-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(e.dataTransfer.files);
        }}
      >
        <label>
          رفع صور — حتى 5 MiB للصورة
          <input
            disabled={busy || !ready}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
        <p>
          اسحب الصور هنا. تُحفظ الصور المتحركة دون قص أو تحويل إلى لقطة ثابتة.
        </p>
      </div>
      {busy && <p role="status">جارٍ معالجة الصور…</p>}
      {error && <p role="alert">{error}</p>}
      <label>
        بحث
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="media-grid">
        {assets
          .filter(
            (a) =>
              !a.deleted_at &&
              `${a.display_name} ${a.alt_text} ${a.folder}`.includes(q),
          )
          .map((a) => (
            <button key={a.id} onClick={() => void select(a)}>
              <NextImage
                unoptimized
                width={240}
                height={135}
                src={`/api/v1/admin/media/${a.id}?variant=thumbnail`}
                alt={a.alt_text || a.display_name}
                loading="lazy"
              />
              <strong>{a.display_name}</strong>
              <span>
                {a.width} × {a.height} · {Math.ceil(a.size_bytes / 1024)} KiB
              </span>
            </button>
          ))}
      </div>
      {!assets.length && <p>لم تُرفع صور بعد.</p>}
      {item && (
        <section className="media-editor">
          <h2>{item.display_name}</h2>
          <code dir="ltr">{item.id}</code>
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(item.id)
                .catch(() => setError("تعذر النسخ"));
            }}
          >
            نسخ معرّف الصورة
          </button>
          {[
            ["display_name", "الاسم الوصفي"],
            ["alt_text", "النص البديل"],
            ["caption", "التعليق"],
            ["folder", "المجلد"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={String(item[key as keyof Asset] || "")}
                onChange={(e) => setItem({ ...item, [key]: e.target.value })}
              />
            </label>
          ))}
          <button onClick={() => void saveMeta()}>حفظ البيانات</button>
          <p>
            التدوينات المرتبطة:{" "}
            {related.length ? related.join("، ") : "لا توجد"}
          </p>
          <button
            onClick={async () => {
              if (related.length) {
                setError("هذه الصورة مستخدمة. أزل ارتباطها بالتدوينات أولاً.");
                return;
              }
              if (!confirm("حذف الصورة غير المستخدمة حذفاً آمناً؟")) return;
              try {
                const d = await command("media", {
                  id: item.id,
                  patch: { action: "delete" },
                });
                setAssets((a) => a.map((x) => (x.id === d.id ? d : x)));
                setItem(null);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            حذف غير المستخدمة
          </button>
          {!item.animated ? (
            <>
              <h3>قص وتحسين الصورة</h3>
              <div className="crop-container">
                <Cropper
                  image={`/api/v1/admin/media/${item.id}`}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={ratio}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onCropComplete={completed}
                />
              </div>
              <label>
                النسبة
                <select
                  value={ratio}
                  onChange={(e) => setRatio(Number(e.target.value))}
                >
                  {[
                    [16 / 9, "16:9"],
                    [4 / 3, "4:3"],
                    [1, "1:1"],
                    [9 / 16, "9:16"],
                    [1.91, "1.91:1"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                التكبير / نقطة التركيز
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
              <label>
                التدوير
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                />
              </label>
              <label>
                عرض الناتج
                <input
                  type="number"
                  min="64"
                  max="4096"
                  value={outputWidth}
                  onChange={(e) => setOutputWidth(Number(e.target.value))}
                />
              </label>
              <button disabled={busy || !area} onClick={() => void cropImage()}>
                حفظ نسخة محسنة مع الاحتفاظ بالأصل
              </button>
            </>
          ) : (
            <p>القص والتحرير غير متاحين للصور المتحركة.</p>
          )}
          <h3>قالب صورة تحريرية ثابتة</h3>
          <label>
            القالب
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {[
                "الأخبار",
                "المقالات",
                "الاقتباسات",
                "من بطون الكتب",
                "الناس والحياة",
                "الذكاء الاصطناعي",
                "الطب والصيدلة",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            العنوان
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
            />
          </label>
          <label>
            لون الهوية
            <select value={color} onChange={(e) => setColor(e.target.value)}>
              {["#111D31", "#D5A96A", "#267E81", "#8F4D52"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <button onClick={() => void drawTemplate()}>توليد المعاينة</button>
          <canvas
            ref={canvas}
            className="template-canvas"
            aria-label="معاينة قالب الصورة"
          />
          <button
            disabled={!templateReady}
            onClick={() => void exportTemplate(false)}
          >
            تنزيل PNG
          </button>
          <button
            disabled={!templateReady || busy}
            onClick={() => void exportTemplate(true)}
          >
            حفظ القالب في المكتبة
          </button>
          <button onClick={() => setItem(null)}>إغلاق</button>
        </section>
      )}
    </>
  );
}
