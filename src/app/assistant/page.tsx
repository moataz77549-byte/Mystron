import Assistant from "@/components/ai/assistant";
export const metadata = {
  title: "مساعد ما يسطرون",
  robots: { index: false, follow: true },
};
export default function AssistantPage() {
  return (
    <div className="section">
      <span className="eyebrow">المعرفة من مصادرها</span>
      <h1>اسأل ما يسطرون</h1>
      <Assistant />
    </div>
  );
}
