import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "./env";
export function publicDatabase() {
  const { url, key } = publicEnv();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function privilegedDatabase() {
  const { url } = publicEnv();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SERVER_NOT_CONFIGURED");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function sessionDatabase() {
  const jar = await cookies();
  const { url, key } = publicEnv();
  const proof = jar.get("maystroon-proof")?.value;
  return createServerClient(url, key, {
    global: {
      headers: proof
        ? {
            "x-maystroon-proof": createHash("sha256")
              .update(proof)
              .digest("hex"),
          }
        : {},
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, {
              ...options,
              httpOnly: true,
              secure:
                process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ??
                false,
            }),
          );
        } catch {
          /* Server components cannot set cookies; proxy performs refresh. */
        }
      },
    },
  });
}
