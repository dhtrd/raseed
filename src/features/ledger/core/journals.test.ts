import { describe, expect, it } from "vitest";
import { filterJournals, journalAmount, journalCounts } from "./journals";
import { parseEntry } from "./ledger";

const j = (id: string, d: Record<string, unknown>) =>
  parseEntry(id, { supplierId: "s1", kind: "misc", date: "2026-10-01", debit: 0, credit: 0, ...d });
const rows = [j("a", { debit: 120000 }), j("b", { credit: 20000, reversed: true }), j("c", { debit: 5000 })];

describe("فهرس القيود", () => {
  it("الوسم: سداد واسترداد", () => {
    expect(filterJournals(rows, "pay").map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterJournals(rows, "refund").map((r) => r.id)).toEqual(["b"]);
    expect(filterJournals(rows, "all")).toHaveLength(3);
  });

  it("العدّادات والصافي = السداد − الاسترداد", () => {
    expect(journalCounts(rows)).toEqual({ count: 3, debit: 125000, credit: 20000, net: 105000 });
    expect(journalAmount(rows[1] ?? j("x", {}))).toBe(-20000);
  });
});
