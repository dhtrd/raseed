/**
 * حساب الأرصدة والكشف (SPEC: الرصيد = السابق + مدين − دائن، والسالب مستحق للمورد). يُحسب ولا يُخزَّن.
 * المبالغ بالهللات (أعداد صحيحة) كي لا تتراكم أخطاء الكسور.
 */
import { periodFor, type Period } from "../../../shared/fields/components/PeriodFilter";
import { splitIso, type IsoDate } from "../../../shared/fields/core/date";

export type EntryKind = "inv" | "misc" | "note" | "untyped";

export interface LedgerEntry {
  id: string;
  supplierId: string;
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
  needsManualFix: boolean;
  odooEntered: boolean | null;
}

const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «1,234.50» بأرقام لاتينية، والسالب بإشارة «-». */
export function formatMoney(halalas: number): string {
  return fmt.format(halalas / 100);
}

export function balanceState(h: number): { label: string; tone: "neg" | "pos" | "zero" } {
  if (h < 0) return { label: "مستحق للمورد", tone: "neg" };
  if (h > 0) return { label: "رصيد مدين", tone: "pos" };
  return { label: "متوازن", tone: "zero" };
}

/** الرصيد بعد كل حركة، والحركات مرتبة من الأقدم. */
export function withRunningBalance<T extends { debit: number; credit: number }>(
  opening: number,
  ascending: T[],
): (T & { balance: number })[] {
  let b = opening;
  return ascending.map((e) => {
    b += e.debit - e.credit;
    return { ...e, balance: b };
  });
}

export interface SupplierBalance {
  id: string;
  name: string;
  archived: boolean;
  prev: number;
  debit: number;
  credit: number;
  final: number;
}

export function sumBalances(list: SupplierBalance[]): Omit<SupplierBalance, "id" | "name" | "archived"> {
  return list.reduce(
    (a, s) => ({
      prev: a.prev + s.prev,
      debit: a.debit + s.debit,
      credit: a.credit + s.credit,
      final: a.final + s.final,
    }),
    { prev: 0, debit: 0, credit: 0, final: 0 },
  );
}

/** الفترة الافتراضية للوحة الأرصدة: الربع الحالي (كورقة «الرئيسية» في الإكسل). */
export function currentQuarter(today: IsoDate): Period {
  const { y, m } = splitIso(today);
  return periodFor("quarter", y, Math.floor((m - 1) / 3) + 1);
}

/** وسم الحركة كما يظهر في الكشف (المرتجع/الاسترداد وسم تلقائي من الاتجاه). */
export function kindLabel(e: Pick<LedgerEntry, "kind" | "reversed">): { label: string; tag: string | null } {
  if (e.kind === "inv") return { label: "فاتورة", tag: e.reversed ? "مرتجع" : null };
  if (e.kind === "misc") return { label: "قيد", tag: e.reversed ? "استرداد" : null };
  if (e.kind === "note") return { label: "ملاحظة", tag: null };
  return { label: "بلا نوع", tag: null };
}

/** يقرأ مستند الحركة بأمان؛ الحقول المفقودة قيم فارغة لا افتراضات صامتة. */
export function parseEntry(id: string, d: Record<string, unknown>): LedgerEntry {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : 0);
  const kind = (["inv", "misc", "note", "untyped"] as const).find((k) => k === d.kind) ?? "untyped";
  const odoo = d.odoo as { entered?: unknown } | undefined;
  return {
    id,
    supplierId: str(d.supplierId),
    kind,
    date: str(d.date),
    mainRef: str(d.mainRef),
    refNo: str(d.refNo),
    voucher: str(d.voucher),
    details: str(d.details),
    note: str(d.note),
    debit: int(d.debit),
    credit: int(d.credit),
    reversed: d.reversed === true,
    needsManualFix: d.needsManualFix === true,
    odooEntered: kind === "inv" ? odoo?.entered === true : null,
  };
}

export interface StatementRow extends LedgerEntry {
  balance: number;
}

export interface Statement {
  opening: number;
  rows: StatementRow[];
  debit: number;
  credit: number;
  closing: number;
  /** الحركات المالية فقط (الملاحظات لا تُعدّ ولا تؤثر على الرصيد) */
  financialCount: number;
  noteCount: number;
  reviewCount: number;
  lastDate: IsoDate | null;
}

/** الكشف: الرصيد الجاري من الأقدم إلى الأحدث بدءاً من الافتتاحي، ثم يُعرض بأي ترتيب. */
export function buildStatement(opening: number, ascending: LedgerEntry[]): Statement {
  const rows = withRunningBalance(opening, ascending);
  let debit = 0;
  let credit = 0;
  let notes = 0;
  let review = 0;
  for (const r of rows) {
    debit += r.debit;
    credit += r.credit;
    if (r.kind === "note") notes++;
    if (r.needsManualFix) review++;
  }
  return {
    opening,
    rows,
    debit,
    credit,
    closing: opening + debit - credit,
    financialCount: rows.length - notes,
    noteCount: notes,
    reviewCount: review,
    lastDate: rows.length ? (rows[rows.length - 1]?.date ?? null) : null,
  };
}
