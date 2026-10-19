import { requireAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/control/shell";
import "../editorial.css";
export const metadata = { robots: { index: false, follow: false } };
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, permissions } = await requireAdmin();
  return (
    <AdminShell permissions={Object.keys(permissions)} email={user.email || ""}>
      {children}
    </AdminShell>
  );
}
