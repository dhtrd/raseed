import { describe, expect, it } from "vitest";
import { filterByOdoo, invoiceAmount, invoiceCounts, planOdooChange, validateLockReason } from "./invoices";
import { parseEntry } from "./ledger";

const inv = (id: string, d: Record<string, unknown>) =>
  parseEntry(id, { supplierId: "s1", kind: "inv", date: "2026-07-01", debit: 0, credit: 0, ...d });

const rows = [
  inv("a", { credit: 10000, odoo: { entered: true } }),
  inv("b", { credit: 5000, odoo: { entered: false } }),
  inv("c", { debit: 2000, reversed: true, odoo: { entered: false }, date: "2026-06-30" }),
  inv("d", { credit: 700 }), // بلا odoo: لم تدخل
];

describe("فهرس الفواتير", () => {
  it("المرتجع بإشارة سالبة", () => {
    expect(invoiceAmount({ debit: 0, credit: 5000 })).toBe(5000);
    expect(invoiceAmount({ debit: 2000, credit: 0 })).toBe(-2000);
  });

  it("دخلت + لم تدخل = الإجمالي في كل فلتر", () => {
    const c = invoiceCounts(rows);
    expect(c).toEqual({
      total: 4,
      entered: 1,
      notEntered: 3,
      notEnteredAmount: 5000 - 2000 + 700,
      enteredAmount: 10000,
      totalAmount: 10000 + 5000 - 2000 + 700,
    });
    expect(filterByOdoo(rows, "in")).toHaveLength(c.entered);
    expect(filterByOdoo(rows, "out")).toHaveLength(c.notEntered);
    expect(filterByOdoo(rows, "all")).toHaveLength(c.total);
  });

  it("خطة التغيير تستبعد المقفل وما حالته قائمة", () => {
    const p = planOdooChange(rows, true, "2026-06-30");
    expect(p.unchanged.map((r) => r.id)).toEqual(["a"]);
    expect(p.locked.map((r) => r.id)).toEqual(["c"]);
    expect(p.change.map((r) => r.id)).toEqual(["b", "d"]);
    expect(planOdooChange(rows, false, null).change.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("استثناء الفترة المقفلة", () => {
  it("السبب إلزامي وبحد 300", () => {
    expect(validateLockReason("  ")).toBeTruthy();
    expect(validateLockReason("x".repeat(301))).toBeTruthy();
    expect(validateLockReason("أُدخلت قبل الإقفال")).toBeNull();
  });
  it("سبب الاستثناء يُقرأ من الفاتورة فقط", () => {
    expect(inv("x", { odoo: { entered: true, lockReason: "سبب" } }).odooLockReason).toBe("سبب");
    expect(inv("y", {}).odooLockReason).toBe("");
    expect(parseEntry("z", { kind: "misc", odoo: { lockReason: "x" } }).odooLockReason).toBe("");
  });
});
