/**
 * فهرس القيود (الخيار أ المعتمد في proposals/2026-10-11-journals.html، DECISIONS 2026-10-11):
 * فلترة الوسم والعدّادات. القيد مدين (سداد) افتراضياً، والدائن استرداد. منطق نقي بلا واجهة.
 */
import type { LedgerEntry } from "./ledger";

export type JournalTag = "all" | "pay" | "refund";

export interface JournalRow extends LedgerEntry {
  supplierName: string;
}

export const isRefund = (e: Pick<LedgerEntry, "credit">) => e.credit > 0;

export function filterJournals<T extends Pick<LedgerEntry, "credit">>(rows: T[], tag: JournalTag): T[] {
  if (tag === "all") return rows;
  return rows.filter((r) => (tag === "refund" ? isRefund(r) : !isRefund(r)));
}

/** مبلغ القيد بإشارته في الصافي: السداد موجب والاسترداد سالب. */
export const journalAmount = (e: Pick<LedgerEntry, "debit" | "credit">) => e.debit - e.credit;

export interface JournalCounts {
  count: number;
  /** مجموع السداد (المدين) */
  debit: number;
  /** مجموع الاسترداد (الدائن) */
  credit: number;
  net: number;
}

export function journalCounts(rows: Pick<LedgerEntry, "debit" | "credit">[]): JournalCounts {
  let debit = 0;
  let credit = 0;
  for (const r of rows) {
    debit += r.debit;
    credit += r.credit;
  }
  return { count: rows.length, debit, credit, net: debit - credit };
}
