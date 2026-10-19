export default function AdminLoading() {
  return (
    <section aria-busy="true" role="status">
      <p>جارٍ تجهيز مساحة العمل…</p>
      <div className="skeleton" />
      <div className="control-grid">
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </section>
  );
}
