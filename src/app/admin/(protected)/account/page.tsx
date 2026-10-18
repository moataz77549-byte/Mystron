import { requireAdmin } from "@/lib/auth";
import { PinProtection } from "@/components/control/pin";
export default async function Account() {
  const { user, roles, access } = await requireAdmin();
  return (
    <>
      <h1>إعدادات حسابي</h1>
      <p>{user.email}</p>
      <p>
        البريد مؤكد بواسطة Supabase Auth. الأدوار الحالية: {roles.join("، ")}
      </p>
      {roles.includes("OWNER") ? (
        <PinProtection configured={access.pin_configured} />
      ) : (
        <p>حماية PIN مخصصة للمالك. إعدادات صلاحياتك تُدار من المخوّلين.</p>
      )}
    </>
  );
}
