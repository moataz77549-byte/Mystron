"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, Search, X } from "lucide-react";
export type AdminLink = { path: string; label: string; permission: string };
export const adminLinks: AdminLink[] = [
  ["dashboard", "مركز التحكم", "dashboard.read"],
  ["posts", "التدوينات", "posts.read"],
  ["categories", "الأقسام", "categories.manage"],
  ["authors", "الكتّاب", "authors.manage"],
  ["media", "الوسائط", "media.manage"],
  ["comments", "التعليقات", "comments.moderate"],
  ["scheduled", "النشر المجدول", "posts.schedule"],
  ["editorial", "التحرير", "posts.read"],
  ["analytics", "التحليلات", "analytics.read"],
  ["users", "المشرفون", "users.manage"],
  ["users/invitations", "الدعوات", "users.invite"],
  ["roles", "الأدوار", "roles.manage"],
  ["permissions", "الصلاحيات", "roles.manage"],
  ["settings", "إعدادات المنصة", "settings.read"],
  ["menus", "القوائم", "menus.manage"],
  ["announcements", "الإعلانات والتنبيهات", "announcements.manage"],
  ["security", "مركز الأمان", "security.manage"],
  ["audit-logs", "سجل التدقيق", "audit.read"],
  ["notifications", "الإشعارات", "notifications.read"],
  ["ai", "الذكاء الاصطناعي", "integrations.manage"],
  ["telegram", "حساب Telegram", ""],
  ["integrations", "التكاملات", "integrations.manage"],
  ["backups", "النسخ الاحتياطية", "backups.read"],
  ["account", "حسابي", ""],
].map(([path, label, permission]) => ({ path, label, permission }));
export function AdminShell({
  permissions,
  email,
  children,
}: {
  permissions: string[];
  email: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const links = adminLinks.filter(
    (l) => !l.permission || permissions.includes(l.permission),
  );
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        input.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    }
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const current = links.find((l) => pathname === "/admin/" + l.path);
  return (
    <div
      className={`admin control-shell ${open ? "nav-open" : ""} ${collapsed ? "nav-collapsed" : ""}`}
    >
      <aside aria-label="لوحة الإدارة" id="admin-navigation">
        <div className="control-brand">
          ما يسطرون<small>مركز التحكم</small>
        </div>
        <label className="command-search">
          <Search size={16} />
          ابحث في أقسام الإدارة
          <input
            ref={input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ctrl K"
          />
        </label>
        <nav>
          {links
            .filter((l) => l.label.includes(search))
            .map((l) => (
              <Link
                key={l.path}
                href={"/admin/" + l.path}
                aria-current={
                  pathname === "/admin/" + l.path ? "page" : undefined
                }
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
        </nav>
        <form action="/auth/logout" method="post">
          <button className="button outline">تسجيل الخروج</button>
        </form>
      </aside>
      <section>
        <div className="admin-topbar">
          <button
            className="icon-button"
            aria-label={open ? "إغلاق تنقل الإدارة" : "فتح تنقل الإدارة"}
            aria-controls="admin-navigation"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
          <button
            className="button outline desktop-collapse"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "إظهار القائمة" : "طي القائمة"}
          </button>
          <span dir="ltr">{email}</span>
        </div>
        <nav aria-label="مسار التنقل" className="breadcrumbs">
          <Link href="/admin/dashboard">الإدارة</Link> /{" "}
          {current?.label || "استوديو النشر"}
        </nav>
        {children}
      </section>
    </div>
  );
}
