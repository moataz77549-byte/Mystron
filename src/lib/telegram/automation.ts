import "server-only";
import { createHash } from "node:crypto";
import { embedTracked } from "../ai/service";
import { privilegedDatabase } from "../supabase";
import { configuration, provider, embeddingModelKey } from "../ai/runtime";
import { chunks } from "../../../packages/ai/knowledge";
import { AIError } from "../../../packages/ai/provider";
import {
  telegramUpdate,
  type BotReply,
} from "../../../packages/contracts/telegram";
import { processTelegram } from "./engine";
import { siteUrl } from "../env";
type Job = {
  id: string;
  lease_token: string;
  kind: string;
  payload: Record<string, unknown>;
};
const checked = <T>(result: { data: T; error: unknown }) => {
  if (result.error) throw new Error("AUTOMATION_DATABASE_FAILED");
  return result.data;
};
async function indexJob(job: Job) {
  const db = privilegedDatabase();
  let config;
  try {
    config = await configuration();
    provider(config);
  } catch {
    checked(
      await db.rpc("automation_defer", {
        p_id: job.id,
        p_lease: job.lease_token,
      }),
    );
    return;
  }
  const { data: post, error } = await db
    .from("posts")
    .select(
      "id,title,excerpt,content,version,status,visibility,deleted_at,published_at",
    )
    .eq("id", job.payload.post_id)
    .maybeSingle();
  if (error) throw new Error("DATABASE_UNAVAILABLE");
  if (
    !post ||
    post.status !== "published" ||
    post.visibility !== "public" ||
    post.deleted_at ||
    !post.published_at ||
    new Date(post.published_at) > new Date() ||
    Number(post.version) !== Number(job.payload.version)
  ) {
    checked(
      await db.rpc("automation_finish", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_success: true,
      }),
    );
    return;
  }
  const model = config.embedding_model || process.env.AI_EMBEDDING_MODEL;
  if (!model) {
    checked(
      await db.rpc("automation_defer", {
        p_id: job.id,
        p_lease: job.lease_token,
      }),
    );
    return;
  }
  const all = chunks(`${post.title}\n${post.excerpt || ""}\n${post.content}`),
    cursor =
      Number(
        checked(
          await db.rpc("ai_index_prepare", {
            p_id: job.id,
            p_lease: job.lease_token,
            p_model: embeddingModelKey(config),
          }),
        ),
      ) || 0,
    batch = all.slice(cursor, cursor + 16);
  if (!batch.length) {
    checked(
      await db.rpc("automation_finish", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_success: true,
      }),
    );
    return;
  }
  let vectors: number[][];
  try {
    const digest = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    vectors = await embedTracked(
      batch.map((c) => c.text),
      config,
      {
        session: digest("index:" + post.id),
        visitor: digest("indexer:" + new Date().toISOString().slice(0, 10)),
      },
    );
  } catch (error) {
    if (error instanceof AIError && error.code === "AI_QUOTA_EXCEEDED") {
      checked(
        await db.rpc("automation_defer", {
          p_id: job.id,
          p_lease: job.lease_token,
        }),
      );
      return;
    }
    throw error;
  }
  checked(
    await db.rpc("ai_stage_batch", {
      p_id: job.id,
      p_lease: job.lease_token,
      p_model: embeddingModelKey(config),
      p_chunks: batch.map((chunk, i) => ({ ...chunk, embedding: vectors[i] })),
      p_done: cursor + batch.length >= all.length,
    }),
  );
}
function quiet(hour: number, start: number | null, end: number | null) {
  if (start === null || end === null || start === end) return false;
  return start < end
    ? hour >= start && hour < end
    : hour >= start || hour < end;
}
export { quiet as isQuietHour };
async function notificationJob(job: Job) {
  const db = privilegedDatabase();
  const { data: notification, error } = await db
    .from("admin_notifications")
    .select("id,user_id,kind,title,href,priority,context,created_at")
    .eq("id", job.payload.notification_id)
    .maybeSingle();
  if (error) throw new Error("DATABASE_UNAVAILABLE");
  if (!notification) {
    checked(
      await db.rpc("automation_finish", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_success: true,
      }),
    );
    return;
  }
  const { data: link } = await db
    .from("telegram_links")
    .select("user_id,telegram_id,preferences")
    .eq("user_id", notification.user_id)
    .eq("enabled", true)
    .maybeSingle();
  if (link) {
    const preferences = link.preferences;
    const hour = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Aden",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
    );
    if (
      quiet(
        hour,
        preferences.quiet_start ?? null,
        preferences.quiet_end ?? null,
      )
    ) {
      checked(
        await db.rpc("automation_defer", {
          p_id: job.id,
          p_lease: job.lease_token,
        }),
      );
      return;
    }
    if (
      preferences.enabled &&
      (!preferences.kinds?.length ||
        preferences.kinds.includes(notification.kind)) &&
      (!preferences.priorities?.length ||
        preferences.priorities.includes(notification.priority))
    ) {
      const access = await db.rpc("telegram_read", {
        p_telegram_id: link.telegram_id,
        p_action: "identity",
      });
      if (!access.error && access.data?.permissions?.["notifications.read"]) {
        let body: BotReply = {
          text: String(notification.title),
          permission: "notifications.read",
          auth_fingerprint: access.data.permission_fingerprint,
          keyboard: [
            [{ text: "الإشعارات", callback_data: "go:notifications" }],
          ],
        };
        if (notification.context?.comment_id) {
          const comment = await db.rpc("telegram_read", {
            p_telegram_id: link.telegram_id,
            p_action: "comment",
            p_args: { id: notification.context.comment_id },
          });
          if (comment.error) {
            checked(
              await db.rpc("automation_finish", {
                p_id: job.id,
                p_lease: job.lease_token,
                p_success: true,
              }),
            );
            return;
          }
          const c = comment.data;
          body = {
            ...body,
            text: `${c.title}\n${String(c.body).slice(0, 1800)}\n${c.guest_name || "زائر"}\n${new Date(c.created_at).toLocaleString("ar-YE", { timeZone: "Asia/Aden" })}`,
            permission: "comments.moderate",
            post_ids: [c.post_id],
            keyboard: [
              [
                { text: "قبول", callback_data: `comment_approved:${c.id}` },
                { text: "رفض", callback_data: `comment_rejected:${c.id}` },
                { text: "إخفاء", callback_data: `comment_hidden:${c.id}` },
              ],
            ],
          };
          if (siteUrl().protocol === "https:")
            body.keyboard?.push([
              {
                text: "فتح التدوينة",
                url: new URL("/posts/" + c.slug, siteUrl()).href,
              },
            ]);
        }
        const sent = await db.from("telegram_deliveries").upsert(
          {
            dedupe_key: "notification:" + notification.id,
            user_id: link.user_id,
            telegram_id: link.telegram_id,
            body,
            source_notification_id: notification.id,
          },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        );
        if (sent.error) throw new Error("DELIVERY_QUEUE_FAILED");
      }
    }
  }
  checked(
    await db.rpc("automation_finish", {
      p_id: job.id,
      p_lease: job.lease_token,
      p_success: true,
    }),
  );
}
export async function automationWork() {
  const db = privilegedDatabase();
  const jobs = checked(
    await db.rpc("automation_claim", { p_limit: 1 }),
  ) as Job[];
  for (const job of jobs) {
    try {
      if (job.kind === "index") await indexJob(job);
      else if (job.kind === "notification") await notificationJob(job);
      else if (job.kind === "digest") {
        const result = await db.rpc("telegram_read", {
          p_telegram_id: job.payload.telegram_id,
          p_action: "dashboard",
        });
        if (result.error) throw new Error("FORBIDDEN");
        const identity = checked(
          await db.rpc("telegram_read", {
            p_telegram_id: job.payload.telegram_id,
            p_action: "identity",
          }),
        );
        checked(
          await db.from("telegram_deliveries").upsert(
            {
              dedupe_key: job.id,
              user_id: identity.user_id,
              telegram_id: job.payload.telegram_id,
              body: {
                text:
                  "ملخص يومي — بتوقيت عدن\n" +
                  Object.entries(result.data)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n"),
                permission: "dashboard.read",
                auth_fingerprint: identity.permission_fingerprint,
              },
            },
            { onConflict: "dedupe_key", ignoreDuplicates: true },
          ),
        );
        checked(
          await db.rpc("automation_finish", {
            p_id: job.id,
            p_lease: job.lease_token,
            p_success: true,
          }),
        );
      } else if (job.kind === "telegram") {
        const update = checked(
          await db
            .from("telegram_updates")
            .select("payload")
            .eq("update_id", job.payload.update_id)
            .single(),
        );
        let body: BotReply;
        try {
          if (!update) throw new Error("UPDATE_NOT_FOUND");
          body = await processTelegram(telegramUpdate.parse(update.payload));
        } catch (error) {
          const code =
            error instanceof AIError
              ? error.code
              : error instanceof Error
                ? error.message
                : "TELEGRAM_FAILED";
          if (
            [
              "DATABASE_UNAVAILABLE",
              "AUTOMATION_DATABASE_FAILED",
              "TELEGRAM_FILE_FAILED",
              "UPLOAD_FAILED",
            ].includes(code)
          )
            throw error;
          body = {
            text:
              code === "FORBIDDEN"
                ? "لا تملك صلاحية هذه العملية."
                : `تعذرت العملية (${/^[A-Z_]{3,80}$/.test(code) ? code : "INVALID_OPERATION"}). يمكنك المحاولة مجدداً أو العودة للقائمة.`,
            keyboard: [[{ text: "القائمة الرئيسية", callback_data: "home" }]],
          };
        }
        checked(
          await db.rpc("telegram_complete_update", {
            p_id: job.id,
            p_lease: job.lease_token,
            p_update: job.payload.update_id,
            p_body: body,
          }),
        );
      }
    } catch (error) {
      await db.rpc("automation_finish", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_success: false,
        p_error:
          error instanceof AIError
            ? error.code
            : error instanceof Error && /^[A-Z_]+$/.test(error.message)
              ? error.message
              : "AUTOMATION_FAILED",
      });
    }
  }
  const deliveries = checked(await db.rpc("telegram_claim_deliveries"));
  return { processed: jobs.length, deliveries };
}
