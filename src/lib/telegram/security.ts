import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export function gatewaySignature(
  secret: string,
  timestamp: string,
  nonce: string,
  path: string,
  body: string,
) {
  return createHmac("sha256", secret)
    .update(
      [
        timestamp,
        nonce,
        path,
        createHash("sha256").update(body).digest("hex"),
      ].join("\n"),
    )
    .digest("hex");
}
export function verifyGateway(
  headers: Headers,
  path: string,
  body: string,
  secret: string | undefined,
  now = Date.now(),
) {
  if (!secret || secret.length < 32) return false;
  const timestamp = headers.get("x-maystroon-time") || "",
    nonce = headers.get("x-maystroon-nonce") || "",
    signature = headers.get("x-maystroon-signature") || "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 30 ||
    !/^\w{32,64}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(gatewaySignature(secret, timestamp, nonce, path, body), "hex"),
  );
}
export function linkHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
