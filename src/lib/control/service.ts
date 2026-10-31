import "server-only";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { requirePermission } from "../auth";
import { privilegedDatabase, publicDatabase } from "../supabase";
import { siteUrl } from "../env";
import { revalidatePath, revalidateTag } from "next/cache";
import { updateSetting } from "./settings-service";
import { settingSchemas, type SettingKey } from "./settings-schema";
import {
  menuSchema,
  userSchema,
  inviteSchema,
  roleSchema,
  userPermissionSchema,
  integrationSchema,
} from "./schema";
const resources: Record<string, string> = {
  dashboard: "dashboard.read",
  users: "users.manage",
  invitations: "users.invite",
  roles: "roles.manage",
  permissions: "roles.manage",
  settings: "settings.read",
  analytics: "analytics.read",
  "audit-logs": "audit.read",
  notifications: "notifications.read",
  menus: "menus.manage",
  announcements: "announcements.manage",
  integrations: "integrations.manage",
  security: "security.manage",
  backups: "backups.read",
};
export const controlResources = Object.keys(resources);
function checked<T>(result: { data: T; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function controlRead(resource: string, params: URLSearchParams) {
  if (!resources[resource]) throw new Error("NOT_FOUND");
  const { db, user } = await requirePermission(resources[resource]);
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(params.get("page") || 1);
  const search = z
    .string()
    .max(100)
    .parse(params.get("q") || "");
  const range: [number, number] = [(page - 1) * 25, page * 25 - 1];
  if (resource === "dashboard") return checked(await db.rpc("admin_dashboard"));
  if (resource === "users")
    return checked(
      await db.rpc("admin_users", { p_page: page, p_search: search }),
    );
  if (resource === "roles") {
    return {
      roles: checked(await db.from("roles").select("id,name").order("name")),
      grants: checked(await db.from("role_permissions").select("*").limit(500)),
      overrides: checked(
        await db.from("user_permissions").select("*").limit(100),
      ),
    };
  }
  if (resource === "permissions")
    return checked(await db.from("permissions").select("*").order("key"));
  if (resource === "settings")
    return checked(
      await db
        .from("site_settings")
        .select("key,value,version,is_public")
        .in("key", Object.keys(settingSchemas))
        .order("key"),
    );
  if (resource === "analytics") {
    const to = z.iso
      .date()
      .parse(params.get("to") || new Date().toISOString().slice(0, 10));
    const from = z.iso
      .date()
      .parse(
        params.get("from") ||
          new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
      );
    if (
      new Date(to) < new Date(from) ||
      +new Date(to) - +new Date(from) > 365 * 86400000
    )
      throw new Error("INVALID_PERIOD");
    return {
      ...checked(
        await db.rpc("admin_analytics", {
          p_from: from,
          p_to: to,
          p_page: page,
        }),
      ),
      metrics: checked(
        await db.rpc("admin_period_metrics", { p_from: from, p_to: to }),
      ),
      from,
      to,
    };
  }
  if (resource === "security") {
    const [sessions, events] = await Promise.all([
      db.rpc("admin_sessions"),
      db
        .from("security_events")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(...range),
    ]);
    return {
      sessions: checked(sessions),
      events: checked(events),
      total: events.count,
      user_id: user.id,
      current_session_id: (await db.auth.getClaims()).data?.claims.session_id,
    };
  }
  if (resource === "backups")
    return {
      database: "manual-verification-required",
      storage: "manual-verification-required",
      last_success: null,
      restore_test: null,
    };
  const table =
    resource === "audit-logs"
      ? "audit_logs"
      : resource === "invitations"
        ? "admin_invitations"
        : resource === "notifications"
          ? "admin_notifications"
          : resource === "menus"
            ? "menu_items"
            : resource === "announcements"
              ? "ticker_items"
              : "integration_settings";
  const fields =
    resource === "invitations"
      ? "id,email,role_id,status,scope_mode,category_ids,created_at,expires_at,delivery_status"
      : "*";
  let query = db.from(table).select(fields, { count: "exact" });
  if (resource === "audit-logs") {
    if (search)
      query = query.ilike(
        "action",
        `%${search.replaceAll("%", "").replaceAll("_", "")}%`,
      );
    for (const [param, col] of [
      ["from", "created_at"],
      ["to", "created_at"],
    ] as const) {
      if (params.has(param)) {
        const date = z.iso.date().parse(params.get(param));
        query =
          param === "from"
            ? query.gte(col, date + "T00:00:00Z")
            : query.lte(col, date + "T23:59:59.999Z");
      }
    }
    if (params.has("result"))
      query = query.eq(
        "result",
        z.enum(["success", "failure"]).parse(params.get("result")),
      );
  }
  if (resource === "notifications") query = query.is("archived_at", null);
  if (resource === "menus") query = query.is("deleted_at", null);
  query = query
    .order(
      resource === "menus"
        ? "sort_order"
        : resource === "integrations"
          ? "id"
          : "created_at",
      { ascending: resource === "menus" || resource === "integrations" },
    )
    .range(...range);
  const result = await query;
  return { rows: checked(result), total: result.count, page, pageSize: 25 };
}
export async function controlCommand(resource: string, input: unknown) {
  if (resource === "settings") {
    const b = z
      .object({
        key: z.enum(
          Object.keys(settingSchemas) as [SettingKey, ...SettingKey[]],
        ),
        value: z.unknown(),
        version: z.number().int().min(1),
      })
      .strict()
      .parse(input);
    return { version: await updateSetting(b.key, b.value, b.version) };
  }
  const { db } = await requirePermission(resources[resource] || "__unknown__");
  let result;
  if (resource === "users") {
    const b = userSchema.parse(input);
    result = await db.rpc("admin_update_user", {
      p_user: b.user_id,
      p_role: b.role_id,
      p_enabled: b.enabled,
      p_scope: b.scope,
      p_categories: b.category_ids,
      p_revoke: b.revoke,
    });
  } else if (resource === "roles") {
    const b = roleSchema.parse(input);
    result = await db.rpc("admin_set_role_permission", {
      p_role: b.role_id,
      p_permission: b.permission,
      p_scope: b.scope,
      p_enabled: b.enabled,
    });
  } else if (resource === "permissions") {
    const b = userPermissionSchema.parse(input);
    result = await db.rpc("admin_set_user_permission", {
      p_user: b.user_id,
      p_permission: b.permission,
      p_effect: b.effect,
      p_scope: b.scope,
      p_enabled: b.enabled,
    });
  } else if (resource === "notifications") {
    const b = z
      .object({ id: z.uuid(), action: z.enum(["read", "unread", "archive"]) })
      .strict()
      .parse(input);
    result = await db.rpc("admin_notification_action", {
      p_id: b.id,
      p_action: b.action,
    });
  } else if (resource === "menus") {
    const b = z
      .object({
        id: z.uuid().nullable(),
        value: z.unknown(),
        delete: z.boolean().default(false),
      })
      .strict()
      .parse(input);
    result = await db.rpc("admin_save_menu", {
      p_id: b.id,
      p_value: b.delete ? {} : menuSchema.parse(b.value),
      p_delete: b.delete,
    });
  } else if (resource === "integrations") {
    const b = integrationSchema
      .extend({ action: z.enum(["save", "check"]).default("save") })
      .parse(input);
    if (b.action === "check") {
      if (b.id !== "supabase")
        return {
          status: "unconfigured",
          message: "لا يوجد فحص اتصال فعلي لهذه الخدمة في هذه المرحلة.",
        };
      const health = await publicDatabase()
        .from("categories")
        .select("id", { head: true, count: "exact" });
      return {
        status: health.error ? "error" : "enabled",
        checked_at: new Date().toISOString(),
        message: health.error
          ? "تعذر الاتصال"
          : "نجح اتصال قاعدة البيانات العامة",
      };
    }
    result = await db.rpc("admin_save_integration", {
      p_id: b.id,
      p_enabled: b.enabled,
      p_config: b.config,
    });
  } else if (resource === "security") {
    const b = z
      .object({ id: z.uuid(), action: z.literal("revoke") })
      .strict()
      .parse(input);
    result = await db.rpc("admin_revoke_session", { p_session: b.id });
  } else if (resource === "invitations") {
    const action = z
      .object({ action: z.enum(["create", "revoke"]) })
      .passthrough()
      .parse(input).action;
    if (action === "revoke") {
      const b = z
        .object({ action: z.literal("revoke"), id: z.uuid() })
        .strict()
        .parse(input);
      result = await db.rpc("admin_invitation_action", {
        p_id: b.id,
        p_action: "revoke",
      });
    } else {
      const b = inviteSchema
        .extend({ action: z.literal("create") })
        .parse(input);
      const token = randomBytes(32).toString("base64url");
      const id = checked(
        await db.rpc("admin_create_invitation", {
          p_email: b.email,
          p_role: b.role_id,
          p_hash: createHash("sha256").update(token).digest("hex"),
          p_expires: new Date(Date.now() + b.hours * 3600000).toISOString(),
          p_scope: b.scope,
          p_categories: b.category_ids,
        }),
      );
      const target = new URL("/invite", siteUrl());
      target.searchParams.set("token", token);
      const sent = await privilegedDatabase().auth.admin.inviteUserByEmail(
        b.email,
        { redirectTo: target.href },
      );
      // Existing confirmed accounts receive a magic link; no role is granted until acceptance.
      let deliveryError = sent.error;
      if (deliveryError) {
        const retry = await publicDatabase().auth.signInWithOtp({
          email: b.email,
          options: { shouldCreateUser: false, emailRedirectTo: target.href },
        });
        deliveryError = retry.error;
      }
      checked(
        await db.rpc("admin_invitation_action", {
          p_id: id,
          p_action: deliveryError ? "failed" : "sent",
        }),
      );
      if (deliveryError) throw new Error("INVITATION_DELIVERY_FAILED");
      return { id, status: "pending" };
    }
  } else throw new Error("NOT_FOUND");
  const data = checked(result);
  revalidateTag("public-content", { expire: 0 });
  revalidatePath("/", "layout");
  return data ?? { saved: true };
}
