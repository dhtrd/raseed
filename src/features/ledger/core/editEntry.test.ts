import { describe, expect, it } from "vitest";
import { changesOf, editedRefNo, formFromEntry, patchOf, validateEdit } from "./editEntry";
import { parseEntry } from "./ledger";

const inv = parseEntry("e1", {
  supplierId: "s1",
  kind: "inv",
  date: "2026-03-08",
  mainRef: "12290",
  refNo: "P12290",
  credit: 475000,
  details: "فاتورة",
});
const untyped = parseEntry("e2", { supplierId: "s1", kind: "untyped", date: "2026-08-21", credit: 120000 });
const shortRef = parseEntry("e3", {
  supplierId: "s1",
  kind: "inv",
  date: "2026-07-14",
  mainRef: "1229",
  refNo: "P1229",
  credit: 98050,
});

describe("تعديل الحركة", () => {
  it("السبب إلزامي، ولا حفظ بلا تغيير", () => {
    const f = formFromEntry(inv);
    expect(validateEdit(inv, f, null).reason).toBeTruthy();
    expect(validateEdit(inv, { ...f, reason: "تصحيح" }, null)).toEqual({ form: "لا تغيير لحفظه." });
  });

  it("التاريخ المقلوب: تغيير التاريخ وحده يبقي رقم الفاتورة", () => {
    const f = { ...formFromEntry(inv), date: "2026-08-03", reason: "تاريخ مقلوب" };
    expect(validateEdit(inv, f, "2026-02-28")).toEqual({});
    expect(patchOf(inv, f)).toMatchObject({ date: "2026-08-03", refNo: "P12290", credit: 475000, debit: 0 });
    expect(changesOf(inv, f)).toEqual([
      { field: "date", label: "التاريخ", from: "08/03/2026", to: "03/08/2026" },
    ]);
  });

  it("الفترة المقفلة: لا تُعدَّل حركة فيها ولا تُنقل إليها", () => {
    const f = { ...formFromEntry(inv), date: "2026-08-03", reason: "x" };
    expect(validateEdit(inv, f, "2026-04-30").form).toMatch(/فترة مقفلة/);
    const g = { ...formFromEntry(shortRef), ref: "12291", date: "2026-05-01", reason: "x" };
    expect(validateEdit(shortRef, g, "2026-06-30").date).toMatch(/مقفلة/);
  });

  it("بلا نوع: يجب التصنيف، والقيد مدين برقم من شهره", () => {
    const f = { ...formFromEntry(untyped), reason: "تصنيف" };
    expect(validateEdit(untyped, f, null).kind).toBeTruthy();
    const g = { ...f, kind: "misc" as const, ref: "0412" };
    expect(validateEdit(untyped, g, null)).toEqual({});
    expect(patchOf(untyped, g)).toMatchObject({ refNo: "MISC/2026/08/0412", debit: 120000, credit: 0 });
  });

  it("المرجع المنقول المخالف يبقى إن لم يتغير، ويُفحص طوله إن تغيّر", () => {
    const f = { ...formFromEntry(shortRef), details: "ت", reason: "x" };
    expect(validateEdit(shortRef, f, null)).toEqual({});
    expect(validateEdit(shortRef, { ...f, ref: "1230" }, null).ref).toBeTruthy();
    expect(editedRefNo(shortRef, { ...f, ref: "12299" })).toBe("P12299");
  });

  it("الرقم الجديد المكرر يحتاج تأكيداً وسبباً", () => {
    const f = { ...formFromEntry(inv), ref: "12291", reason: "x", dupOf: ["المورد (ب)"] };
    expect(validateEdit(inv, f, null).dup).toBeTruthy();
    expect(validateEdit(inv, { ...f, dupConfirmed: true, dupReason: "مختلفة" }, null)).toEqual({});
  });
});
