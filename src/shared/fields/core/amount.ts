import { normalizeDigits } from "./digits";

/** المبالغ تُحفظ بالهللات (عدد صحيح) لتجنب أخطاء الكسور العشرية. */
export const MAX_HALALAS = 9_999_999_999; // 99,999,999.99

export type AmountResult = { ok: true; halalas: number } | { ok: false; error: string } | { ok: "empty" };

export const AMOUNT_MESSAGES = {
  positiveOnly: "المبلغ موجب فقط. الاتجاه تحدده خانة مدين أو دائن.",
  digitsOnly: "المبلغ أرقام فقط.",
  twoDecimals: "منزلتان عشريتان كحد أقصى.",
  oneDecimal: "فاصلة عشرية واحدة فقط.",
  zero: "المبلغ يجب أن يكون أكبر من صفر.",
  max: "الحد الأقصى 99,999,999.99.",
  notAmount: "النص الملصوق ليس مبلغاً.",
  pastedDecimals: "المبلغ الملصوق فيه أكثر من منزلتين عشريتين. صحّحه ثم الصقه.",
} as const;

/** نوع الحرف المكتوب في حقل المبلغ بعد تحويل الأرقام. */
export function classifyTypedChar(ch: string): "digit" | "decimal" | "sign" | "other" {
  const c = normalizeDigits(ch);
  if (/^\d$/.test(c)) return "digit";
  if (/^[.,،٫]$/.test(c)) return "decimal"; // كل الفواصل عند الكتابة عشرية (DECISIONS 2026-10-10)
  if (/^[-+−]$/.test(c)) return "sign";
  return "other";
}

export function groupThousands(intPart: string): string {
  const s = intPart.replace(/^0+(?=\d)/, "");
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * يعيد تنسيق قيمة الحقل أثناء الكتابة (فواصل آلاف حية) ويحسب موضع المؤشر الجديد.
 * القيمة المدخلة قد تحوي فواصل آلاف سابقة؛ النقطة هي الفاصلة العشرية الوحيدة.
 */
export function formatLive(raw: string, caret: number): { value: string; caret: number } {
  const significantBefore = raw.slice(0, caret).replace(/[^0-9.]/g, "").length;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const [intRaw = "", ...rest] = cleaned.split(".");
  const hasDot = cleaned.includes(".");
  const frac = rest.join("").slice(0, 2);
  let intPart = groupThousands(intRaw);
  if (intPart === "" && hasDot) intPart = "0";
  const value = intPart + (hasDot ? "." + frac : "");
  let pos = 0;
  let count = 0;
  while (pos < value.length && count < significantBefore) {
    if (/[0-9.]/.test(value.charAt(pos))) count++;
    pos++;
  }
  return { value, caret: pos };
}

/** يحوّل نصاً نظيفاً (أرقام ونقطة) إلى هللات، أو null إن لم يكن صالحاً. */
export function toHalalas(clean: string): number | null {
  if (!/^\d*\.?\d{0,2}$/.test(clean) || clean === "" || clean === ".") return null;
  const [i = "0", f = ""] = clean.split(".");
  return Number(i || "0") * 100 + Number((f + "00").slice(0, 2));
}

export function formatHalalas(h: number): string {
  const i = Math.floor(h / 100);
  const f = h % 100;
  return groupThousands(String(i)) + "." + String(f).padStart(2, "0");
}

/** التحقق عند الخروج من الحقل. */
export function parseAmount(display: string): AmountResult {
  const clean = display.replace(/,/g, "").trim();
  if (clean === "") return { ok: "empty" };
  if (/[-−(]/.test(clean)) return { ok: false, error: AMOUNT_MESSAGES.positiveOnly };
  const h = toHalalas(clean);
  if (h === null) return { ok: false, error: AMOUNT_MESSAGES.digitsOnly };
  if (h === 0) return { ok: false, error: AMOUNT_MESSAGES.zero };
  if (h > MAX_HALALAS) return { ok: false, error: AMOUNT_MESSAGES.max };
  return { ok: true, halalas: h };
}

/**
 * ينظّف المبلغ الملصوق: يحذف ر.س وSAR وريال ورمز الريال والمسافات.
 * الفاصلة «,» فاصل آلاف إن جاءت معها نقطة، أو إن كانت مجموعات من 3 أرقام (3,100). وإلا فهي عشرية.
 */
export function cleanPastedAmount(text: string): { ok: true; value: string } | { ok: false; error: string } {
  let s = normalizeDigits(text)
    .replace(/ر\.?\s?س\.?|SAR|ريال|⃁/gi, "")
    .replace(/[\s  ]/g, "");
  if (/[-−(]/.test(s)) return { ok: false, error: AMOUNT_MESSAGES.positiveOnly };
  if (s.includes(".") || s.includes("٫")) s = s.replace(/[,،٬]/g, "").replace("٫", ".");
  else if (/^\d{1,3}([,٬]\d{3})+$/.test(s)) s = s.replace(/[,٬]/g, "");
  else s = s.replace(/[،,]/g, ".").replace(/٬/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return { ok: false, error: AMOUNT_MESSAGES.notAmount };
  if ((s.split(".")[1] ?? "").length > 2) return { ok: false, error: AMOUNT_MESSAGES.pastedDecimals };
  return { ok: true, value: s };
}
