export default function Loading() {
  return (
    <div className="prose" role="status" aria-label="جاري التحميل">
      <div className="loading" />
      <p>جاري تحميل السطور…</p>
    </div>
  );
}
