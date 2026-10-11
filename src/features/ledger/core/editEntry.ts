/**
 * نافذة تعديل الحركة (الخيار أ المعتمد في proposals/2026-10-11-edit-entry.html، DECISIONS 2026-10-11):
 * النموذج من الحركة، والتحقق، والتغييرات قبل/بعد، وما يُكتب. منطق نقي بلا واجهة ولا Firestore.
 * القواعد تفرض الشيء نفسه من الخادم (firestore.rules: entryUpdateShapeOk).
 */
import { formatDate, type IsoDate } from "../../../shared/fields/core/date";
import { buildRefNo, normalizeRef, validateRef } from "../../../shared/fields/core/ref";
import { LIMITS } from "../../../shared/fields/core/text";
import { validateVoucher } from "../../../shared/fields/core/voucher";
import { formatMoney, type EntryKind, type LedgerEntry } from "./ledger";

export const EDIT_REASON_MAX = 300;

export interface EditForm {
  kind: EntryKind;
  date: IsoDate | null;
  ref: string;
  voucher: string;
  details: string;
  note: string;
  /** هللات */
  amount: number | null;
  reversed: boolean;
  /** سبب التعديل: إلزامي ويُحفظ في التدقيق */
  reason: string;
  /** أماكن الرقم المرجعي الجديد إن كان مكرراً (دون الحركة نفسها)؛ null = لم يُفحص */
  dupOf: string[] | null;
  dupConfirmed: boolean;
  dupReason: string;
}

export type EditErrors = Partial<
  Record<
    "kind" | "date" | "ref" | "voucher" | "details" | "note" | "amount" | "reason" | "dup" | "form",
    string
  >
>;

export function formFromEntry(e: LedgerEntry): EditForm {
  return {
    kind: e.kind,
    date: e.date || null,
    ref: e.mainRef,
    voucher: e.voucher,
    details: e.details,
    note: e.note,
    amount: e.credit || e.debit || null,
    reversed: e.reversed,
    reason: "",
    dupOf: null,
    dupConfirmed: false,
    dupReason: "",
  };
}

const financial = (k: EntryKind): k is "inv" | "misc" => k === "inv" || k === "misc";

/**
 * الرقم المرجعي بعد التعديل: يُعاد حسابه إن تغيّر النوع أو المرجع أو شهر القيد، وإلا يبقى كما هو
 * (حركات منقولة برقم لا يطابق الحساب تبقى قابلة للتعديل في غيره، كما تسمح القواعد).
 */
export function editedRefNo(orig: LedgerEntry, f: EditForm): string {
  if (!financial(f.kind) || !f.date) return orig.refNo;
  const ref = normalizeRef(f.ref);
  const monthChanged = f.kind === "misc" && orig.date.slice(0, 7) !== f.date.slice(0, 7);
  if (f.kind === orig.kind && ref === orig.mainRef && !monthChanged) return orig.refNo;
  return ref ? buildRefNo(f.kind, ref, f.date) : orig.refNo;
}

export interface EntryPatch {
  kind: EntryKind;
  date: IsoDate;
  mainRef: string;
  refNo: string;
  voucher: string;
  details: string;
  note: string;
  debit: number;
  credit: number;
  reversed: boolean;
}

/** القيم التي تُكتب في الحركة (الاتجاه من النوع والعكس: الفاتورة دائن والقيد مدين). */
export function patchOf(orig: LedgerEntry, f: EditForm): EntryPatch {
  const kind = f.kind;
  const amount = f.amount ?? 0;
  const credit = financial(kind) ? (kind === "inv") !== f.reversed : false;
  return {
    kind,
    date: f.date ?? orig.date,
    mainRef: financial(kind) ? normalizeRef(f.ref) : orig.mainRef,
    refNo: editedRefNo(orig, f),
    voucher: f.voucher.trim(),
    details: f.details.trim(),
    note: kind === "note" ? f.note.trim() : orig.note,
    debit: financial(kind) ? (credit ? 0 : amount) : orig.debit,
    credit: financial(kind) ? (credit ? amount : 0) : orig.credit,
    reversed: financial(kind) ? f.reversed : orig.reversed,
  };
}

const KIND_AR: Record<EntryKind, string> = { inv: "فاتورة", misc: "قيد", note: "ملاحظة", untyped: "بلا نوع" };

export interface Change {
  field: keyof EntryPatch;
  label: string;
  from: string;
  to: string;
}

/** التغييرات قبل/بعد للعرض وللتدقيق. */
export function changesOf(orig: LedgerEntry, f: EditForm): Change[] {
  const p = patchOf(orig, f);
  const show: Record<keyof EntryPatch, [string, (e: EntryPatch | LedgerEntry) => string]> = {
    kind: ["النوع", (e) => KIND_AR[e.kind]],
    date: ["التاريخ", (e) => (e.date ? formatDate(e.date) : "—")],
    mainRef: ["المرجع", (e) => e.mainRef || "—"],
    refNo: ["الرقم المرجعي", (e) => e.refNo || "—"],
    voucher: ["السند", (e) => e.voucher || "—"],
    details: ["التفاصيل", (e) => e.details || "—"],
    note: ["نص الملاحظة", (e) => e.note || "—"],
    debit: ["مدين", (e) => (e.debit ? formatMoney(e.debit) : "—")],
    credit: ["دائن", (e) => (e.credit ? formatMoney(e.credit) : "—")],
    reversed: ["عكس الاتجاه", (e) => (e.reversed ? "نعم" : "لا")],
  };
  return (Object.keys(show) as (keyof EntryPatch)[])
    .filter((k) => String(p[k]) !== String(orig[k]))
    .map((k) => {
      const [label, fmt] = show[k];
      return { field: k, label, from: fmt(orig), to: fmt(p) };
    });
}

export function validateEdit(orig: LedgerEntry, f: EditForm, lockedThrough: IsoDate | null): EditErrors {
  const e: EditErrors = {};
  const locked = (d: string) => Boolean(lockedThrough && d <= lockedThrough);
  if (locked(orig.date)) {
    e.form = `الحركة في فترة مقفلة حتى ${formatDate(lockedThrough ?? "")}؛ لا تُعدَّل.`;
    return e;
  }
  if (f.kind === "untyped") e.kind = "حدّد النوع: فاتورة أو قيد.";
  if (!f.date) e.date = "اكتب التاريخ.";
  else if (locked(f.date)) e.date = `الفترة مقفلة حتى ${formatDate(lockedThrough ?? "")}. اختر تاريخاً بعده.`;
  if (f.kind === "note") {
    const t = f.note.trim();
    if (!t) e.note = "اكتب نص الملاحظة.";
    else if (t.length > LIMITS.note) e.note = `الملاحظة حتى ${LIMITS.note} حرف.`;
  } else if (financial(f.kind)) {
    const ref = normalizeRef(f.ref);
    // المرجع المنقول المخالف يبقى ما دام هو والنوع لم يتغيرا (كما تسمح القواعد)
    const untouched = ref === orig.mainRef && f.kind === orig.kind;
    const refErr = !ref ? "اكتب المرجع الرئيسي." : untouched ? null : validateRef(ref, f.kind);
    if (refErr) e.ref = refErr;
    const vErr = f.voucher ? validateVoucher(f.voucher) : null;
    if (vErr) e.voucher = vErr;
    if (f.details.trim().length > LIMITS.details) e.details = `التفاصيل حتى ${LIMITS.details} حرف.`;
    if (!f.amount || f.amount <= 0) e.amount = "اكتب المبلغ، ويجب أن يكون أكبر من صفر.";
    if (f.dupOf && f.dupOf.length) {
      if (!f.dupConfirmed) e.dup = "الرقم مكرر: أكّد أنها حركة مختلفة واكتب السبب، أو عدّل المرجع.";
      else if (!f.dupReason.trim()) e.dup = "اكتب سبب تسجيل رقم مكرر.";
      else if (f.dupReason.trim().length > EDIT_REASON_MAX) e.dup = `السبب حتى ${EDIT_REASON_MAX} حرف.`;
    }
  }
  const r = f.reason.trim();
  if (!r) e.reason = "اكتب سبب التعديل؛ يُحفظ في سجل التدقيق.";
  else if (r.length > EDIT_REASON_MAX) e.reason = `السبب حتى ${EDIT_REASON_MAX} حرف.`;
  if (!Object.keys(e).length && !changesOf(orig, f).length) e.form = "لا تغيير لحفظه.";
  return e;
}
