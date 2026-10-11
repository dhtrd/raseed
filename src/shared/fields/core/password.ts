/**
 * تقدير قوة كلمة المرور دون كشف القواعد (FIELDS «اسم المستخدم / كلمة المرور»).
 * يُعرض المستوى فقط؛ الحد الأدنى المقبول «قوية».
 * «قوية» تطابق سياسة Firebase المفروضة: 12 حرفاً والأنواع الأربعة (DECISIONS 2026-10-10)،
 * كي لا يقبل المؤشر كلمةً يرفضها الخادم.
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
  if (pw.length >= 12 && classes === 4 && unique >= 8) return 3;
  if (pw.length >= 10 && classes >= 3 && unique >= 6) return 2;
  return 1;
}

/** الحد الأدنى المقبول لأي كلمة مرور تُنشأ أو تُغيَّر. */
export function isStrongPassword(pw: string, context: string[] = []): boolean {
  return passwordStrength(pw, context) === 3;
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

/** حروف بلا ملتبسات (0/O، 1/l/I) كي تُملى الكلمة المؤقتة وتُكتب دون خطأ. */
const PASSWORD_SETS = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%*-_+?"];

/**
 * كلمة مرور مؤقتة قوية بالأنواع الأربعة. `randomInt(n)` يعيد عدداً منتظماً في [0, n)
 * من مولّد تشفيري (المتصفح أو Node)، كي تبقى الدالة نقية وقابلة للاختبار.
 */
export function generatePassword(randomInt: (n: number) => number, length = 16): string {
  const all = PASSWORD_SETS.join("");
  const out = PASSWORD_SETS.map((s) => s[randomInt(s.length)] as string);
  while (out.length < length) out.push(all[randomInt(all.length)] as string);
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j] as string, out[i] as string];
  }
  return out.join("");
}

/** مولّد المتصفح بلا انحياز (رفض القيم خارج أكبر مضاعف لـ n). */
export function browserRandomInt(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] as number;
    if (v < limit) return v % n;
  }
}
