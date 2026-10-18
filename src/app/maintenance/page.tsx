import { publicConfiguration } from "@/lib/control/settings-service";
import { BookOpen } from "lucide-react";
export const metadata = {
  title: "صيانة مؤقتة",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const { maintenance } = await publicConfiguration();
  return (
    <section className="intro">
      <div>
        <span className="eyebrow">ما يسطرون · نعتني بالتفاصيل</span>
        <h1>نعود إليكم قريباً</h1>
        <p>{maintenance.message}</p>
        {maintenance.until && (
          <p>
            الانتهاء المتوقع:{" "}
            {new Intl.DateTimeFormat("ar-YE", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "Asia/Aden",
            }).format(new Date(maintenance.until))}{" "}
            — توقيت عدن
          </p>
        )}
      </div>
      <div className="intro-mark" aria-hidden>
        <BookOpen />
      </div>
    </section>
  );
}
