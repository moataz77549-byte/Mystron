import "server-only";
import { redirect } from "next/navigation";
import { databaseConfigured } from "./env";
import { sessionDatabase } from "./supabase";
import type { User } from "@supabase/supabase-js";
export type AdminIdentity = {
  active: boolean;
  roles: string[];
  permissions: Record<string, "own" | "all">;
  pin_configured: boolean;
  scope: { mode: "all" | "restricted"; category_ids: string[] };
};
type AuthorizedIdentity = {
  user: User;
  db: Awaited<ReturnType<typeof sessionDatabase>>;
  roles: string[];
  permissions: AdminIdentity["permissions"];
  access: AdminIdentity;
};
async function resolveAdmin(): Promise<{
  identity: AuthorizedIdentity | null;
  reason?: "session" | "email" | "access" | "service";
}> {
  if (!databaseConfigured()) return { identity: null, reason: "service" };
  try {
    const db = await sessionDatabase();
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user)
      return {
        identity: null,
        reason: error?.status && error.status >= 500 ? "service" : "session",
      };
    if (!user.email_confirmed_at) return { identity: null, reason: "email" };
    const { data, error: identityError } = await db.rpc("admin_identity");
    const access = data as AdminIdentity | null;
    if (identityError) return { identity: null, reason: "service" };
    if (!access?.active || !Object.keys(access.permissions || {}).length)
      return { identity: null, reason: "access" };
    return {
      identity: {
        user,
        db,
        roles: access.roles,
        permissions: access.permissions,
        access,
      },
    };
  } catch {
    return { identity: null, reason: "service" };
  }
}
export async function authorizedUser() {
  return (await resolveAdmin()).identity;
}
export async function requireAdmin() {
  const { identity, reason } = await resolveAdmin();
  if (!identity) redirect("/admin/login?reason=" + (reason || "session"));
  return identity;
}
export async function requirePermission(permission: string) {
  const identity = await authorizedUser();
  if (!identity) throw new Error("UNAUTHORIZED");
  if (!identity.permissions[permission]) throw new Error("FORBIDDEN");
  return identity;
}
