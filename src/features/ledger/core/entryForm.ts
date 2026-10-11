/**
 * تحقق نموذج «إضافة حركة» قبل الحفظ (FIELDS.md + SPEC). القواعد في Firestore تفرض الشيء نفسه من الخادم؛
 * هنا رسائل عربية واضحة لكل حقل قبل الإرسال.
 */
import type { IsoDate } from "../../../shared/fields/core/date";
import { buildRefNo, validateRef } from "../../../shared/fields/core/ref";
import { LIMITS } from "../../../shared/fields/core/text";
import { validateVoucher } from "../../../shared/fields/core/voucher";

export type FormType = "inv" | "misc" | "note";

export interface EntryForm {
  supplierId: string | null;
  type: FormType;
  date: IsoDate | null;
  ref: string;
  voucher: string;
  details: string;
  note: string;
  amount: number | null;
  reversed: boolean;
  /** أماكن الرقم المرجعي إن كان مكرراً (null = لم يُفحص بعد) */
  dupOf: string[] | null;
  dupConfirmed: boolean;
  dupReason: string;
}

export type FormErrors = Partial<
  Record<"supplier" | "date" | "ref" | "voucher" | "details" | "note" | "amount" | "dup", string>
>;

export const DUP_REASON_MAX = 300;

export function emptyForm(supplierId: string | null, type: FormType = "inv"): EntryForm {
  return {
    supplierId,
    type,
    date: null,
    ref: "",
    voucher: "",
    details: "",
    note: "",
    amount: null,
    reversed: false,
    dupOf: null,
    dupConfirmed: false,
    dupReason: "",
  };
}

export function refNoOf(f: Pick<EntryForm, "type" | "ref" | "date">, today: IsoDate): string {
  if (f.type === "note" || !f.ref) return "";
  return buildRefNo(f.type, f.ref, f.date ?? today);
}

export function validateEntryForm(f: EntryForm, lockedThrough: IsoDate | null): FormErrors {
  const e: FormErrors = {};
  if (!f.supplierId) e.supplier = "اختر المورد من القائمة.";
  if (!f.date) e.date = "اكتب التاريخ، أو اضغط Enter في الحقل الفارغ لتاريخ اليوم.";
  else if (lockedThrough && f.date <= lockedThrough)
    e.date = `الفترة مقفلة حتى ${lockedThrough.split("-").reverse().join("/")}. اختر تاريخاً بعده.`;
  if (f.type === "note") {
    const t = f.note.trim();
    if (!t) e.note = "اكتب نص الملاحظة.";
    else if (t.length > LIMITS.note) e.note = `الملاحظة حتى ${LIMITS.note} حرف.`;
    return e;
  }
  const refErr = f.ref ? validateRef(f.ref, f.type) : "اكتب المرجع الرئيسي.";
  if (refErr) e.ref = refErr;
  const vErr = f.voucher ? validateVoucher(f.voucher) : null;
  if (vErr) e.voucher = vErr;
  if (f.details.trim().length > LIMITS.details) e.details = `التفاصيل حتى ${LIMITS.details} حرف.`;
  if (!f.amount || f.amount <= 0) e.amount = "اكتب المبلغ، ويجب أن يكون أكبر من صفر.";
  if (f.dupOf && f.dupOf.length) {
    if (!f.dupConfirmed) e.dup = "الرقم مكرر: حدّد «أؤكد أنها حركة مختلفة» واكتب السبب، أو عدّل المرجع.";
    else if (!f.dupReason.trim()) e.dup = "اكتب سبب تسجيل رقم مكرر؛ يُحفظ في سجل التدقيق.";
    else if (f.dupReason.trim().length > DUP_REASON_MAX) e.dup = `السبب حتى ${DUP_REASON_MAX} حرف.`;
  }
  return e;
}

/** هل في النموذج ما يضيع إن غادر المستخدم دون حفظ؟ (المورد والنوع والتاريخ لا تُعدّ) */
export function isDirty(f: EntryForm, suggestedRef: string | null): boolean {
  return Boolean(
    (f.ref && f.ref !== suggestedRef) || f.voucher || f.details.trim() || f.note.trim() || f.amount,
  );
}
