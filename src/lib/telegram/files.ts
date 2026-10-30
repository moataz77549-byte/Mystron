import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { privilegedDatabase } from "../supabase";
import { MAX_IMAGE_BYTES, processImage, imageMagic } from "../media";
import { rateLimit } from "../rate-limit";
import { telegramRpcError } from "./errors";
export async function telegramFile(fileId: string, limit: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_UNCONFIGURED");
  try {
    const meta = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      cache: "no-store",
    });
    if (!meta.ok) throw new Error();
    const data = await meta.json();
    const path = data.result?.file_path;
    if (
      !data.ok ||
      typeof path !== "string" ||
      !/^[\w/.-]{1,300}$/.test(path) ||
      path.includes("..") ||
      path.startsWith("/") ||
      Number(data.result.file_size) > limit
    )
      throw new Error();
    const response = await fetch(
      `https://api.telegram.org/file/bot${token}/${path}`,
      {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
    );
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get("content-length") || 0) > limit
    )
      throw new Error();
    const reader = response.body.getReader(),
      parts: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > limit) throw new Error();
        parts.push(part.value);
      }
      return Buffer.concat(parts);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } catch {
    throw new Error("TELEGRAM_FILE_FAILED");
  }
}
export async function storeTelegramImage(
  telegramId: number,
  updateId: number,
  bytes: Buffer,
  name: string,
  alt: string,
) {
  const db = privilegedDatabase();
  const identity = await db.rpc("telegram_read", {
    p_telegram_id: telegramId,
    p_action: "identity",
  });
  if (identity.error) throw telegramRpcError(identity.error);
  if (!identity.data?.permissions?.["media.manage"])
    throw new Error("FORBIDDEN");
  const userId = String(identity.data.user_id);
  if (!(await rateLimit("tg-upload:" + userId, 20, 60)))
    throw new Error("RATE_LIMITED");
  const { data: policy, error } = await db.rpc("media_policy_server");
  if (error) throw new Error("MEDIA_POLICY_UNAVAILABLE");
  if (
    bytes.length >
      Math.min(MAX_IMAGE_BYTES, policy?.max_upload_bytes || MAX_IMAGE_BYTES) ||
    (!policy?.allow_gif && imageMagic(bytes) === "gif")
  )
    throw new Error("MEDIA_POLICY_REJECTED");
  const image = await processImage(
    bytes,
    undefined,
    policy?.webp_quality || 82,
  );
  const id = randomUUID(),
    prefix = `${userId}/${id}`,
    paths: string[] = [],
    variants: Record<string, string> = {};
  try {
    for (const [key, value] of Object.entries({
      original: image.original,
      ...image.variants,
    })) {
      const mime =
          key === "original" || image.animated ? image.mime : "image/webp",
        path = `${prefix}/${key}.${mime.split("/")[1]}`;
      const result = await db.storage
        .from("editorial")
        .upload(path, value, { contentType: mime, upsert: false });
      if (result.error) throw new Error("UPLOAD_FAILED");
      paths.push(path);
      if (key !== "original") variants[key] = path;
    }
    const asset = {
      id,
      path: paths[0],
      mime_type: image.mime,
      size_bytes: image.original.length,
      display_name: name.slice(0, 300),
      alt_text: alt.slice(0, 300),
      width: image.width,
      height: image.height,
      animated: image.animated,
      variants,
      checksum: createHash("sha256").update(image.original).digest("hex"),
    };
    const result = await db.rpc("telegram_execute", {
      p_telegram_id: telegramId,
      p_update_id: updateId,
      p_command: "media",
      p_args: asset,
    });
    if (result.error) throw telegramRpcError(result.error);
    if (result.data?.id !== id)
      await db.storage.from("editorial").remove(paths);
    return String(result.data.id);
  } catch (error) {
    if (paths.length) await db.storage.from("editorial").remove(paths);
    throw error;
  }
}
