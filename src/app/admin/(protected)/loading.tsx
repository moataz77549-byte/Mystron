export default function Loading() {
  return (
    <div role="status" aria-label="جار تحميل الإدارة">
      <div className="skeleton" />
      <p>جارٍ تحميل البيانات…</p>
    </div>
  );
}
