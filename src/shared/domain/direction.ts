import type { EntryKind } from "../fields/core/ref";

/**
 * الفاتورة دائن والقيد مدين، والعكس فقط بقرار صريح (DECISIONS 2026-10-10):
 * فاتورة معكوسة = مرتجع، قيد معكوس = استرداد.
 */
export type Side = "debit" | "credit";

export function sideFor(kind: EntryKind, reversed: boolean): Side {
  const natural: Side = kind === "inv" ? "credit" : "debit";
  if (!reversed) return natural;
  return natural === "credit" ? "debit" : "credit";
}

export function reversalTag(kind: EntryKind, reversed: boolean): "مرتجع" | "استرداد" | null {
  if (!reversed) return null;
  return kind === "inv" ? "مرتجع" : "استرداد";
}
