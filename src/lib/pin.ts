import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { pinSchema } from "./validation";
function pepper() {
  if (!process.env.PIN_PEPPER || process.env.PIN_PEPPER.length < 32)
    throw new Error("PIN_PEPPER_REQUIRED");
  return process.env.PIN_PEPPER;
}
export function hashPin(pin: string) {
  pinSchema.parse(pin);
  const salt = randomBytes(16).toString("hex");
  const input = createHmac("sha256", pepper()).update(pin).digest();
  return [
    "scrypt-v1",
    salt,
    scryptSync(input, salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }).toString("hex"),
  ].join("$");
}
export function verifyPin(pin: string, stored: string) {
  if (!pinSchema.safeParse(pin).success) return false;
  const [version, salt, hash] = stored.split("$");
  if (version !== "scrypt-v1" || !salt || !hash) return false;
  const input = createHmac("sha256", pepper()).update(pin).digest();
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(input, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
