import { requireAdmin } from "@/lib/auth";
import { TelegramSettings } from "@/components/control/telegram";
export default async function Page() {
  await requireAdmin();
  return (
    <>
      <h1>إعدادات Telegram</h1>
      <TelegramSettings />
    </>
  );
}
