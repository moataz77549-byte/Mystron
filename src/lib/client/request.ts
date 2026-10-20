/** Shared browser transport. Never display upstream database messages to users. */
export class AdminRequestError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public retryAfter = 0,
  ) {
    super(code);
    this.name = "AdminRequestError";
  }
}
export function retrySeconds(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds)
    ? Math.min(86400, Math.max(0, Math.ceil(seconds)))
    : 0;
}
export async function adminRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...options });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new AdminRequestError("NETWORK_ERROR");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new AdminRequestError(
      typeof body?.error?.code === "string"
        ? body.error.code
        : "REQUEST_FAILED",
      response.status,
      retrySeconds(response.headers.get("Retry-After")),
    );
  if (!body) throw new AdminRequestError("INVALID_RESPONSE", response.status);
  return body as T;
}
const messages: Record<string, string> = {
  SERVICE_UNAVAILABLE: "الخدمة غير متاحة حالياً. حاول بعد قليل.",
  WEAK_PASSWORD: "كلمة المرور ضعيفة وفق سياسة الأمان. اختر كلمة أقوى.",
  SAME_PASSWORD: "اختر كلمة مرور مختلفة عن الكلمة الحالية.",
  PASSWORD_UPDATE_FAILED: "تعذر حفظ كلمة المرور. حاول مجدداً.",
  REAUTHENTICATION_REQUIRED:
    "يلزم تأكيد هويتك مجدداً. اطلب رابط استعادة جديداً.",
  TAG_BATCH_TOO_LARGE:
    "يتجاوز الوسم حد 500 مقال للعملية الواحدة. يلزم تقسيم العملية بإشراف المسؤول.",
  UNAUTHORIZED: "انتهت الجلسة الإدارية، يرجى تسجيل الدخول مجدداً.",
  RATE_LIMITED:
    "تجاوزت عدد المحاولات المسموح بها، حاول مجدداً بعد انتهاء مدة الانتظار.",
  TELEGRAM_UNCONFIGURED: "إعدادات البوت غير مكتملة على الخادم.",
  TELEGRAM_UNAVAILABLE: "تعذر الاتصال بخدمة الربط. حاول لاحقاً.",
  LINK_EXPIRED: "انتهت صلاحية رابط الربط. أنشئ رابطاً جديداً.",
  INVALID_LINK:
    "انتهت صلاحية رابط الربط أو استُخدم سابقاً. أنشئ رابطاً جديداً.",
  FORBIDDEN: "لا تملك صلاحية تنفيذ هذه العملية.",
  ADMIN_NOT_ASSIGNED: "الحساب مؤكد لكنه لا يمتلك صلاحية إدارية مفعّلة.",
  INVALID_CREDENTIALS:
    "تعذر الدخول. تحقق من البريد وكلمة المرور وتأكيد الحساب.",
  INVALID_ORIGIN:
    "عنوان الموقع لا يطابق إعدادات الخادم. أعد فتح الموقع من رابطه المعتمد.",
  SCHEMA_UPDATE_REQUIRED:
    "يلزم تطبيق تحديث قاعدة البيانات الخاص بهذه النسخة. تواصل مع مسؤول النشر.",
  VERSION_CONFLICT:
    "يوجد إصدار أحدث لدى الخادم. احتُفظ بنسختك محلياً؛ راجع الإصدار الأحدث قبل الحفظ.",
  PUBLICATION_INCOMPLETE: "أكمل المحتوى والكاتب والقسم الأساسي قبل النشر.",
  INVALID_SCHEDULE: "اختر موعد نشر صحيحاً في المستقبل بتوقيت عدن.",
  NETWORK_ERROR: "تعذر الاتصال. احتفظ بالتعديلات وحاول عند عودة الاتصال.",
  INVALID_INPUT: "راجع الحقول المطلوبة وصحة البيانات.",
  SLUG_RESERVED: "الرابط الدائم مستخدم أو محجوز. اختر رابطاً آخر.",
  MEDIA_IN_USE: "الصورة مستخدمة في محتوى؛ حدّث ارتباطاتها قبل حذفها.",
  CATEGORY_IN_USE: "القسم يحتوي على مقالات. انقل المقالات قبل حذفه.",
  PIN_SETUP_REQUIRED: "يلزم إعداد حماية PIN من حسابك قبل هذه العملية.",
  PIN_VERIFICATION_REQUIRED: "يلزم إعادة التحقق من PIN للعملية الحساسة.",
};
export function adminErrorMessage(error: unknown) {
  return (
    messages[error instanceof Error ? error.message : ""] ||
    "تعذرت العملية. حاول مجدداً، وإذا استمرت المشكلة راجع حالة الخدمة."
  );
}
