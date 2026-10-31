import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { publicDatabase } from "../supabase";
import { databaseConfigured } from "../env";
import {
  settingDefaults,
  settingSchemas,
  type SettingKey,
} from "./settings-schema";
import { requirePermission } from "../auth";
import { revalidatePath, revalidateTag } from "next/cache";
const readPublicConfiguration = async () => {
  const defaults = {
    identity: settingSchemas.identity.parse(settingDefaults.identity),
    home: settingSchemas.home.parse(settingDefaults.home),
    seo: settingSchemas.seo.parse(settingDefaults.seo),
    maintenance: settingSchemas.maintenance.parse(settingDefaults.maintenance),
  };
  if (!databaseConfigured()) return defaults;
  const { data, error } = await publicDatabase()
    .from("site_settings")
    .select("key,value")
    .in("key", ["identity", "home", "seo", "maintenance"]);
  if (error) return defaults;
  for (const key of ["identity", "home", "seo", "maintenance"] as const) {
    const parsed = settingSchemas[key].safeParse(
      data?.find((r) => r.key === key)?.value,
    );
    if (parsed.success) Object.assign(defaults, { [key]: parsed.data });
  }
  return defaults;
};
export const publicConfiguration = cache(
  unstable_cache(readPublicConfiguration, ["publicConfiguration-v1"], {
    revalidate: 30,
    tags: ["public-content"],
  }),
);
export async function updateSetting(
  key: SettingKey,
  value: unknown,
  version: number,
) {
  const { db } = await requirePermission(
    key === "security"
      ? "security.manage"
      : key === "maintenance"
        ? "maintenance.manage"
        : "settings.update",
  );
  const parsed = settingSchemas[key].parse(value);
  const result = await db.rpc("admin_update_setting", {
    p_key: key,
    p_value: parsed,
    p_expected_version: version,
  });
  if (result.error) throw new Error(result.error.message);
  revalidateTag("public-content", { expire: 0 });
  revalidatePath("/", "layout");
  return result.data;
}
