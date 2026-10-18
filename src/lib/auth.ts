import "server-only";
import { redirect } from "next/navigation";
import { databaseConfigured } from "./env";
import { sessionDatabase } from "./supabase";
export type AdminIdentity = {
  active: boolean;
  roles: string[];
  permissions: Record<string, "own" | "all">;
  pin_configured: boolean;
  scope: { mode: "all" | "restricted"; category_ids: string[] };
};
export async function authorizedUser() {
  if (!databaseConfigured()) return null;
  const db = await sessionDatabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user?.email_confirmed_at) return null;
  const { data, error: identityError } = await db.rpc("admin_identity");
  const access = data as AdminIdentity | null;
  if (
    identityError ||
    !access?.active ||
    !Object.keys(access.permissions).length
  )
    return null;
  return {
    user,
    db,
    roles: access.roles,
    permissions: access.permissions,
    access,
  };
}
export async function requireAdmin() {
  const identity = await authorizedUser();
  if (!identity) redirect("/admin/login");
  return identity;
}
export async function requirePermission(permission: string) {
  const identity = await authorizedUser();
  if (!identity) throw new Error("UNAUTHORIZED");
  if (!identity.permissions[permission]) throw new Error("FORBIDDEN");
  return identity;
}
