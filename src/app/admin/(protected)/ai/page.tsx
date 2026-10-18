import { requirePermission } from "@/lib/auth";
import { AiControl } from "@/components/control/ai";
export default async function Page() {
  await requirePermission("integrations.manage");
  return (
    <>
      <h1>مركز الذكاء الاصطناعي</h1>
      <AiControl section="providers" />
    </>
  );
}
