import { describe, expect, it } from "vitest";
import { balanceEffect, validateDeletion, withDeleted, type DeleteForm } from "./deleteEntry";
import { buildStatement, parseEntry } from "./ledger";

const form = (o: Partial<DeleteForm> = {}): DeleteForm => ({
  reason: "أُدخلت مرتين",
  dupOf: [],
  dupConfirmed: false,
  dupReason: "",
  ...o,
});
const e = (id: string, date: string, debit: number, credit: number) =>
  parseEntry(id, { supplierId: "s1", kind: debit ? "misc" : "inv", date, debit, credit });

describe("الحذف الناعم والاسترجاع", () => {
  it("السبب إلزامي وبحد 300", () => {
    expect(validateDeletion("delete", { date: "2026-10-01" }, form(), null)).toEqual({});
    expect(
      validateDeletion("delete", { date: "2026-10-01" }, form({ reason: "  " }), null).reason,
    ).toBeTruthy();
    expect(
      validateDeletion("restore", { date: "2026-10-01" }, form({ reason: "x".repeat(301) }), null).reason,
    ).toBeTruthy();
  });

  it("الفترة المقفلة تمنع الحذف والاسترجاع", () => {
    expect(validateDeletion("delete", { date: "2026-06-30" }, form(), "2026-06-30").form).toBeTruthy();
    expect(validateDeletion("restore", { date: "2026-07-01" }, form(), "2026-06-30")).toEqual({});
  });

  it("استرجاع رقم مستعمل يحتاج تأكيداً وسبباً", () => {
    const d = { date: "2026-10-01" };
    expect(validateDeletion("restore", d, form({ dupOf: ["المورد (أ)"] }), null).dup).toBeTruthy();
    expect(
      validateDeletion("restore", d, form({ dupOf: ["المورد (أ)"], dupConfirmed: true }), null).dup,
    ).toBeTruthy();
    expect(
      validateDeletion(
        "restore",
        d,
        form({ dupOf: ["المورد (أ)"], dupConfirmed: true, dupReason: "مختلفتان" }),
        null,
      ),
    ).toEqual({});
    // التكرار لا يُفحص عند الحذف
    expect(validateDeletion("delete", d, form({ dupOf: ["المورد (أ)"] }), null)).toEqual({});
  });

  it("أثر الحذف على الرصيد عكس أثر الحركة، والاسترجاع يعيده", () => {
    expect(balanceEffect("delete", { debit: 0, credit: 2500 })).toBe(2500);
    expect(balanceEffect("delete", { debit: 1200, credit: 0 })).toBe(-1200);
    expect(balanceEffect("restore", { debit: 0, credit: 2500 })).toBe(-2500);
  });

  it("المحذوفة تُدمج بترتيبها ولا تغيّر الرصيد الجاري", () => {
    const st = buildStatement(100, [e("a", "2026-10-01", 0, 50), e("c", "2026-10-03", 20, 0)]);
    const gone = { ...e("b", "2026-10-02", 0, 999), deletion: { by: "owner", at: 1, reason: "مكررة" } };
    const rows = withDeleted(st.opening, st.rows, [gone]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.balance)).toEqual([50, 50, 70]);
    expect(rows[1]?.deletion?.reason).toBe("مكررة");
    expect(rows[0]?.deletion).toBeNull();
    expect(rows.map((r) => r.deleted)).toEqual([false, true, false]);
    // المحذوفة القديمة بلا بيانات حذف تبقى محذوفة
    expect(withDeleted(100, st.rows, [{ ...gone, deletion: null }])[1]?.deleted).toBe(true);
    // محذوفة قبل كل الحركات تأخذ الافتتاحي
    expect(withDeleted(100, st.rows, [{ ...gone, date: "2026-09-01" }])[0]?.balance).toBe(100);
  });
});
