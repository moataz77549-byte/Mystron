import "server-only";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { authorizedUser } from "./auth";
import { privilegedDatabase, publicDatabase } from "./supabase";
import { mediaPolicySchema, settingDefaults } from "./control/settings-schema";
import { rateLimit } from "./rate-limit";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export function imageMagic(b: Buffer) {
  if (b.length < 12) return null;
  if (b.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "png";
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  if (["GIF87a", "GIF89a"].includes(b.toString("ascii", 0, 6))) return "gif";
  if (
    b.toString("ascii", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(b.toString("ascii", 8, 12))
  )
    return "avif";
  return null;
}
export const cropSchema = z
  .object({
    source_id: z.uuid(),
    rotation: z.number().min(-360).max(360),
    left: z.number().int().min(0),
    top: z.number().int().min(0),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    output_width: z.number().int().min(64).max(4096),
    output_height: z.number().int().min(64).max(4096),
  })
  .strict();
export async function processImage(
  input: Buffer,
  crop?: Omit<z.infer<typeof cropSchema>, "source_id">,
  quality = 82,
) {
  if (input.length > MAX_IMAGE_BYTES || !imageMagic(input))
    throw new Error("INVALID_IMAGE");
  const meta = await sharp(input, {
    limitInputPixels: 40000000,
    animated: true,
  }).metadata();
  if (
    !meta.width ||
    !meta.height ||
    !meta.format ||
    !["jpeg", "png", "webp", "avif", "gif", "heif"].includes(meta.format)
  )
    throw new Error("INVALID_IMAGE");
  const animated = (meta.pages || 1) > 1;
  if (crop && animated) throw new Error("ANIMATED_CROP_UNSUPPORTED");
  let original = input;
  let mime = `image/${imageMagic(input)}`;
  if (mime === "image/jpeg") mime = "image/jpeg";
  if (crop) {
    const oriented = await sharp(input, { limitInputPixels: 40000000 })
      .autoOrient()
      .toBuffer();
    const rotated = await sharp(oriented, { limitInputPixels: 40000000 })
      .rotate(crop.rotation, { background: "#F7F3EB" })
      .toBuffer();
    const m = await sharp(rotated).metadata();
    if (
      crop.left + crop.width > (m.width || 0) ||
      crop.top + crop.height > (m.height || 0)
    )
      throw new Error("INVALID_CROP");
    original = await sharp(rotated)
      .extract({
        left: crop.left,
        top: crop.top,
        width: crop.width,
        height: crop.height,
      })
      .resize(crop.output_width, crop.output_height, { fit: "fill" })
      .webp({ quality: Math.min(quality, 85) })
      .toBuffer();
    mime = "image/webp";
  }
  const variants: Record<string, Buffer> = {};
  if (animated) {
    variants.optimized = original;
    variants.thumbnail = original;
  } else {
    variants.optimized = await sharp(original)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    variants.thumbnail = await sharp(original)
      .rotate()
      .resize(640, 360, { fit: "cover" })
      .webp({ quality: Math.min(quality, 78) })
      .toBuffer();
    variants.social = await sharp(original)
      .rotate()
      .resize(1200, 630, { fit: "cover" })
      .webp({ quality: Math.min(quality, 85) })
      .toBuffer();
  }
  const out = await sharp(original, {
    animated: true,
    limitInputPixels: 40000000,
  }).metadata();
  return {
    original,
    variants,
    mime,
    width: out.autoOrient?.width || out.width!,
    height: out.pageHeight || out.autoOrient?.height || out.height!,
    animated,
  };
}
export async function storeImage(
  bytes: Buffer,
  name: string,
  crop?: Omit<z.infer<typeof cropSchema>, "source_id">,
) {
  const identity = await authorizedUser();
  if (!identity) throw new Error("UNAUTHORIZED");
  if (!identity.permissions["media.manage"]) throw new Error("FORBIDDEN");
  if (!(await rateLimit(`upload:${identity.user.id}`, 20, 60)))
    throw new Error("RATE_LIMITED");
  const configured = await privilegedDatabase().rpc("media_policy_server");
  if (configured.error) throw new Error("MEDIA_POLICY_UNAVAILABLE");
  const policy = mediaPolicySchema.parse(
    configured.data || settingDefaults.media,
  );
  if (
    bytes.length > policy.max_upload_bytes ||
    (!policy.allow_gif && imageMagic(bytes) === "gif")
  )
    throw new Error("MEDIA_POLICY_REJECTED");
  const processed = await processImage(bytes, crop, policy.webp_quality);
  const id = randomUUID();
  const prefix = `${identity.user.id}/${id}`;
  const ext = processed.mime.split("/")[1];
  const paths: string[] = [];
  const service = privilegedDatabase();
  const variants: Record<string, string> = {};
  try {
    const entries: Record<string, Buffer> = {
      original: processed.original,
      ...processed.variants,
    };
    for (const [key, value] of Object.entries(entries)) {
      const path = `${prefix}/${key}.${key === "original" || processed.animated ? ext : "webp"}`;
      const r = await identity.db.storage
        .from("editorial")
        .upload(path, value, {
          contentType:
            key === "original" || processed.animated
              ? processed.mime
              : "image/webp",
          upsert: false,
        });
      if (r.error) throw new Error("UPLOAD_FAILED");
      paths.push(path);
      if (key !== "original") variants[key] = path;
    }
    const { data, error } = await identity.db.rpc("cms_register_media", {
      p_asset: {
        id,
        path: paths[0],
        mime_type: processed.mime,
        size_bytes: processed.original.length,
        display_name: name.slice(0, 300),
        width: processed.width,
        height: processed.height,
        animated: processed.animated,
        variants,
        checksum: createHash("sha256").update(processed.original).digest("hex"),
      },
    });
    if (error) throw new Error("REGISTER_FAILED");
    return data;
  } catch (e) {
    if (paths.length) await service.storage.from("editorial").remove(paths);
    throw e;
  }
}
export async function mediaBytes(id: string, variant: string, admin = false) {
  z.uuid().parse(id);
  const db = admin ? (await authorizedUser())?.db : publicDatabase();
  if (!db) throw new Error("UNAUTHORIZED");
  const { data, error } = await db
    .from("media_assets")
    .select("id,owner_id,path,variants,mime_type,deleted_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) throw new Error("NOT_FOUND");
  const v = z
    .enum(["original", "optimized", "thumbnail", "social"])
    .parse(variant);
  const path = v === "original" ? data.path : data.variants?.[v] || data.path;
  if (
    typeof path !== "string" ||
    !path.startsWith(`${data.owner_id}/${data.id}/`) ||
    path.includes("..")
  )
    throw new Error("INVALID_PATH");
  const { data: blob, error: downloadError } = await privilegedDatabase()
    .storage.from("editorial")
    .download(path);
  if (downloadError || !blob) throw new Error("NOT_FOUND");
  const bytes = Buffer.from(await blob.arrayBuffer());
  const magic = imageMagic(bytes);
  if (!magic) throw new Error("INVALID_IMAGE");
  await sharp(bytes, { limitInputPixels: 40000000, animated: true }).metadata();
  return { bytes, mime: `image/${magic}` };
}
