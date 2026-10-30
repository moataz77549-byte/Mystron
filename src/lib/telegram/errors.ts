// Only known application errors may become permanent user-facing failures.
// Transport/schema failures must leave the durable update eligible for retry.
const applicationErrors = new Set([
  "FORBIDDEN",
  "VERSION_CONFLICT",
  "STATE_CONFLICT",
  "INVALID_LINK",
  "TELEGRAM_ALREADY_LINKED",
  "PUBLICATION_INCOMPLETE",
  "APPROVAL_REQUIRES_REVIEW",
  "INVALID_ACTION",
  "INVALID_SCHEDULE",
  "INVALID_INPUT",
  "INVALID_MEDIA",
  "NOT_FOUND",
  "POST_DELETED",
  "SLUG_RESERVED",
  "CATEGORY_OUT_OF_SCOPE",
  "PIN_SETUP_REQUIRED",
  "PIN_VERIFICATION_REQUIRED",
  "INVALID_PREFERENCES",
]);
export function telegramRpcError(error: { message: string; code?: string }) {
  if (
    ["TELEGRAM_NOT_LINKED", "TELEGRAM_SESSION_EXPIRED"].includes(error.message)
  )
    return new Error("TELEGRAM_SESSION_EXPIRED");
  if (applicationErrors.has(error.message)) return new Error(error.message);
  if (error.code === "42501") return new Error("FORBIDDEN");
  return new Error("DATABASE_UNAVAILABLE");
}
