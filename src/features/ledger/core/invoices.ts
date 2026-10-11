/**
 * فهرس الفواتير وحالة Odoo (SPEC «تتبع Odoo» + direction-1/invoices.html).
 * شرط القبول ج: «دخلت» + «لم تدخل» = إجمالي الفواتير تماماً في كل فلتر، لذا تُحسب العدّادات من المجموعة نفسها.
 */
import type { IsoDate } from "../../../shared/fields/core/date";
import type { LedgerEntry } from "./ledger";

export const LOCK_REASON_MAX = 300;

/**
 * سبب استثناء الفترة المقفلة (المالك، الخيار أ المعتمد في proposals/2026-10-11-odoo-lock-exception.html):
 * إلزامي حتى 300 حرف، والقواعد تفرض الشيء نفسه (odoo.lockReason).
 */
export function validateLockReason(text: string): string | null {
  const t = text.trim();
  if (!t) return "اكتب سبب الاستثناء: لا تتغير حالة فاتورة مقفلة بلا سبب.";
  if (t.length > LOCK_REASON_MAX) return `السبب أطول من ${LOCK_REASON_MAX} حرف.`;
  return null;
}

export type OdooFilter = "all" | "in" | "out";

export interface InvoiceRow extends LedgerEntry {
  supplierName: string;
}

/** مبلغ الفاتورة: الدائن، والمرتجع (فاتورة في المدين) بإشارة سالبة. */
export function invoiceAmount(e: Pick<LedgerEntry, "debit" | "credit">): number {
  return e.credit - e.debit;
}

export const isEntered = (e: Pick<LedgerEntry, "odooEntered">) => e.odooEntered === true;

export function filterByOdoo<T extends Pick<LedgerEntry, "odooEntered">>(rows: T[], f: OdooFilter): T[] {
  if (f === "all") return rows;
  return rows.filter((r) => (f === "in" ? isEntered(r) : !isEntered(r)));
}

export interface InvoiceCounts {
  total: number;
  entered: number;
  notEntered: number;
  /** مجموع مبالغ «لم تدخل» (المرتجع يُطرح) */
  notEnteredAmount: number;
}

export function invoiceCounts(rows: Pick<LedgerEntry, "odooEntered" | "debit" | "credit">[]): InvoiceCounts {
  let entered = 0;
  let amount = 0;
  for (const r of rows) {
    if (isEntered(r)) entered++;
    else amount += invoiceAmount(r);
  }
  return { total: rows.length, entered, notEntered: rows.length - entered, notEnteredAmount: amount };
}

/**
 * يفصل المحدد إلى ما يمكن تغييره وما لا يلزم أو لا يُسمح به:
 * المقفل (تاريخه ≤ تاريخ الإقفال، قواعد Firestore ترفضه)، وما حالته المطلوبة قائمة أصلاً.
 */
export function planOdooChange<T extends Pick<LedgerEntry, "id" | "date" | "odooEntered">>(
  selected: T[],
  toEntered: boolean,
  lockedThrough: IsoDate | null,
): { change: T[]; locked: T[]; unchanged: T[] } {
  const change: T[] = [];
  const locked: T[] = [];
  const unchanged: T[] = [];
  for (const r of selected) {
    if (isEntered(r) === toEntered) unchanged.push(r);
    else if (lockedThrough && r.date <= lockedThrough) locked.push(r);
    else change.push(r);
  }
  return { change, locked, unchanged };
}
