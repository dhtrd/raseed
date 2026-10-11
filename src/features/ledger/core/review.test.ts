import { describe, expect, it } from "vitest";
import { parseEntry } from "./ledger";
import { buildReview, reviewCountsOf, sectionOf, suggestedDateOf, type ReviewIssue } from "./review";

const issue = (id: string, sup: string, row: number, codes: [string, string][]): ReviewIssue => ({
  id,
  entryId: id,
  supplierId: sup,
  supplierName: `المورد ${sup}`,
  sheet: "ورقة",
  row,
  issues: codes.map(([code, text]) => ({ code, text })),
});

describe("مركز المراجعة", () => {
  it("كل سبب في قسمه، وغير المعروف في «أخرى»", () => {
    expect(sectionOf("known_swapped_day_month")).toBe("dates");
    expect(sectionOf("future_date")).toBe("dates");
    expect(sectionOf("duplicate_ref")).toBe("dups");
    expect(sectionOf("known_same_voucher_two_suppliers")).toBe("dups");
    expect(sectionOf("untyped")).toBe("untyped");
    expect(sectionOf("ref_length")).toBe("other");
    expect(sectionOf("odoo_on_journal")).toBe("other");
  });

  it("التاريخ المرجّح من نص الحالة المعروفة فقط", () => {
    expect(
      suggestedDateOf([
        { code: "known_swapped_day_month", text: "تاريخ مقلوب على الأرجح: 2026-03-08 والأرجح 2026-08-03" },
      ]),
    ).toBe("2026-08-03");
    expect(suggestedDateOf([{ code: "future_date", text: "تاريخ مستقبلي 2027-01-01" }])).toBeNull();
  });

  it("السجل بسببين يظهر في القسمين، والعدّ الكلي لا يكرره", () => {
    const s = buildReview(
      [
        issue("b", "s02", 9, [["untyped", "بلا نوع"]]),
        issue("a", "s01", 5, [
          ["duplicate_ref", "مكرر"],
          ["ref_length", "طول"],
        ]),
        issue("c", "s01", 2, []),
      ],
      new Map([
        [
          "a",
          parseEntry("a", { kind: "inv", date: "2026-08-01", refNo: "P1229", mainRef: "1229", credit: 100 }),
        ],
      ]),
    );
    expect(s.dups.map((r) => r.issue.id)).toEqual(["a"]);
    expect(s.dups[0]?.entry?.refNo).toBe("P1229");
    expect(s.other.map((r) => r.issue.id)).toEqual(["c", "a"]);
    expect(s.untyped[0]?.entry).toBeNull();
    expect(reviewCountsOf(s)).toEqual({ total: 3, dates: 0, dups: 1, untyped: 1, other: 2 });
  });
});
