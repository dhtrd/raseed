import { describe, expect, it } from "vitest";
import { emptyForm, isDirty, refNoOf, validateEntryForm, type EntryForm } from "./entryForm";

const ok = (over: Partial<EntryForm> = {}): EntryForm => ({
  ...emptyForm("s1", "inv"),
  date: "2026-10-05",
  ref: "10002",
  amount: 250050,
  ...over,
});

describe("نموذج إضافة حركة", () => {
  it("فاتورة صحيحة بلا أخطاء", () => {
    expect(validateEntryForm(ok(), null)).toEqual({});
  });

  it("الحقول الإلزامية برسائل عربية", () => {
    const e = validateEntryForm(emptyForm(null, "inv"), null);
    expect(Object.keys(e).sort()).toEqual(["amount", "date", "ref", "supplier"]);
    expect(e.ref).toBe("اكتب المرجع الرئيسي.");
  });

  it("طول المرجع: الفاتورة 5 أرقام والقيد 4", () => {
    expect(validateEntryForm(ok({ ref: "0791" }), null).ref).toBeTruthy();
    expect(validateEntryForm(ok({ type: "misc", ref: "0791" }), null).ref).toBeUndefined();
  });

  it("الفترة المقفلة تمنع التاريخ", () => {
    expect(validateEntryForm(ok({ date: "2026-06-30" }), "2026-06-30").date).toBe(
      "الفترة مقفلة حتى 30/06/2026. اختر تاريخاً بعده.",
    );
    expect(validateEntryForm(ok({ date: "2026-07-01" }), "2026-06-30").date).toBeUndefined();
  });

  it("التكرار يتطلب تأكيداً وسبباً", () => {
    expect(validateEntryForm(ok({ dupOf: ["المورد (د)"] }), null).dup).toMatch(/أؤكد/);
    expect(validateEntryForm(ok({ dupOf: ["المورد (د)"], dupConfirmed: true }), null).dup).toMatch(/سبب/);
    expect(
      validateEntryForm(ok({ dupOf: ["المورد (د)"], dupConfirmed: true, dupReason: "فاتورة مختلفة" }), null),
    ).toEqual({});
  });

  it("الملاحظة بلا مبلغ ولا مرجع، والنص إلزامي", () => {
    const n = { ...emptyForm("s1", "note"), date: "2026-10-05" };
    expect(validateEntryForm(n, null)).toEqual({ note: "اكتب نص الملاحظة." });
    expect(validateEntryForm({ ...n, note: "اتصل المورد" }, null)).toEqual({});
  });

  it("الرقم المرجعي المولَّد، والتعديل غير المحفوظ", () => {
    expect(refNoOf({ type: "misc", ref: "0791", date: "2026-08-15" }, "2026-10-11")).toBe(
      "MISC/2026/08/0791",
    );
    expect(refNoOf({ type: "inv", ref: "10002", date: null }, "2026-10-11")).toBe("P10002");
    expect(isDirty(emptyForm("s1"), null)).toBe(false);
    expect(isDirty({ ...emptyForm("s1"), ref: "10003" }, "10003")).toBe(false);
    expect(isDirty({ ...emptyForm("s1"), amount: 100 }, null)).toBe(true);
  });
});
