/**
 * رسائل أخطاء الدخول بالعربية. خطأ البيانات رسالة عامة واحدة كي لا تكشف وجود الحساب.
 * أي رمز غير معروف يظهر برمزه ولا يُبتلع (لا فشل صامت).
 */
const GENERIC_BAD = "البريد أو كلمة المرور غير صحيحة.";
const LINK_DEAD = "انتهى هذا الرابط أو استُعمل. الرابط صالح ساعة ولمرة واحدة، وأحدث رابط فقط يعمل.";

/** رابط تعيين كلمة المرور منتهٍ أو مستعمل أو مقطوع */
export function isDeadLink(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "auth/expired-action-code" || code === "auth/invalid-action-code";
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": GENERIC_BAD,
  "auth/invalid-login-credentials": GENERIC_BAD,
  "auth/wrong-password": GENERIC_BAD,
  "auth/user-not-found": GENERIC_BAD,
  "auth/invalid-email": GENERIC_BAD,
  "auth/too-many-requests":
    "محاولات كثيرة. أوقفت Firebase المحاولات مؤقتاً لحماية الحساب. انتظر بضع دقائق ثم أعد المحاولة.",
  "auth/user-disabled": "حسابك موقوف. راجع الإدارة لإعادة تفعيله.",
  "auth/network-request-failed": "تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.",
  "auth/password-does-not-meet-requirements":
    "كلمة المرور لا تطابق السياسة: 12 حرفاً على الأقل تجمع حروفاً لاتينية كبيرة وصغيرة وأرقاماً ورموزاً.",
  "auth/weak-password":
    "كلمة المرور لا تطابق السياسة: 12 حرفاً على الأقل تجمع حروفاً لاتينية كبيرة وصغيرة وأرقاماً ورموزاً.",
  "auth/requires-recent-login": "لأمان حسابك، اخرج وادخل مرة أخرى ثم غيّر كلمة المرور.",
  "auth/email-already-in-use": "هذا الدخول مستخدم لحساب آخر.",
  "auth/expired-action-code": LINK_DEAD,
  "auth/invalid-action-code": LINK_DEAD,
};

export function authErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : "";
  return (
    MESSAGES[code] ??
    `حدث خطأ غير متوقع${code ? ` (الرمز: ${code})` : ""}. أعد المحاولة، وإن تكرر فأبلغ الإدارة.`
  );
}
