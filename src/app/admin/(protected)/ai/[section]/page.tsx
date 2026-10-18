import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { AiControl } from "@/components/control/ai";
import { PinProtection } from "@/components/control/pin";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    !["providers", "models", "usage", "settings", "knowledge"].includes(section)
  )
    notFound();
  const identity = await requirePermission(
    section === "usage" ? "analytics.read" : "integrations.manage",
  );
  return (
    <>
      <h1>مركز الذكاء الاصطناعي</h1>
      <AiControl section={section} />
      {["settings", "knowledge"].includes(section) && (
        <PinProtection configured={identity.access.pin_configured} />
      )}
    </>
  );
}
