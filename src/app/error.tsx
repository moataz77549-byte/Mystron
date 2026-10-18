"use client";
import { Button } from "@/components/ui/button";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="prose">
      <h1>تعذّر تحميل الصفحة</h1>
      <p>يرجى المحاولة مرة أخرى.</p>
      <Button onClick={reset}>إعادة المحاولة</Button>
    </div>
  );
}
