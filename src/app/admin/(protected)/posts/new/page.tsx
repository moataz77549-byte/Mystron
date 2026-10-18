import { requireAdmin } from "@/lib/auth";
import NewPost from "@/components/editor/new-post";
export default async function Page() {
  const { permissions } = await requireAdmin();
  return permissions["posts.create"] ? (
    <NewPost />
  ) : (
    <p>لا تملك صلاحية إنشاء تدوينة.</p>
  );
}
