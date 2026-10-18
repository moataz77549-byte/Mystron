import { requireAdmin } from "@/lib/auth";
import Moderation from "@/components/editor/moderation";
export default async function Page() {
  const { db, permissions } = await requireAdmin();
  if (!permissions["comments.moderate"])
    return <p>مراجعة التعليقات تتطلب صلاحية تحرير.</p>;
  const [c, r] = await Promise.all([
    db
      .from("comments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("comment_reports")
      .select("id,comment_id,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (c.error || r.error) throw new Error("تعذر تحميل المراجعة");
  return (
    <>
      <Moderation initial={c.data} />
      <h2>بلاغات الزوار</h2>
      {r.data.map((x) => (
        <article key={x.id}>
          <code>{x.comment_id}</code>
          <p>{x.reason}</p>
        </article>
      ))}
      {!r.data.length && <p>لا توجد بلاغات.</p>}
    </>
  );
}
