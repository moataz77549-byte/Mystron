"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  LayoutDashboard,
  Menu,
  PenLine,
  Search,
  X,
} from "lucide-react";
import { permittedNavigation } from "@/lib/control/navigation-schema";
export { adminLinks, type AdminLink } from "@/lib/control/navigation-schema";
function subscribeViewport(listener: () => void) {
  const media = matchMedia("(min-width: 801px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const desktopSnapshot = () => matchMedia("(min-width: 801px)").matches;
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
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const desktop = useSyncExternalStore(
    subscribeViewport,
    desktopSnapshot,
    () => true,
  );
  const pathname = usePathname(),
    params = useSearchParams();
  const groups = permittedNavigation(permissions, search);
  const currentPath = pathname.replace(/^\/admin\/?/, "");
  const matches = (path: string) => {
    const [base, query] = path.split("?");
    return (
      base === currentPath &&
      (query
        ? Array.from(new URLSearchParams(query)).every(
            ([key, value]) => params.get(key) === value,
          )
        : !params.get("status") && !params.get("tab"))
    );
  };
  const current = permittedNavigation(permissions)
    .flatMap((g) => g.links)
    .find((l) => matches(l.path));
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !(event.target as HTMLElement)?.isContentEditable
      ) {
        event.preventDefault();
        setCollapsed(false);
        setOpen(true);
        requestAnimationFrame(() => input.current?.focus());
      }
      if (event.key === "Escape") setOpen(false);
    }
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (desktop || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    const returnFocus = previous || menu.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled]),input:not([disabled])",
        ) || [],
      ).filter((e) => e.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener("keydown", trap);
      returnFocus?.focus();
    };
  }, [desktop, open]);
  return (
    <div
      className={`admin control-shell editorial-shell ${open ? "nav-open" : ""} ${collapsed ? "nav-collapsed" : ""}`}
    >
      {open && !desktop && (
        <button
          className="admin-backdrop"
          aria-label="إغلاق القائمة الجانبية"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="admin-navigation"
        aria-label="لوحة الإدارة"
        role={!desktop && open ? "dialog" : undefined}
        aria-modal={!desktop && open ? true : undefined}
        inert={desktop ? collapsed : !open}
      >
        <div className="control-brand">
          <Link href="/admin/dashboard">
            ما يسطرون<small>MAYSTROON · استوديو النشر</small>
          </Link>
          <button
            className="drawer-close icon-button"
            aria-label="إغلاق تنقل الإدارة"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <label className="command-search">
          <Search size={17} aria-hidden="true" /> ابحث في أقسام الإدارة
          <input
            ref={input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث سريع · Ctrl K"
          />
        </label>
        <nav aria-label="أقسام الإدارة">
          {groups.map((group) => {
            const expanded = !!search || !closedGroups.includes(group.id);
            return (
              <div className="admin-nav-group" key={group.id}>
                <button
                  aria-expanded={expanded}
                  aria-controls={`nav-group-${group.id}`}
                  className="nav-group-title"
                  onClick={() =>
                    setClosedGroups((old) =>
                      old.includes(group.id)
                        ? old.filter((id) => id !== group.id)
                        : [...old, group.id],
                    )
                  }
                >
                  <span>{group.label}</span>
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
                <div id={`nav-group-${group.id}`} hidden={!expanded}>
                  {group.links.map((entry) => (
                    <Link
                      key={entry.path}
                      href={`/admin/${entry.path}`}
                      aria-current={matches(entry.path) ? "page" : undefined}
                      onClick={() => setOpen(false)}
                    >
                      <span>{entry.label}</span>
                      {matches(entry.path) && (
                        <span className="nav-active-dot" aria-hidden="true" />
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
          {!groups.length && (
            <p className="nav-empty">لا توجد نتائج ضمن صلاحياتك.</p>
          )}
        </nav>
        <form action="/auth/logout" method="post">
          <button className="button outline">تسجيل الخروج</button>
        </form>
      </aside>
      <section
        className="admin-workspace"
        inert={!desktop && open}
        aria-hidden={!desktop && open ? true : undefined}
      >
        <div className="admin-topbar">
          <button
            ref={menu}
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
            aria-expanded={!collapsed}
            aria-controls="admin-navigation"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "إظهار القائمة" : "طي القائمة"}
          </button>
          <div className="workspace-title">
            <LayoutDashboard size={18} aria-hidden="true" />
            <span>مساحتك التحريرية</span>
          </div>
          <Link href="/" className="public-site-link">
            عرض الموقع <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <span dir="ltr" className="admin-identity">
            {email}
          </span>
          {permissions.includes("posts.create") && (
            <Link
              className="button new-article-shortcut"
              href="/admin/posts/new"
            >
              <PenLine size={16} aria-hidden="true" /> إنشاء مقال جديد
            </Link>
          )}
        </div>
        <nav aria-label="مسار التنقل" className="breadcrumbs">
          <Link href="/admin/dashboard">الإدارة</Link>
          <span aria-hidden="true">/</span>
          <span>
            {current?.label ||
              (pathname.endsWith("/edit") ? "تحرير المقال" : "استوديو النشر")}
          </span>
        </nav>
        <div className="admin-page-content">{children}</div>
      </section>
    </div>
  );
}
