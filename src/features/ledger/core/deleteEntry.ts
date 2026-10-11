/**
 * الحذف الناعم والاسترجاع (الخيار أ المعتمد في proposals/2026-10-11-soft-delete.html، DECISIONS 2026-10-11):
 * التحقق، وأثر الحذف على الرصيد، ودمج المحذوفات في عرض الكشف. منطق نقي بلا واجهة ولا Firestore.
 * القواعد تفرض الشيء نفسه من الخادم (firestore.rules: deletionOk).
 */
import type { IsoDate } from "../../../shared/fields/core/date";
import type { LedgerEntry, StatementRow } from "./ledger";

export const DELETE_REASON_MAX = 300;
/** أسباب جاهزة للحذف يختار منها المالك أو يكتب غيرها */
export const DELETE_REASONS = ["أُدخلت مرتين", "أُدخلت لمورد خطأ", "حركة ملغاة"];

export type DeleteMode = "delete" | "restore";

export interface Deletion {
  by: string;
  /** وقت الحذف بالمللي ثانية، أو null إن لم يصل من الخادم بعد */
  at: number | null;
  reason: string;
}

export interface DeletedEntry extends LedgerEntry {
  deletion: Deletion | null;
}

export interface DeleteForm {
  reason: string;
  /** أماكن الرقم المرجعي عند الاسترجاع إن استُعمل بعد الحذف (دون الحركة نفسها) */
  dupOf: string[];
  dupConfirmed: boolean;
  dupReason: string;
}

export type DeleteErrors = Partial<Record<"reason" | "dup" | "form", string>>;

export function validateDeletion(
  mode: DeleteMode,
  entry: Pick<LedgerEntry, "date">,
  f: DeleteForm,
  lockedThrough: IsoDate | null,
): DeleteErrors {
  const e: DeleteErrors = {};
  const verb = mode === "delete" ? "الحذف" : "الاسترجاع";
  if (lockedThrough && entry.date <= lockedThrough)
    e.form = `الحركة داخل الفترة المقفلة؛ لا ${verb} قبل فتح القفل مؤقتاً.`;
  const reason = f.reason.trim();
  if (!reason) e.reason = `اكتب سبب ${verb}: يُحفظ في سجل التدقيق.`;
  else if (reason.length > DELETE_REASON_MAX) e.reason = `السبب أطول من ${DELETE_REASON_MAX} حرف.`;
  if (mode === "restore" && f.dupOf.length) {
    if (!f.dupConfirmed) e.dup = "الرقم مستعمل لحركة أخرى: أكّد أنهما مختلفتان أو ألغِ الاسترجاع.";
    else if (!f.dupReason.trim()) e.dup = "اكتب سبب تسجيل رقم مكرر.";
    else if (f.dupReason.trim().length > DELETE_REASON_MAX) e.dup = `السبب أطول من ${DELETE_REASON_MAX} حرف.`;
  }
  return e;
}

/** تغيّر رصيد المورد بالهللات إن نُفّذ الإجراء (الرصيد = مدين − دائن). */
export function balanceEffect(mode: DeleteMode, e: Pick<LedgerEntry, "debit" | "credit">): number {
  const own = e.debit - e.credit;
  return mode === "delete" ? -own : own;
}

export interface DisplayRow extends StatementRow {
  /** محذوفة ناعماً (تُعرض مشطوبة بلا رصيد) */
  deleted: boolean;
  /** من حذفها ومتى ولماذا؛ قد تغيب عن المحذوفات القديمة */
  deletion: Deletion | null;
}

/**
 * يدمج المحذوفات في صفوف الكشف بترتيبها الزمني (التاريخ ثم المعرّف، كاستعلام الكشف).
 * المحذوفة لا تغيّر الرصيد الجاري: تأخذ رصيد ما قبلها للترتيب فقط، وتُعرض بلا رصيد.
 */
export function withDeleted(opening: number, rows: StatementRow[], deleted: DeletedEntry[]): DisplayRow[] {
  const all: DisplayRow[] = [
    ...rows.map((r) => ({ ...r, deleted: false, deletion: null })),
    ...deleted.map((d) => ({ ...d, balance: 0, deleted: true })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let last = opening;
  return all.map((r) => {
    if (!r.deleted) {
      last = r.balance;
      return r;
    }
    return { ...r, balance: last };
  });
}
