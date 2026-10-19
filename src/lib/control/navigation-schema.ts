export type AdminLink = { path: string; label: string; permission: string };
export type AdminGroup = { id: string; label: string; links: AdminLink[] };
const link = (path: string, label: string, permission = ""): AdminLink => ({
  path,
  label,
  permission,
});
export const adminGroups: AdminGroup[] = [
  {
    id: "overview",
    label: "الرئيسية",
    links: [
      link("dashboard", "لوحة التحكم", "dashboard.read"),
      link("audit-logs", "آخر النشاطات", "audit.read"),
      link("notifications", "التنبيهات", "notifications.read"),
      link("analytics", "الإحصائيات", "analytics.read"),
    ],
  },
  {
    id: "content",
    label: "إدارة المحتوى",
    links: [
      link("posts", "جميع المقالات", "posts.read"),
      link("posts/new", "إضافة مقال جديد", "posts.create"),
      link("posts?status=draft", "المسودات", "posts.read"),
      link("posts?status=review", "قيد المراجعة", "posts.read"),
      link("scheduled", "المجدولة", "posts.schedule"),
      link("posts?status=published", "المنشورة", "posts.read"),
      link("posts?status=archived", "الأرشيف", "posts.read"),
      link("posts?status=trash", "المحذوفة مؤقتاً", "posts.read"),
    ],
  },
  {
    id: "editorial",
    label: "الإدارة التحريرية",
    links: [
      link("editorial", "استوديو التحرير", "posts.read"),
      link("categories", "الأقسام", "categories.manage"),
      link("authors", "الكتّاب", "authors.manage"),
      link("media", "مكتبة الوسائط", "media.manage"),
      link("comments", "التعليقات والبلاغات", "comments.moderate"),
    ],
  },
  {
    id: "site",
    label: "إدارة الموقع",
    links: [
      link("settings?tab=home", "الصفحة الرئيسية", "settings.read"),
      link("menus", "القوائم", "menus.manage"),
      link("announcements", "شريط الأخبار والتنبيهات", "announcements.manage"),
      link("advertisements", "الإعلانات", "announcements.manage"),
      link("settings?tab=seo", "تحسين محركات البحث", "settings.read"),
      link("settings", "إعدادات المنصة", "settings.read"),
    ],
  },
  {
    id: "security",
    label: "الإدارة والأمان",
    links: [
      link("users", "المشرفون", "users.manage"),
      link("roles", "الأدوار", "roles.manage"),
      link("permissions", "الصلاحيات", "roles.manage"),
      link("users/invitations", "الدعوات", "users.invite"),
      link("security", "مركز الأمان والجلسات", "security.manage"),
      link("backups", "النسخ الاحتياطية", "backups.read"),
    ],
  },
  {
    id: "integrations",
    label: "التكاملات",
    links: [
      link("telegram", "Telegram"),
      link("ai", "الذكاء الاصطناعي", "integrations.manage"),
      link("integrations", "Supabase وVercel والخدمات", "integrations.manage"),
    ],
  },
  {
    id: "account",
    label: "حسابي",
    links: [link("account", "الملف الشخصي وحماية PIN")],
  },
];
export const adminLinks = adminGroups.flatMap((group) => group.links);
export function permittedNavigation(permissions: string[], query = "") {
  const needle = query.trim().toLocaleLowerCase("ar");
  return adminGroups
    .map((group) => ({
      ...group,
      links: group.links.filter(
        (entry) =>
          (!entry.permission || permissions.includes(entry.permission)) &&
          (!needle ||
            entry.label.toLocaleLowerCase("ar").includes(needle) ||
            group.label.includes(needle)),
      ),
    }))
    .filter((group) => group.links.length);
}
