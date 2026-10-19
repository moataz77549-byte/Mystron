import { requireAdmin } from "@/lib/auth";
import Studio, { type PostRecord } from "@/components/editor/studio";
import { notFound } from "next/navigation";
import { renderDocument } from "@/lib/editor/document";
import { z } from "zod";
export default async function Edit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { db, permissions, user } = await requireAdmin();
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) notFound();
  const [p, a, c, links] = await Promise.all([
    db.from("posts").select("*").eq("id", id).maybeSingle(),
    db
      .from("authors")
      .select("id,display_name")
      .eq("is_active", true)
      .is("deleted_at", null),
    db
      .from("categories")
      .select("id,name")
      .eq("is_active", true)
      .is("deleted_at", null),
    db.from("post_categories").select("category_id").eq("post_id", id),
  ]);
  if (p.error || !p.data) notFound();
  if (a.error || c.error || links.error)
    throw new Error("تعذر تحميل خيارات التحرير");
  const readable = await db.rpc("admin_can_post", {
    p_id: id,
    p_permission: "posts.read",
  });
  if (!readable.data) notFound();
  const editable = await db.rpc("admin_can_post", {
    p_id: id,
    p_permission: "posts.update",
  });
  if (
    !editable.data ||
    (p.data.status === "published" && !permissions["posts.publish"])
  ) {
    let html = "";
    try {
      html = renderDocument(p.data.content_json);
    } catch {}
    return (
      <>
        <h1>{p.data.title}</h1>
        <p>وضع الاطلاع فقط وفق صلاحياتك وحالة التدوينة.</p>
        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      </>
    );
  }
  return (
    <Studio
      key={id}
      initial={
        {
          ...p.data,
          category_ids: links.data.map((x) => x.category_id),
        } as PostRecord
      }
      authors={a.data}
      categories={c.data}
      publisher={!!permissions["posts.publish"]}
      scheduler={!!permissions["posts.schedule"]}
      userId={user.id}
    />
  );
}
