import { describe, expect, it } from "vitest";
import { buildStatementExport, safeFileName } from "./exportModel";
import { buildStatement, parseEntry } from "./ledger";

const e = (id: string, d: Record<string, unknown>) =>
  parseEntry(id, { supplierId: "s1", date: "2026-07-01", debit: 0, credit: 0, ...d });

const statement = buildStatement(-1000, [
  e("a", { kind: "inv", credit: 5000, refNo: "P10001", details: "فاتورة مشتريات", voucher: "305" }),
  e("b", { kind: "note", note: "اتصال", date: "2026-07-02" }),
  e("c", {
    kind: "inv",
    debit: 300,
    reversed: true,
    refNo: "P10003",
    date: "2026-07-03",
    needsManualFix: true,
  }),
]);

describe("نموذج تصدير الكشف", () => {
  const x = buildStatementExport({
    supplierName: "المورد (أ)",
    statement,
    range: { from: "2026-07-01", to: "2026-09-30" },
    today: "2026-10-11",
    now: new Date("2026-10-11T08:40:00Z"),
  });

  it("من الأقدم للأحدث، والملاحظة ظاهرة بلا مبلغ", () => {
    expect(x.rows.map((r) => r.date)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(x.rows[1]).toMatchObject({ isNote: true, desc: "اتصال", debit: 0, credit: 0, type: "ملاحظة" });
  });

  it("السند داخل البيان، ووسم المرتجع ظاهر، و«للمراجعة» لا يُصدَّر", () => {
    expect(x.rows[0]?.desc).toBe("فاتورة مشتريات · سند 305");
    expect(x.rows[2]?.type).toBe("فاتورة · مرتجع");
    expect(JSON.stringify(x)).not.toContain("للمراجعة");
  });

  it("الملخص والفترة والوقت بتوقيت الرياض", () => {
    expect(x).toMatchObject({ opening: -1000, debit: 300, credit: 5000, closing: -5700, hasOpening: true });
    expect(x.periodLabel).toBe("من 01/07/2026 إلى 30/09/2026");
    expect(x.printedAt).toMatch(/^11\/10\/2026 الساعة 11:40/);
  });

  it("كل الحركات: لا رصيد افتتاحي", () => {
    const all = buildStatementExport({
      supplierName: "أ",
      statement,
      range: null,
      today: "2026-10-11",
      now: new Date(),
    });
    expect(all.hasOpening).toBe(false);
    expect(all.periodLabel).toBe("كل الحركات حتى 11/10/2026");
  });

  it("اسم ملف آمن", () => {
    expect(safeFileName('كشف-المورد/أ:*?"<>|-2026')).toBe("كشف-الموردأ-2026");
    expect(safeFileName("   ")).toBe("كشف");
  });
});
