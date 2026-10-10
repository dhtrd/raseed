/**
 * تقدير قوة كلمة المرور دون كشف القواعد (FIELDS «اسم المستخدم / كلمة المرور»).
 * يُعرض المستوى فقط؛ الحد الأدنى المقبول «قوية».
 */
export type Strength = 0 | 1 | 2 | 3;
export const STRENGTH_LABEL = ["", "ضعيفة", "متوسطة", "قوية"] as const;

export function passwordStrength(pw: string, context: string[] = []): Strength {
  if (!pw) return 0;
  const lower = pw.toLowerCase();
  if (context.some((c) => c && c.length >= 3 && lower.includes(c.toLowerCase()))) return 1;
  if (/^(.)\1+$/.test(pw) || /^(0123|1234|abcd|qwer|pass|password)/i.test(pw)) return 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const unique = new Set(pw).size;
  if (pw.length >= 12 && classes >= 3 && unique >= 8) return 3;
  if (pw.length >= 10 && classes >= 2 && unique >= 6) return 2;
  return 1;
}

/** المعرّف: بريد أو اسم مستخدم يُحوَّل داخلياً إلى بريد ثابت (DECISIONS 2026-10-10). */
export const USERNAME_DOMAIN = "users.raseed.internal";

export function identifierToEmail(
  identifier: string,
): { ok: true; email: string } | { ok: false; error: string } {
  const v = identifier.trim().toLowerCase();
  if (!v) return { ok: false, error: "أدخل البريد أو اسم المستخدم." };
  if (v.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
      ? { ok: true, email: v }
      : { ok: false, error: "البريد غير صالح." };
  }
  if (!/^[a-z0-9._-]{3,32}$/.test(v))
    return { ok: false, error: "اسم المستخدم 3 إلى 32 حرفاً لاتينياً أو رقماً أو . _ -" };
  return { ok: true, email: `${v}@${USERNAME_DOMAIN}` };
}
