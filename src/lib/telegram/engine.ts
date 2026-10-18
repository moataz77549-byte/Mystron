import "server-only";
import { createHash } from "node:crypto";
import { privilegedDatabase } from "../supabase";
import { siteUrl } from "../env";
import { postPatch } from "../cms";
import {
  renderDocument,
  documentText,
  validateDocument,
} from "../editor/document";
import { editorialFromSource } from "../ai/service";
import { editorialActions } from "../../../packages/contracts/ai";
import {
  type TelegramUpdate,
  type BotReply,
} from "../../../packages/contracts/telegram";
import { linkHash } from "./security";
import { telegramFile, storeTelegramImage } from "./files";
type Row = Record<string, unknown>;
type Draft = {
  id?: string;
  version?: number;
  slug?: string;
  title: string;
  text: string;
  category?: string;
  author?: string;
  image?: string;
  excerpt?: string;
  tags?: string[];
};
type State = {
  step?: string;
  draft?: Draft;
  post_id?: string;
  filter?: Record<string, string>;
};
type Identity = {
  permission_fingerprint: string;
  user_id: string;
  permissions: Record<string, string>;
  state: State;
  state_version: number;
};
const button = (text: string, data: string) => ({ text, callback_data: data });
const navigation = [
  [button("القائمة الرئيسية", "home"), button("إلغاء العملية", "cancel")],
];
async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await privilegedDatabase().rpc(name, args);
  if (error)
    throw new Error(
      error.message.includes("FORBIDDEN")
        ? "FORBIDDEN"
        : error.message.includes("VERSION_CONFLICT")
          ? "VERSION_CONFLICT"
          : error.message.includes("TELEGRAM_")
            ? "TELEGRAM_SESSION_EXPIRED"
            : error.message.includes("INVALID_LINK")
              ? "INVALID_LINK"
              : error.message.includes("PUBLICATION_INCOMPLETE")
                ? "PUBLICATION_INCOMPLETE"
                : "TELEGRAM_OPERATION_FAILED",
    );
  return data as T;
}
const publicUrl = (path: string) =>
  siteUrl().protocol === "https:" ? new URL(path, siteUrl()).href : null;
function aden(value: unknown) {
  return value
    ? new Intl.DateTimeFormat("ar-YE", {
        timeZone: "Asia/Aden",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(String(value)))
    : "—";
}
export function scheduledAden(text: string) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text))
    throw new Error("INVALID_ADEN_TIME");
  const date = new Date(text.replace(" ", "T") + ":00+03:00");
  if (!Number.isFinite(date.getTime()) || date <= new Date())
    throw new Error("INVALID_ADEN_TIME");
  const local = new Date(date.getTime() + 3 * 3600000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
  if (local !== text) throw new Error("INVALID_ADEN_TIME");
  return date.toISOString();
}
export async function processTelegram(
  update: TelegramUpdate,
): Promise<BotReply> {
  const message = update.callback_query?.message || update.message;
  const sender = update.callback_query?.from || update.message?.from;
  if (
    !message ||
    !sender ||
    sender.is_bot ||
    message.chat.type !== "private" ||
    message.chat.id !== sender.id
  )
    throw new Error("PRIVATE_CHAT_REQUIRED");
  const id = sender.id,
    updateId = update.update_id,
    callback = update.callback_query?.data || "";
  let text = update.message?.text?.trim() || "";
  const result = (
    body: string,
    keyboard: BotReply["keyboard"] = navigation,
    guard?: { permission: string; post_ids: string[] },
  ): BotReply => ({
    text: body.slice(0, 3500),
    keyboard,
    ...(update.callback_query
      ? {
          edit_message_id: message.message_id,
          callback_query_id: update.callback_query.id,
        }
      : {}),
    ...guard,
    ...(identity?.permission_fingerprint
      ? { auth_fingerprint: identity.permission_fingerprint }
      : {}),
  });
  const read = <T = unknown>(
    action: string,
    args: Record<string, unknown> = {},
  ) =>
    rpc<T>("telegram_read", {
      p_telegram_id: id,
      p_action: action,
      p_args: args,
    });
  const exec = <T = unknown>(
    command: string,
    args: Record<string, unknown>,
    state?: State,
    version?: number,
  ) =>
    rpc<T>("telegram_execute", {
      p_telegram_id: id,
      p_update_id: updateId,
      p_command: command,
      p_args: args,
      p_state: state ?? null,
      p_state_version: version ?? null,
    });
  if (/^\/(?:start|link) [a-f0-9]{64}$/.test(text)) {
    await rpc("telegram_consume_link", {
      p_hash: text.startsWith("/link ")
        ? text.split(" ")[1]
        : linkHash(text.split(" ")[1]),
      p_telegram_id: id,
    });
    text = "/start";
  }
  let identity: Identity;
  try {
    identity = await read<Identity>("identity");
  } catch {
    return result(
      "الحساب غير مربوط أو انتهت جلسته الإدارية. سجل الدخول إلى المنصة وافتح إعدادات Telegram لإنشاء رابط جديد.",
      [],
    );
  }
  const state = identity.state || {},
    can = (p: string) => !!identity.permissions[p];
  const saveState = (next: State) =>
    exec("state", {}, next, identity.state_version);
  const choices = async (kind: "categories" | "authors", prefix: string) => {
    const rows = await read<Row[]>(kind);
    return rows.map((row) => [
      button(String(row.name || row.display_name), prefix + row.id),
    ]);
  };
  const postDetail = async (postId: string) => {
    const post = await read<Row>("post", { id: postId });
    const buttons: NonNullable<BotReply["keyboard"]> = [];
    if (can("posts.update"))
      buttons.push(
        [
          button("تعديل العنوان", `edit_title:${postId}`),
          button("تعديل الملخص", `edit_excerpt:${postId}`),
        ],
        [
          button("تغيير القسم", `edit_category:${postId}`),
          button("تغيير الكاتب", `edit_author:${postId}`),
        ],
        [
          button("تغيير الصورة", `edit_image:${postId}`),
          button("المساعد التحريري", `ai:${postId}`),
        ],
        [button("إرسال للمراجعة", `review:${postId}`)],
      );
    if (can("posts.publish"))
      buttons.push(
        [
          button("نشر", `confirm_publish:${postId}`),
          button("إلغاء النشر", `unpublished:${postId}`),
        ],
        [button("أرشفة", `archived:${postId}`)],
      );
    if (can("posts.schedule"))
      buttons.push([
        button("جدولة / تعديل الموعد", `edit_scheduled:${postId}`),
        button("إلغاء الجدولة", `draft:${postId}`),
      ]);
    const url = publicUrl(`/posts/${post.slug}`);
    if (url && post.status === "published")
      buttons.push([{ text: "فتح التدوينة", url }]);
    return result(
      `${post.title}\nالحالة: ${post.status}\nالموعد بتوقيت عدن: ${aden(post.scheduled_at)}\n${post.excerpt || ""}`,
      buttons.concat(navigation),
      { permission: "posts.read", post_ids: [postId] },
    );
  };
  if (
    callback === "home" ||
    callback === "cancel" ||
    ["/start", "/menu", "/cancel"].includes(text)
  ) {
    await saveState({});
    const buttons: NonNullable<BotReply["keyboard"]> = [];
    if (can("dashboard.read"))
      buttons.push([button("لوحة التحكم", "go:dashboard")]);
    if (can("posts.read"))
      buttons.push(
        [button("التدوينات", "list:all:1"), button("بحث / تصفية", "search")],
        [
          button("المسودات", "list:draft:1"),
          button("المراجعة", "list:review:1"),
        ],
        [
          button("النشر المجدول", "list:scheduled:1"),
          button("المنشورة", "list:published:1"),
        ],
      );
    if (can("posts.create")) buttons.push([button("تدوينة جديدة", "new")]);
    buttons.push([
      button("الأقسام", "go:categories"),
      button("الوسائط", "media_help"),
    ]);
    if (can("comments.moderate"))
      buttons.push([button("التعليقات", "go:comments")]);
    if (can("analytics.read"))
      buttons.push([button("الإحصائيات", "go:dashboard")]);
    if (can("notifications.read"))
      buttons.push([button("الإشعارات", "go:notifications")]);
    buttons.push([
      button("الإعدادات", "preferences"),
      button("المساعدة", "help"),
    ]);
    return result(
      "ما يسطرون | إدارة النشر\nاختر العملية. تُراجع صلاحياتك عند كل إجراء.",
      buttons,
    );
  }
  if (callback === "help")
    return result(
      "ابدأ من لوحة الويب لربط حسابك. المسودات محفوظة لمدة 7 أيام. أرسل النص على رسائل ثم اختر اكتمل النص. الملفات النصية UTF-8 حتى 200KB والصور حتى 5MB وفق سياسة المنصة. الأوقات بتوقيت عدن. الأمان والصلاحيات وPIN تُدار من الويب فقط. /cancel للإلغاء.",
    );
  if (callback === "new") {
    if (!can("posts.create")) throw new Error("FORBIDDEN");
    await saveState({ step: "title" });
    return result("أرسل عنوان التدوينة.");
  }
  if (callback === "media_help") {
    if (!can("media.manage")) throw new Error("FORBIDDEN");
    await saveState({ step: "media" });
    return result(
      "أرسل صورة أو مستند صورة. يمكنك وضع النص البديل في وصف الرسالة. لن يُقبل SVG أو ملف تنفيذي.",
    );
  }
  if (callback.startsWith("go:")) {
    const kind = callback.slice(3);
    if (kind === "dashboard") {
      const data = await read<Row>(kind);
      return result(
        Object.entries(data)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n"),
        navigation,
        { permission: "dashboard.read", post_ids: [] },
      );
    }
    if (kind === "comments") {
      const rows = await read<Row[]>(kind);
      return result(
        rows.length
          ? rows
              .map(
                (r, i) =>
                  `${i + 1}. ${r.title}\n${String(r.body).slice(0, 300)}\n${r.guest_name || "زائر"} · ${aden(r.created_at)}`,
              )
              .join("\n\n")
          : "لا توجد تعليقات معلقة.",
        rows
          .map((r, i) => [
            button(`قبول ${i + 1}`, `comment_approved:${r.id}`),
            button(`رفض ${i + 1}`, `comment_rejected:${r.id}`),
            button(`إخفاء ${i + 1}`, `comment_hidden:${r.id}`),
          ])
          .concat(navigation),
        {
          permission: "comments.moderate",
          post_ids: rows.map((r) => String(r.post_id)),
        },
      );
    }
    if (kind === "notifications") {
      const rows = await read<Row[]>(kind);
      return result(
        rows.length
          ? rows.map((r) => `${r.priority}: ${r.title}`).join("\n")
          : "لا توجد إشعارات.",
        navigation,
        { permission: "notifications.read", post_ids: [] },
      );
    }
    const rows = await read<Row[]>("categories");
    return result(
      rows.map((r) => String(r.name)).join("\n") || "لا توجد أقسام متاحة.",
    );
  }
  if (callback.startsWith("list:")) {
    const [, status, page] = callback.split(":");
    const rows = await read<Row[]>("posts", {
      status: status === "all" ? "" : status,
      page: Number(page),
      ...state.filter,
    });
    return result(
      rows.length ? "التدوينات المتاحة:" : "لا توجد نتائج.",
      rows
        .map((r) => [
          button(`${r.title} · ${r.status}`.slice(0, 60), `post:${r.id}`),
        ])
        .concat(
          [
            [
              button(
                "السابق",
                `list:${status}:${Math.max(1, Number(page) - 1)}`,
              ),
              button("التالي", `list:${status}:${Number(page) + 1}`),
            ],
          ],
          navigation,
        ),
      { permission: "posts.read", post_ids: rows.map((r) => String(r.id)) },
    );
  }
  if (callback === "search") {
    await saveState({ step: "search", filter: {} });
    return result("أرسل عبارة البحث، أو اختر تصفية.", [
      [
        button("بحسب القسم", "filter_category"),
        button("بحسب الكاتب", "filter_author"),
      ],
      ...navigation,
    ]);
  }
  if (callback === "filter_category" || callback === "filter_author") {
    const category = callback.endsWith("category");
    return result("اختر التصفية:", [
      ...(await choices(
        category ? "categories" : "authors",
        category ? "filterc:" : "filtera:",
      )),
      ...navigation,
    ]);
  }
  if (callback.startsWith("filterc:") || callback.startsWith("filtera:")) {
    await saveState({
      filter: {
        [callback.startsWith("filterc:") ? "category_id" : "author_id"]:
          callback.split(":")[1],
      },
    });
    return result("حُفظت التصفية.", [
      [button("عرض النتائج", "list:all:1")],
      ...navigation,
    ]);
  }
  if (callback.startsWith("post:")) return postDetail(callback.slice(5));
  if (callback.startsWith("confirm_publish:"))
    return result("تأكيد نشر هذه التدوينة للعامة؟", [
      [button("تأكيد النشر", callback.replace("confirm_publish:", "publish:"))],
      ...navigation,
    ]);
  if (/^(publish|review|unpublished|archived|draft):/.test(callback)) {
    const [action, postId] = callback.split(":");
    const post = await read<Row>("post", { id: postId });
    await exec(
      "transition",
      { id: postId, version: post.version, action },
      {},
      identity.state_version,
    );
    return result("نُفذت العملية وسُجلت في التدقيق.", [
      [button("عرض التدوينة", `post:${postId}`)],
      ...navigation,
    ]);
  }
  if (callback.startsWith("comment_")) {
    const [command, commentId] = callback.split(":");
    await exec("comment", { id: commentId, action: command.slice(8) });
    return result("تمت مراجعة التعليق.", [
      [button("التعليقات", "go:comments")],
      ...navigation,
    ]);
  }
  if (callback.startsWith("edit_")) {
    const [command, postId] = callback.split(":");
    await read("post", { id: postId });
    const field = command.slice(5);
    await saveState({ step: "edit_" + field, post_id: postId });
    if (field === "category" || field === "author")
      return result("اختر القيمة الجديدة:", [
        ...(await choices(
          field === "category" ? "categories" : "authors",
          field === "category" ? "editc:" : "edita:",
        )),
        ...navigation,
      ]);
    return result(
      field === "scheduled"
        ? "أرسل الموعد بتوقيت عدن: YYYY-MM-DD HH:mm. سيُخزن UTC."
        : field === "image"
          ? "أرسل الصورة مع وصف بديل."
          : "أرسل النص الجديد.",
    );
  }
  if (callback.startsWith("ai:")) {
    const postId = callback.slice(3);
    return result(
      "المساعد التحريري: الاقتراحات للمراجعة فقط، لا تُنشر تلقائياً. يتطلب إرسال النص الخاص موافقة سياسة المالك.",
      editorialActions
        .filter((a) =>
          [
            "title",
            "rewrite",
            "excerpt",
            "tags",
            "seo",
            "social",
            "shorten",
          ].includes(a),
        )
        .map((action) => [button(action, `assist:${action}:${postId}`)])
        .concat(navigation),
    );
  }
  if (callback.startsWith("assist:")) {
    const [, action, postId] = callback.split(":");
    if (!editorialActions.includes(action as (typeof editorialActions)[number]))
      throw new Error("INVALID_ACTION");
    const post = await read<{
      title: string;
      content: string;
      status: string;
      visibility: string;
    }>("ai_source", { id: postId });
    const subject = createHash("sha256")
      .update("telegram:" + identity.user_id)
      .digest("hex");
    const output = await editorialFromSource(
      { post_id: postId, action: action as (typeof editorialActions)[number] },
      { session: subject, visitor: subject, userId: identity.user_id },
      post,
    );
    return result(
      "اقتراح آلي للمراجعة، لم يُطبق على الأصل:\n\n" + output.suggestion,
      navigation,
      { permission: "posts.update", post_ids: [postId] },
    );
  }
  if (callback === "preferences") {
    const settings = await read<Row>("preferences");
    return result("إعدادات إشعارات Telegram\n" + JSON.stringify(settings), [
      [
        button("تفعيل الإشعارات", "pref:on"),
        button("إيقاف الإشعارات", "pref:off"),
      ],
      [
        button("ملخص يومي", "pref:digest"),
        button("ساعات الهدوء", "pref:quiet"),
      ],
      [button("أنواع وأولوية الإشعارات", "pref:types")],
      ...navigation,
    ]);
  }
  if (callback.startsWith("pref:")) {
    const action = callback.slice(5);
    const current = await read<Row>("preferences");
    if (["quiet", "types"].includes(action)) {
      await saveState({
        step: action === "quiet" ? "quiet" : "notification_types",
      });
      return result(
        action === "quiet"
          ? "أرسل ساعات الهدوء بتوقيت عدن، مثال 22-7، أو off."
          : "أرسل الأنواع مفصولة بفواصل (posts,comments,security,permissions,publishing_runs) ثم | ثم الأولويات normal,high. اترك الأنواع فارغة للكل.",
      );
    }
    await exec("preferences", {
      ...current,
      ...(action === "digest"
        ? { daily_digest: !current.daily_digest }
        : { enabled: action === "on" }),
    });
    return result("حُفظ تفضيل الإشعارات.");
  }
  const attachment = update.message?.photo?.at(-1) || update.message?.document;
  let image: string | undefined;
  if (attachment) {
    const isText = !!update.message?.document?.file_name
      ?.toLowerCase()
      .endsWith(".txt");
    const limit = isText ? 200000 : 5 * 1024 * 1024;
    if ((attachment.file_size || 0) > limit) throw new Error("FILE_TOO_LARGE");
    const bytes = await telegramFile(attachment.file_id, limit);
    if (isText) {
      if (bytes.includes(0)) throw new Error("INVALID_TEXT_FILE");
      text = new TextDecoder("utf-8", { fatal: true })
        .decode(bytes)
        .replace(/^\uFEFF/, "");
    } else {
      image = await storeTelegramImage(
        id,
        updateId,
        bytes,
        update.message?.document?.file_name || "صورة Telegram",
        update.message?.caption || "",
      );
      if (state.step === "media")
        return result("رُفعت الصورة إلى المكتبة مع بياناتها.");
    }
  }
  if (state.step === "quiet") {
    const match = /^(\d{1,2})-(\d{1,2})$/.exec(text);
    if (
      text !== "off" &&
      (!match || Number(match[1]) > 23 || Number(match[2]) > 23)
    )
      return result("استخدم مثال 22-7 أو off.");
    await exec(
      "preferences",
      {
        ...(await read<Row>("preferences")),
        quiet_start: match ? Number(match[1]) : null,
        quiet_end: match ? Number(match[2]) : null,
      },
      {},
      identity.state_version,
    );
    return result("حُفظت ساعات الهدوء.");
  }
  if (state.step === "notification_types") {
    const [types = "", priorities = "normal,high"] = text.split("|");
    const kinds = types
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      levels = priorities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (
      kinds.some(
        (k) =>
          ![
            "posts",
            "comments",
            "security",
            "permissions",
            "publishing_runs",
          ].includes(k),
      ) ||
      levels.some((k) => !["normal", "high"].includes(k))
    )
      return result("نوع أو أولوية غير صالحة.");
    await exec(
      "preferences",
      { ...(await read<Row>("preferences")), kinds, priorities: levels },
      {},
      identity.state_version,
    );
    return result("حُفظت الأنواع والأولويات.");
  }
  if (state.step === "search") {
    await saveState({ filter: { ...state.filter, q: text.slice(0, 100) } });
    return result("جاهز لعرض نتائج البحث.", [
      [button("عرض النتائج", "list:all:1")],
      ...navigation,
    ]);
  }
  if (state.step?.startsWith("edit_") && state.post_id) {
    const post = await read<Row>("post", { id: state.post_id });
    const field = state.step.slice(5);
    if (field === "scheduled") {
      await exec(
        "transition",
        {
          id: post.id,
          version: post.version,
          action: "scheduled",
          scheduled_at: scheduledAden(text),
        },
        {},
        identity.state_version,
      );
      return result("حُفظ موعد النشر بتوقيت عدن.");
    }
    const value =
      field === "image"
        ? image
        : callback.startsWith("editc:") || callback.startsWith("edita:")
          ? callback.split(":")[1]
          : text;
    if (!value) return result("أرسل القيمة المطلوبة.");
    const patch = {
      title: String(post.title),
      slug: String(post.slug),
      ...(field === "title"
        ? { title: value }
        : field === "excerpt"
          ? { excerpt: value }
          : field === "category"
            ? { primary_category_id: value, category_ids: [value] }
            : field === "author"
              ? { author_id: value }
              : field === "image"
                ? { cover_asset_id: value }
                : {}),
    };
    await exec(
      "save",
      { id: post.id, version: post.version, patch: postPatch.parse(patch) },
      {},
      identity.state_version,
    );
    return result("حُفظ التعديل مع نسخة مراجعة جديدة.", [
      [button("عرض التدوينة", `post:${post.id}`)],
      ...navigation,
    ]);
  }
  let draft = state.draft;
  if (state.step === "title") {
    if (!text || text.length > 300)
      return result("أرسل عنواناً من 1 إلى 300 حرف.");
    draft = { title: text, text: "" };
    await saveState({ step: "content", draft });
    return result(
      "أرسل المحتوى على رسالة أو عدة رسائل، أو ملف .txt UTF-8. اختر اكتمل النص عند الانتهاء.",
      [[button("اكتمل النص", "text_done")], ...navigation],
    );
  }
  if (state.step === "content" && draft) {
    if (callback === "text_done" || text === "/done") {
      if (!draft.text.trim()) return result("المحتوى فارغ.");
      await saveState({ step: "category", draft });
      return result("اختر القسم:", [
        ...(await choices("categories", "wc:")),
        ...navigation,
      ]);
    }
    if (text) {
      if (draft.text.length + text.length > 100000)
        throw new Error("CONTENT_TOO_LARGE");
      await saveState({
        step: "content",
        draft: { ...draft, text: draft.text + "\n\n" + text },
      });
    }
    return result("حُفظ الجزء. أرسل المزيد أو اختر اكتمل النص.", [
      [button("اكتمل النص", "text_done")],
      ...navigation,
    ]);
  }
  if (state.step === "category" && draft && callback.startsWith("wc:")) {
    await saveState({
      step: "author",
      draft: { ...draft, category: callback.slice(3) },
    });
    return result("اختر الكاتب:", [
      ...(await choices("authors", "wa:")),
      ...navigation,
    ]);
  }
  if (state.step === "author" && draft && callback.startsWith("wa:")) {
    await saveState({
      step: "image",
      draft: { ...draft, author: callback.slice(3) },
    });
    return result("أرسل صورة الغلاف مع وصف بديل، أو تخطَّ.", [
      [button("تخطي الصورة", "skip")],
      ...navigation,
    ]);
  }
  if (state.step === "image" && draft && (image || callback === "skip")) {
    await saveState({ step: "excerpt", draft: { ...draft, image } });
    return result("أرسل الملخص أو تخطَّ.", [
      [button("تخطي الملخص", "skip")],
      ...navigation,
    ]);
  }
  if (state.step === "excerpt" && draft && (text || callback === "skip")) {
    await saveState({ step: "tags", draft: { ...draft, excerpt: text || "" } });
    return result("أرسل الوسوم مفصولة بفواصل، أو تخطَّ.", [
      [button("تخطي الوسوم", "skip")],
      ...navigation,
    ]);
  }
  if (state.step === "tags" && draft && (text || callback === "skip")) {
    draft = {
      ...draft,
      tags: text
        .split(/[,،]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30),
    };
    await saveState({ step: "preview", draft });
    return result(
      `معاينة: ${draft.title}\n${draft.excerpt || ""}\n${draft.text.slice(0, 1800)}\nالوسوم: ${draft.tags?.join("، ")}`,
      [
        [
          button("حفظ مسودة", "finish:draft"),
          button("إرسال للمراجعة", "finish:review"),
        ],
        ...(can("posts.publish")
          ? [[button("نشر بعد الاعتماد", "finish:publish")]]
          : []),
        ...navigation,
      ],
    );
  }
  if (state.step === "preview" && draft && callback.startsWith("finish:")) {
    const action = callback.slice(7);
    if (!["draft", "review", "publish"].includes(action))
      throw new Error("INVALID_ACTION");
    const doc = validateDocument({
      type: "doc",
      content: draft.text
        .trim()
        .split(/\n\n+/)
        .map((line) => ({
          type: "paragraph",
          attrs: { dir: "rtl" },
          content: [{ type: "text", text: line }],
        })),
    });
    const patch = postPatch.parse({
      title: draft.title,
      slug: draft.slug || "telegram-" + updateId,
      content_json: doc,
      author_id: draft.author,
      primary_category_id: draft.category,
      category_ids: [draft.category],
      cover_asset_id: draft.image || null,
      excerpt: draft.excerpt || "",
      tags: draft.tags || [],
    });
    const saved = await exec<Row>(
      "save",
      {
        id: draft.id || null,
        version: draft.version || null,
        patch: {
          ...patch,
          content_html: renderDocument(doc),
          content: documentText(doc),
          media_ids: [],
        },
      },
      { step: "preview", draft },
    );
    if (action !== "draft")
      await exec("transition", {
        id: saved.id,
        version: saved.version,
        action,
      });
    await exec("state", {}, {});
    return result("حُفظت التدوينة. الحالة المطلوبة: " + action, [
      [button("عرض التدوينة", `post:${saved.id}`)],
      ...navigation,
    ]);
  }
  return result(
    "اختر عملية من القائمة، أو /menu للعودة. المسودة السابقة محفوظة إذا لم تلغها.",
  );
}
