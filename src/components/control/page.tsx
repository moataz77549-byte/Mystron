import Link from "next/link";
import { authorizedUser, requireAdmin } from "@/lib/auth";
import { controlRead } from "@/lib/control/service";
import { DataTable, Pagination } from "./table";
import { ViewsChart } from "./chart";
import { PinProtection } from "./pin";
import { Action } from "./form";
import {
  UsersEditor,
  InvitationsEditor,
  RolesEditor,
  OverridesEditor,
  MenuEditor,
  IntegrationsEditor,
} from "./management";
type Row = Record<string, unknown>;
const titles: Record<string, string> = {
  dashboard: "مركز التحكم",
  analytics: "مركز التحليلات",
  users: "إدارة المشرفين",
  invitations: "دعوات المشرفين",
  roles: "الأدوار",
  permissions: "الصلاحيات التفصيلية",
  "audit-logs": "سجل التدقيق",
  notifications: "الإشعارات",
  menus: "القوائم والتنقل",
  integrations: "مركز التكاملات",
  security: "مركز الأمان",
  backups: "النسخ الاحتياطية والاستعادة",
};
const metrics: Record<string, string> = {
  posts: "إجمالي التدوينات المتاحة",
  published: "المنشورة",
  draft: "المسودات",
  review: "قيد المراجعة",
  scheduled: "المجدولة",
  views: "إجمالي المشاهدات",
  today_views: "مشاهدات اليوم UTC",
  week_views: "مشاهدات آخر 7 أيام",
  month_views: "مشاهدات الشهر UTC",
  pending_comments: "التعليقات المعلقة",
  authors: "الكتّاب",
  admins: "المشرفون المفعّلون",
};
export async function ControlPage({
  resource,
  searchParams,
}: {
  resource: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await requireAdmin();
  const input = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(input))
    if (typeof v === "string") params.set(k, v);
  const page = Number(params.get("page") || 1);
  const path =
    resource === "invitations"
      ? "/admin/users/invitations"
      : "/admin/" + resource;
  let data;
  try {
    data = await controlRead(resource, params);
  } catch (e) {
    return (
      <>
        <h1>{titles[resource]}</h1>
        <p className="status" role="alert">
          {e instanceof Error && e.message === "FORBIDDEN"
            ? "لا تملك صلاحية عرض هذا القسم."
            : "تعذّر تحميل البيانات. حدّث الصفحة أو تحقق من اتصال الخدمة."}
        </p>
      </>
    );
  }
  let users: Row[] = [];
  let roles: Row[] = [];
  let categories: Row[] = [];
  let permissions: Row[] = [];
  if (
    ["users", "invitations", "roles", "permissions", "menus"].includes(resource)
  ) {
    const [r, c] = await Promise.all([
      identity.db.from("roles").select("id,name").order("name"),
      identity.db
        .from("categories")
        .select("id,name")
        .is("deleted_at", null)
        .order("sort_order"),
    ]);
    roles = r.data || [];
    if (["users", "invitations"].includes(resource)) {
      const assignable = await identity.db.rpc("admin_assignable_roles");
      if (!assignable.error) roles = assignable.data || [];
    }
    categories = c.data || [];
    if (["roles", "permissions"].includes(resource))
      permissions =
        (await identity.db.from("permissions").select("*").order("key")).data ||
        [];
    if (resource === "permissions" && identity.permissions["users.manage"])
      users = (await controlRead("users", new URLSearchParams())).rows || [];
  }
  return (
    <>
      <span className="eyebrow">MAYSTROON · مركز التحكم</span>
      <h1>{titles[resource]}</h1>
      {resource === "dashboard" && (
        <>
          <div className="stats">
            {Object.entries(data as Row).map(([key, value]) => (
              <article key={key}>
                <h2>{String(value)}</h2>
                <p>{metrics[key] || key}</p>
              </article>
            ))}
          </div>
          <section className="control-card">
            <h2>حالة الخدمات</h2>
            <p>
              نجح تحميل بيانات قاعدة البيانات. لا تتوفر بيانات مراقبة Vercel أو
              آخر نسخة احتياطية من هذا الاتصال.
            </p>
          </section>
          {identity.permissions["audit.read"] && <RecentAudit />}
        </>
      )}
      {resource === "analytics" && (
        <>
          <form className="toolbar" method="get">
            <label>
              من
              <input
                name="from"
                type="date"
                defaultValue={data.from}
                required
              />
            </label>
            <label>
              إلى
              <input name="to" type="date" defaultValue={data.to} required />
            </label>
            <button className="button">عرض الفترة</button>
          </form>
          <p>
            المشاهدات المسجلة لا تمثل أشخاصاً فريدين. تُجمع الأيام بتوقيت UTC؛
            المقارنة تتم باختيار فترتين. أرقام الأقسام قد تتداخل إذا اشتركت
            التدوينة في أكثر من قسم.
          </p>
          <div className="stats">
            <article>
              <h2>{data.metrics.current_views}</h2>
              <p>مشاهدات الفترة</p>
            </article>
            <article>
              <h2>{data.metrics.previous_views}</h2>
              <p>
                الفترة السابقة المماثلة: {data.metrics.previous_from} —{" "}
                {data.metrics.previous_to}
              </p>
            </article>
            <article>
              <h2>
                {data.metrics.change_percent === null
                  ? "غير قابل للحساب"
                  : data.metrics.change_percent + "%"}
              </h2>
              <p>تغير المشاهدات مقارنة بالفترة السابقة</p>
            </article>
            <article>
              <h2>{data.metrics.average_views_per_post ?? "لا بيانات"}</h2>
              <p>متوسط المشاهدات لكل تدوينة متاحة</p>
            </article>
            <article>
              <h2>{data.metrics.average_review_hours ?? "لا سجل مكتمل"}</h2>
              <p>
                متوسط المراجعة بالساعات، من أزواج أحداث المراجعة والنشر المحتفظ
                بها
              </p>
            </article>
          </div>
          <ViewsChart days={data.days} />
          <h2>أداء التدوينات</h2>
          <DataTable
            rows={data.posts}
            columns={[
              ["title", "التدوينة"],
              ["status", "الحالة"],
              ["published_at", "النشر"],
              ["views", "المشاهدات"],
              ["comments", "التعليقات"],
            ]}
          />
          <Link
            className="button outline"
            href={
              "/api/v1/admin/analytics?" +
              new URLSearchParams({
                ...Object.fromEntries(params),
                format: "csv",
              })
            }
          >
            تصدير هذه الصفحة CSV
          </Link>
          <Pagination
            page={page}
            total={data.total}
            path={path}
            query={Object.fromEntries(params)}
          />
          <h2>الأقسام الأكثر قراءة</h2>
          <DataTable
            rows={data.categories}
            columns={[
              ["name", "القسم"],
              ["views", "المشاهدات"],
            ]}
          />
          <h2>أداء الكتّاب والتحرير</h2>
          <DataTable
            rows={data.authors}
            columns={[
              ["display_name", "الكاتب"],
              ["posts", "التدوينات"],
              ["published", "المنشورة"],
              ["drafts", "المسودات"],
              ["scheduled", "المجدولة"],
              ["views", "المشاهدات"],
            ]}
          />
          <p>
            مصادر الزيارات والأجهزة وزمن المراجعة غير معروضة لعدم وجود قياس
            مكتمل لها.
          </p>
        </>
      )}
      {resource === "users" && (
        <>
          <form method="get" className="toolbar">
            <label>
              بحث بالبريد
              <input
                name="q"
                defaultValue={params.get("q") || ""}
                maxLength={100}
              />
            </label>
            <button className="button">بحث</button>
          </form>
          <DataTable
            rows={data.rows}
            columns={[
              ["email", "البريد"],
              ["roles", "الأدوار"],
              ["enabled", "مفعّل"],
              ["scope_mode", "نطاق الأقسام"],
              ["last_activity_at", "آخر نشاط مسجل"],
              ["assigned_by", "عيّنه"],
              ["assigned_at", "التعيين"],
            ]}
          />
          <Pagination
            page={page}
            total={data.total}
            path={path}
            query={Object.fromEntries(params)}
          />
          <UsersEditor
            users={data.rows.filter((u: Row) => u.user_id !== identity.user.id)}
            roles={roles}
            categories={categories}
          />
          <Link href="/admin/users/invitations" className="button outline">
            إدارة الدعوات
          </Link>
        </>
      )}
      {resource === "invitations" && (
        <>
          <InvitationsEditor roles={roles} categories={categories} />
          <DataTable
            rows={data.rows}
            columns={[
              ["email", "البريد"],
              ["status", "الحالة"],
              ["expires_at", "انتهاء الصلاحية"],
              ["delivery_status", "إرسال البريد"],
            ]}
          />
          {data.rows
            .filter((r: Row) => r.status === "pending")
            .map((r: Row) => (
              <p key={String(r.id)}>
                {String(r.email)}{" "}
                <Action
                  label="إلغاء الدعوة"
                  danger
                  resource="invitations"
                  body={{ action: "revoke", id: r.id }}
                />
              </p>
            ))}
          <Pagination page={page} total={data.total} path={path} />
        </>
      )}
      {resource === "roles" && (
        <>
          <RolesEditor roles={roles} permissions={permissions} />
          <DataTable
            rows={data.grants}
            columns={[
              ["role_id", "معرّف الدور"],
              ["permission_key", "الصلاحية"],
              ["scope", "النطاق"],
              ["enabled", "مفعّلة"],
            ]}
          />
        </>
      )}
      {resource === "permissions" && (
        <>
          <DataTable
            rows={data}
            columns={[
              ["key", "الصلاحية"],
              ["description", "الوصف"],
            ]}
          />
          {users.length > 0 && (
            <OverridesEditor users={users} permissions={permissions} />
          )}
        </>
      )}
      {resource === "menus" && (
        <>
          <MenuEditor items={data.rows} categories={categories} />
          <DataTable
            rows={data.rows}
            columns={[
              ["label", "الرابط"],
              ["location", "الموضع"],
              ["href", "الوجهة"],
              ["is_active", "ظاهر"],
              ["sort_order", "الترتيب"],
            ]}
          />
          <Pagination page={page} total={data.total} path={path} />
        </>
      )}
      {resource === "integrations" && <IntegrationsEditor items={data.rows} />}
      {resource === "security" && (
        <>
          <PinProtection configured={identity.access.pin_configured} />
          <p>
            الحساب المالك مرتبط بمعرّف Supabase Auth مؤكد. لا توجد واجهة نقل
            ملكية في هذه المرحلة؛ لا يمكن لمشرف تعطيله أو تغييره.
          </p>
          <h2>الجلسات المتاحة من Supabase Auth</h2>
          <p>
            آخر 50 جلسة. «مبطلة إدارياً» يمنع وصولها للوحة، ولا يدّعي إبطال JWT
            في خدمات خارج هذا التطبيق.
          </p>
          <DataTable
            rows={data.sessions}
            columns={[
              ["user_id", "الحساب"],
              ["created_at", "الإنشاء"],
              ["updated_at", "آخر تحديث"],
              ["aal", "مستوى المصادقة"],
              ["not_after", "الانتهاء"],
              ["admin_revoked", "مبطلة إدارياً"],
            ]}
          />
          <section className="control-card">
            <h2>إبطال جلسة إدارية</h2>
            <p>
              استخدم تسجيل الخروج لإنهاء الجلسة الحالية. الجلسة المبطلة تفقد
              الوصول الإداري فوراً.
            </p>
            {data.sessions
              .filter(
                (s: Row) =>
                  !s.admin_revoked && s.id !== data.current_session_id,
              )
              .map((s: Row) => (
                <p key={String(s.id)}>
                  {String(s.user_id)} · {String(s.created_at)}{" "}
                  <Action
                    resource="security"
                    label="إبطال الجلسة"
                    danger
                    body={{ id: s.id, action: "revoke" }}
                  />
                </p>
              ))}
          </section>
          <h2>أحداث الأمان</h2>
          <DataTable
            rows={data.events}
            columns={[
              ["event_type", "الحدث"],
              ["actor_id", "الفاعل"],
              ["result", "النتيجة"],
              ["created_at", "الوقت"],
              ["request_id", "الطلب"],
            ]}
          />
          <Pagination page={page} total={data.total || 0} path={path} />
          <Link href="/admin/settings?tab=security">
            سياسة الجلسات والاحتفاظ
          </Link>
        </>
      )}
      {resource === "audit-logs" && (
        <>
          <form className="toolbar" method="get">
            <label>
              الإجراء
              <input name="q" defaultValue={params.get("q") || ""} />
            </label>
            <label>
              من
              <input
                type="date"
                name="from"
                defaultValue={params.get("from") || ""}
              />
            </label>
            <label>
              إلى
              <input
                type="date"
                name="to"
                defaultValue={params.get("to") || ""}
              />
            </label>
            <button className="button">تصفية</button>
          </form>
          <DataTable
            rows={data.rows}
            columns={[
              ["action", "الإجراء"],
              ["actor_id", "الفاعل"],
              ["entity_type", "نوع المورد"],
              ["entity_id", "المورد"],
              ["created_at", "الوقت"],
              ["result", "النتيجة"],
              ["metadata", "التفاصيل"],
              ["request_id", "الطلب"],
            ]}
          />
          <Link
            className="button outline"
            href={
              "/api/v1/admin/audit-logs?" +
              new URLSearchParams({
                ...Object.fromEntries(params),
                format: "csv",
              })
            }
          >
            تصدير هذه الصفحة CSV
          </Link>
          <Pagination
            page={page}
            total={data.total}
            path={path}
            query={Object.fromEntries(params)}
          />
        </>
      )}
      {resource === "notifications" && (
        <>
          {!data.rows.length && <p>لا توجد إشعارات غير مؤرشفة.</p>}
          {data.rows.map((r: Row) => (
            <article className="control-card" key={String(r.id)}>
              <h2>{String(r.title)}</h2>
              <p>
                {r.read_at ? "مقروء" : "غير مقروء"} ·{" "}
                {r.priority === "high" ? "أولوية عالية" : "عادي"} ·{" "}
                {String(r.created_at)}
              </p>
              <Link href={String(r.href)}>فتح الإجراء</Link>
              <div className="toolbar">
                <Action
                  resource="notifications"
                  label={r.read_at ? "تعليم كغير مقروء" : "تعليم كمقروء"}
                  body={{ id: r.id, action: r.read_at ? "unread" : "read" }}
                />
                <Action
                  resource="notifications"
                  label="أرشفة"
                  body={{ id: r.id, action: "archive" }}
                />
              </div>
            </article>
          ))}
          <Pagination page={page} total={data.total} path={path} />
        </>
      )}
      {resource === "backups" && (
        <section className="control-card">
          <h2>حالة النسخ الاحتياطي</h2>
          <p>
            لم يُتحقق من وجود نسخة آلية ناجحة أو اختبار استعادة على هذا المشروع.
            تعتمد ميزات Supabase المتاحة على الخطة الفعلية.
          </p>
          <p>
            السياسة التشغيلية المقترحة: نسخة PostgreSQL يومية مشفرة خارج
            المشروع، الاحتفاظ 30 يوماً، ونسخ مستقل لكائنات Storage؛ نسخة قاعدة
            البيانات وحدها لا تتضمن الملفات.
          </p>
          <p>
            مسؤول الاستعادة: المالك أو مسؤول مفوض منه. يجب استعادة PostgreSQL
            والملفات أولاً في مشروع اختبار، ثم التحقق من RLS والمصادقة والروابط
            وعدد الملفات قبل اعتماد أي استعادة إنتاجية.
          </p>
          <p>لا توجد عملية استعادة إنتاجية متاحة من هذه اللوحة.</p>
        </section>
      )}
    </>
  );
}
async function RecentAudit() {
  const identity = await authorizedUser();
  if (!identity?.permissions["audit.read"]) return null;
  const { data, error } = await identity.db
    .from("audit_logs")
    .select("action,entity_type,created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return <p>تعذر تحميل آخر العمليات.</p>;
  return (
    <section className="control-card">
      <h2>أحدث العمليات الإدارية</h2>
      <DataTable
        rows={data || []}
        columns={[
          ["action", "الإجراء"],
          ["entity_type", "المورد"],
          ["created_at", "الوقت"],
        ]}
      />
    </section>
  );
}
