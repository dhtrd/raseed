/**
 * مركز المراجعة (النموذج المعتمد rased-mockups/direction-1/review.html + قسم «أخرى»، DECISIONS 2026-10-11):
 * تصنيف سجلات `migrationIssues` المفتوحة في أربعة أقسام. منطق نقي بلا واجهة ولا Firestore.
 */
import type { IsoDate } from "../../../shared/fields/core/date";
import type { LedgerEntry } from "./ledger";

export type ReviewSection = "dates" | "dups" | "untyped" | "other";
export const SECTION_ORDER: ReviewSection[] = ["dates", "dups", "untyped", "other"];

export const SECTION_TITLE: Record<ReviewSection, string> = {
  dates: "تواريخ معطوبة",
  dups: "أرقام مكررة",
  untyped: "سجلات بلا نوع",
  other: "أخرى",
};

const SECTION_OF: Record<string, ReviewSection> = {
  known_swapped_day_month: "dates",
  future_date: "dates",
  duplicate_ref: "dups",
  known_duplicate_of_row_291: "dups",
  known_same_voucher_two_refs: "dups",
  known_same_voucher_two_suppliers: "dups",
  untyped: "untyped",
};

export interface IssueItem {
  code: string;
  text: string;
}

export interface ReviewIssue {
  id: string;
  entryId: string;
  supplierId: string;
  supplierName: string;
  sheet: string;
  row: number;
  issues: IssueItem[];
}

export interface ReviewRow {
  issue: ReviewIssue;
  entry: LedgerEntry | null;
  /** أسباب هذا القسم فقط */
  reasons: IssueItem[];
  /** التاريخ المرجّح للتواريخ المقلوبة المعروفة */
  suggestedDate: IsoDate | null;
}

export function sectionOf(code: string): ReviewSection {
  return SECTION_OF[code] ?? "other";
}

/** نص السبب المعروف: «تاريخ مقلوب على الأرجح: 2026-03-08 والأرجح 2026-08-03» */
export function suggestedDateOf(issues: IssueItem[]): IsoDate | null {
  const it = issues.find((i) => i.code === "known_swapped_day_month");
  const m = it?.text.match(/والأرجح\s+(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

/** كل سجل يظهر في كل قسم له فيه سبب، مرتباً بالمورد ثم الصف. */
export function buildReview(
  issues: ReviewIssue[],
  entries: Map<string, LedgerEntry>,
): Record<ReviewSection, ReviewRow[]> {
  const out: Record<ReviewSection, ReviewRow[]> = { dates: [], dups: [], untyped: [], other: [] };
  const sorted = [...issues].sort(
    (a, b) => a.supplierId.localeCompare(b.supplierId) || a.row - b.row || a.id.localeCompare(b.id),
  );
  for (const issue of sorted) {
    const by = new Map<ReviewSection, IssueItem[]>();
    for (const it of issue.issues) {
      const s = sectionOf(it.code);
      by.set(s, [...(by.get(s) ?? []), it]);
    }
    if (!by.size) by.set("other", [{ code: "unknown", text: "سبب غير محدد" }]);
    for (const [s, reasons] of by)
      out[s].push({
        issue,
        entry: entries.get(issue.entryId) ?? null,
        reasons,
        suggestedDate: s === "dates" ? suggestedDateOf(reasons) : null,
      });
  }
  return out;
}

export function reviewCountsOf(sections: Record<ReviewSection, ReviewRow[]>) {
  const ids = new Set<string>();
  for (const s of SECTION_ORDER) for (const r of sections[s]) ids.add(r.issue.id);
  return {
    total: ids.size,
    dates: sections.dates.length,
    dups: sections.dups.length,
    untyped: sections.untyped.length,
    other: sections.other.length,
  };
}

export const IGNORE_NOTE_MAX = 300;
