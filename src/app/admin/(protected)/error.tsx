"use client";
import Link from "next/link";
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <section className="control-card" role="alert">
      <h1>تعذر تحميل مساحة العمل</h1>
      <p>
        لم يكتمل طلب البيانات. قد يكون الاتصال مؤقتاً أو صلاحية الجلسة منتهية.
        تظل مسودة المتصفح محفوظة عند وجودها؛ لا تُنشئ حساباً أو تغيّر الصلاحيات
        لحل خطأ الاتصال.
      </p>
      <button className="button" onClick={reset}>
        إعادة المحاولة
      </button>
      <Link className="button outline" href="/admin/login">
        التحقق من تسجيل الدخول
      </Link>
    </section>
  );
}
