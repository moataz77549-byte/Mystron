"use client";
import { useState } from "react";
import { ControlForm, Action, command, type Field } from "./form";
type Row = Record<string, unknown>;
const opts = (rows: Row[], key = "name") =>
  rows.map((r) => ({ value: String(r.id), label: String(r[key] || r.id) }));
const bool = (key: string, label: string): Field => ({
  key,
  label,
  type: "checkbox",
});
const select = (
  key: string,
  label: string,
  options: { value: string; label: string }[],
): Field => ({ key, label, type: "select", options });
const scopes = [
  { value: "all", label: "جميع التدوينات ضمن الأقسام المسموحة" },
  { value: "own", label: "تدوينات المستخدم نفسه" },
];
export function UsersEditor({
  users,
  roles,
  categories,
}: {
  users: Row[];
  roles: Row[];
  categories: Row[];
}) {
  const editable = users.filter(
    (u) => !((u.roles as Row[]) || []).some((r) => r.name === "OWNER"),
  );
  const [id, setId] = useState(String(editable[0]?.user_id || ""));
  const user = editable.find((u) => u.user_id === id);
  if (!user)
    return (
      <p>
        لا توجد حسابات قابلة للإدارة. تُضاف الحسابات بواسطة الدعوات الموثقة.
      </p>
    );
  return (
    <section className="control-card">
      <h2>إدارة مشرف</h2>
      <label>
        المشرف
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {editable.map((u) => (
            <option key={String(u.user_id)} value={String(u.user_id)}>
              {String(u.email)}
            </option>
          ))}
        </select>
      </label>
      <ControlForm
        key={id}
        initial={{
          role_id: (user.roles as Row[])?.[0]?.id,
          enabled: user.enabled,
          scope: user.scope_mode,
          category_ids: user.category_ids,
          revoke: false,
        }}
        fields={[
          select(
            "role_id",
            "الدور",
            opts(roles.filter((r) => r.name !== "OWNER")),
          ),
          bool("enabled", "الحساب الإداري مفعّل"),
          select("scope", "نطاق الأقسام", [
            { value: "all", label: "جميع الأقسام" },
            { value: "restricted", label: "أقسام محددة" },
          ]),
          {
            key: "category_ids",
            label: "الأقسام المسموحة (اختيار متعدد)",
            type: "multi",
            options: opts(categories),
          },
          bool("revoke", "إبطال الجلسات الإدارية الحالية"),
        ]}
        confirm="تأكيد تغيير صلاحيات المشرف أو حالة وصوله؟"
        submit={(v) =>
          command("users", {
            user_id: id,
            role_id: v.role_id,
            enabled: v.enabled,
            scope: v.scope,
            category_ids: v.category_ids,
            revoke: v.revoke,
          })
        }
      />
      <p>
        الحساب المعطّل يفقد الوصول الإداري فوراً. إبطال الجلسات هنا يمنع
        استعمالها إدارياً حتى بعد تحديث JWT؛ يلزم تسجيل دخول جديد.
      </p>
    </section>
  );
}
export function InvitationsEditor({
  roles,
  categories,
}: {
  roles: Row[];
  categories: Row[];
}) {
  return (
    <section className="control-card">
      <h2>دعوة مشرف</h2>
      <p>لن تُمنح صلاحية قبل قبول الدعوة والتحقق من بريد المستلم.</p>
      <ControlForm
        initial={{ hours: 24, scope: "all" }}
        fields={[
          {
            key: "email",
            label: "البريد الإلكتروني",
            type: "email",
            required: true,
          },
          select(
            "role_id",
            "الدور",
            opts(roles.filter((r) => r.name !== "OWNER")),
          ),
          select("scope", "نطاق الأقسام", [
            { value: "all", label: "جميع الأقسام" },
            { value: "restricted", label: "قسم محدد" },
          ]),
          {
            key: "category_ids",
            label: "الأقسام المسموحة (اختيار متعدد)",
            type: "multi",
            options: opts(categories),
          },
          {
            key: "hours",
            label: "صلاحية الدعوة بالساعات",
            type: "number",
            min: 1,
            max: 168,
            required: true,
          },
        ]}
        label="إرسال الدعوة"
        submit={(v) =>
          command("invitations", {
            action: "create",
            email: v.email,
            role_id: v.role_id,
            scope: v.scope,
            category_ids: v.category_ids,
            hours: v.hours,
          })
        }
      />
    </section>
  );
}
export function RolesEditor({
  roles,
  permissions,
}: {
  roles: Row[];
  permissions: Row[];
}) {
  return (
    <section className="control-card">
      <h2>تخصيص صلاحيات الدور</h2>
      <p>صلاحيات المالك محفوظة. تعديل الأدوار يتطلب PIN وإعادة مصادقة حديثة.</p>
      <ControlForm
        initial={{ scope: "all", enabled: true }}
        fields={[
          select(
            "role_id",
            "الدور",
            opts(roles.filter((r) => r.name !== "OWNER")),
          ),
          select(
            "permission",
            "الصلاحية",
            permissions
              .filter(
                (p) =>
                  ![
                    "roles.manage",
                    "security.manage",
                    "integrations.manage",
                    "maintenance.manage",
                  ].includes(String(p.key)),
              )
              .map((p) => ({ value: String(p.key), label: String(p.key) })),
          ),
          select("scope", "نطاق التدوينات", scopes),
          bool("enabled", "منح الصلاحية"),
        ]}
        confirm="تأكيد تغيير صلاحية هذا الدور؟"
        submit={(v) => command("roles", v)}
      />
    </section>
  );
}
export function OverridesEditor({
  users,
  permissions,
}: {
  users: Row[];
  permissions: Row[];
}) {
  return (
    <section className="control-card">
      <h2>استثناء صلاحية لمستخدم</h2>
      <p>
        المنع الصريح يتقدم على صلاحيات الأدوار. لا يمكن تعديل المالك أو ترقية
        النفس.
      </p>
      <ControlForm
        initial={{ scope: "own", effect: "deny", enabled: true }}
        fields={[
          select(
            "user_id",
            "المشرف",
            users.map((u) => ({
              value: String(u.user_id),
              label: String(u.email),
            })),
          ),
          select(
            "permission",
            "الصلاحية",
            permissions
              .filter(
                (p) =>
                  ![
                    "roles.manage",
                    "security.manage",
                    "integrations.manage",
                    "maintenance.manage",
                  ].includes(String(p.key)),
              )
              .map((p) => ({ value: String(p.key), label: String(p.key) })),
          ),
          select("effect", "الإجراء", [
            { value: "deny", label: "منع" },
            { value: "allow", label: "منح" },
          ]),
          select("scope", "النطاق", scopes),
          bool("enabled", "تفعيل الاستثناء"),
        ]}
        confirm="تأكيد تعديل الاستثناء؟"
        submit={(v) => command("permissions", v)}
      />
    </section>
  );
}
export function MenuEditor({
  items,
  categories,
}: {
  items: Row[];
  categories: Row[];
}) {
  const [id, setId] = useState("");
  const item = items.find((i) => i.id === id);
  const defaults: Row = {
    location: "header",
    target_type: "page",
    href: "/",
    is_active: true,
    sort_order: 0,
    ...item,
  };
  return (
    <section className="control-card">
      <h2>تحرير القائمة</h2>
      <label>
        العنصر
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">رابط جديد</option>
          {items.map((i) => (
            <option key={String(i.id)} value={String(i.id)}>
              {String(i.label)}
            </option>
          ))}
        </select>
      </label>
      <ControlForm
        key={id}
        initial={defaults}
        fields={[
          { key: "label", label: "النص", required: true },
          select(
            "location",
            "الموضع",
            ["header", "mobile", "footer", "secondary"].map((v, i) => ({
              value: v,
              label: ["الرأس", "الهاتف", "التذييل", "القائمة الثانوية"][i],
            })),
          ),
          select("target_type", "نوع الوجهة", [
            { value: "page", label: "صفحة" },
            { value: "category", label: "قسم" },
            { value: "external", label: "رابط خارجي HTTPS" },
          ]),
          {
            key: "href",
            label: "الرابط للصفحة أو الموقع الخارجي",
            help: "الصفحات: /، /about، /privacy، /search",
          },
          select("category_id", "القسم", [
            { value: "", label: "دون قسم" },
            ...opts(categories),
          ]),
          select("parent_id", "الرابط الأب", [
            { value: "", label: "دون رابط أب" },
            ...opts(
              items.filter((i) => i.id !== id),
              "label",
            ),
          ]),
          {
            key: "sort_order",
            label: "الترتيب",
            type: "number",
            min: -10000,
            max: 10000,
          },
          bool("is_active", "ظاهر"),
        ]}
        submit={(v) =>
          command("menus", {
            id: id || null,
            value: {
              ...v,
              parent_id: v.parent_id || null,
              category_id: v.category_id || null,
              href: v.href || null,
            },
            delete: false,
          })
        }
      />
      {item && (
        <Action
          resource="menus"
          label="حذف الرابط"
          danger
          body={{
            id,
            value: {},
            delete: true,
          }}
        />
      )}
    </section>
  );
}
export function IntegrationsEditor({ items }: { items: Row[] }) {
  const [status, setStatus] = useState<Record<string, string>>({});
  return (
    <div className="control-grid">
      {items.map((i) => (
        <section className="control-card" key={String(i.id)}>
          <h2>{String(i.id).toUpperCase()}</h2>
          <p className="status-badge">
            {status[String(i.id)] ||
              (i.enabled ? "غير مهيأ — بانتظار تحقق الاتصال" : "معطّل")}
          </p>
          <ControlForm
            initial={{ enabled: i.enabled, ...(i.config as Row) }}
            fields={[
              bool("enabled", "تفعيل الإعداد"),
              { key: "label", label: "الاسم الوصفي" },
              { key: "note", label: "ملاحظة غير سرية", type: "textarea" },
            ]}
            submit={(v) =>
              command("integrations", {
                id: i.id,
                enabled: v.enabled,
                config: { label: v.label, note: v.note },
                action: "save",
              })
            }
          />
          {i.id === "supabase" ? (
            <button
              className="button outline"
              onClick={async () => {
                try {
                  const r = await command("integrations", {
                    id: i.id,
                    enabled: i.enabled,
                    config: i.config,
                    action: "check",
                  });
                  setStatus((s) => ({ ...s, [String(i.id)]: r.message }));
                } catch {
                  setStatus((s) => ({ ...s, [String(i.id)]: "تعذر الفحص" }));
                }
              }}
            >
              فحص الاتصال الفعلي
            </button>
          ) : (
            <p>
              التنفيذ الفعلي لهذا التكامل مؤجل. تُحفظ الأسرار في إعدادات البيئة،
              ولا تُدخل في الملاحظات.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
