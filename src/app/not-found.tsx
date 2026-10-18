import Link from "next/link";
export default function NotFound() {
  return (
    <div className="prose">
      <h1>الصفحة غير موجودة</h1>
      <Link className="button" href="/">
        العودة للرئيسية
      </Link>
    </div>
  );
}
