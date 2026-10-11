import { describe, expect, it } from "vitest";
import {
  batchSummary,
  blankRow,
  checkRows,
  fillSequence,
  isBlank,
  parsePasted,
  suggestRefs,
  type BatchRow,
} from "./batch";

const ctx = (over: Partial<Parameters<typeof checkRows>[1]> = {}) => ({
  today: "2026-10-11",
  lockedThrough: "2026-06-30",
  lastDate: "2026-08-14",
  saved: new Map<string, string[]>(),
  ...over,
});
const row = (over: Partial<BatchRow>): BatchRow => ({ ...blankRow(), ...over });

describe("الإدخال السريع: التسلسل", () => {
  it("المقترح = آخر محفوظ + 1، ثم آخر صف من النوع نفسه + 1، ويستمر من رقم المستخدم", () => {
    const rows = suggestRefs(
      [row({}), row({}), row({ type: "misc" }), row({ ref: "12400", refAuto: false }), row({})],
      { inv: "12291", misc: "0395" },
    );
    expect(rows.map((r) => r.ref)).toEqual(["12292", "12293", "0396", "12400", "12401"]);
  });

  it("الصف الجديد يرث التاريخ والنوع، والفارغ لا يُعدّ", () => {
    const b = blankRow({ dateRaw: "15/08/2026", type: "misc" });
    expect(b).toMatchObject({ dateRaw: "15/08/2026", type: "misc", ref: "" });
    expect(isBlank({ ...b, ref: "0396" })).toBe(true);
    expect(isBlank({ ...b, amountRaw: "10" })).toBe(false);
  });

  it("التعبئة التسلسلية للصفوف المحددة بالترتيب وبنفس العرض", () => {
    const rows = [row({}), row({}), row({}), row({})];
    const r = fillSequence(rows, [3, 1], "0099");
    expect(r.rows.map((x) => x.ref)).toEqual(["", "0099", "", "0100"]);
    expect(r.last).toBe("0100");
    expect(fillSequence(rows, [], "1").error).toBeTruthy();
    expect(fillSequence(rows, [0], "12a").error).toBeTruthy();
  });
});

describe("الإدخال السريع: الفحص", () => {
  it("صف صحيح، و+1 من تاريخ الصف السابق", () => {
    const c = checkRows(
      [
        row({ dateRaw: "1508", ref: "12292", amountRaw: "4,750.00" }),
        row({ dateRaw: "+1", ref: "12293", amountRaw: "10" }),
      ],
      ctx(),
    );
    expect(c[0]).toMatchObject({ date: "2026-08-15", refNo: "P12292", amount: 475000, errors: {} });
    expect(c[1]?.date).toBe("2026-08-16");
  });

  it("الأخطاء: فترة مقفلة، طول المرجع، مبلغ صفر", () => {
    const [c] = checkRows([row({ dateRaw: "200626", ref: "1229", amountRaw: "0" })], ctx());
    expect(Object.keys(c?.errors ?? {}).sort()).toEqual(["amount", "date", "ref"]);
  });

  it("التكرار داخل الدفعة خطأ، والمسجّل مسبقاً يحتاج تأكيداً وسبباً", () => {
    const rows = [
      row({ dateRaw: "1508", ref: "12292", amountRaw: "1" }),
      row({ dateRaw: "1508", ref: "12292", amountRaw: "1" }),
      row({ dateRaw: "1508", ref: "10590", amountRaw: "1" }),
    ];
    const saved = new Map([["P10590", ["المورد (أ)"]]]);
    const c = checkRows(rows, ctx({ saved }));
    expect(c[1]?.errors.ref).toMatch(/مكرر في الصف 1/);
    expect(c[2]?.dupOf).toEqual(["المورد (أ)"]);
    expect(c[2]?.errors.dup).toBeTruthy();
    const ok = checkRows([{ ...rows[2]!, dupConfirmed: true, dupReason: "مرجع مورد آخر" }], ctx({ saved }));
    expect(ok[0]?.errors).toEqual({});
  });

  it("ملخص الدفعة يتجاهل الصفوف الفارغة", () => {
    const rows = [
      row({ dateRaw: "1508", ref: "12292", amountRaw: "1" }),
      row({ dateRaw: "x", amountRaw: "5" }),
      blankRow(),
    ];
    const s = batchSummary(rows, checkRows(rows, ctx()));
    expect(s).toEqual({ ready: 1, bad: 1, dups: 0, total: 2 });
  });
});

describe("اللصق من الإكسل (5 أعمدة)", () => {
  it("يقرأ الأعمدة والنوع وينظف المبلغ، ويقبل ISO عند اللصق", () => {
    const rows = parsePasted(
      ["15/08/2026\t12292\t4,750.00\tفاتورة مشتريات\tفاتورة", "2026-08-19\t0401\tر.س 3,100\tسداد\tق"].join(
        "\n",
      ),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      type: "inv",
      ref: "12292",
      amountRaw: "4,750.00",
      details: "فاتورة مشتريات",
    });
    expect(rows[1]).toMatchObject({ type: "misc", amountRaw: "3,100.00", pasteError: null });
    const c = checkRows(rows, ctx());
    expect(c[1]).toMatchObject({ date: "2026-08-19", refNo: "MISC/2026/08/0401", errors: {} });
  });

  it("عمود ناقص أو نوع غير معروف أو مبلغ سالب = خطأ في الصف", () => {
    const rows = parsePasted(
      [
        "15/08/2026\t12292\t10\tبيان",
        "15/08/2026\t12293\t10\tبيان\tشيك",
        "15/08/2026\t12294\t-300\tبيان\tف",
      ].join("\n"),
    );
    expect(rows[0]?.pasteError).toMatch(/4 أعمدة/);
    expect(rows[1]?.pasteError).toMatch(/غير معروف/);
    expect(rows[2]?.pasteError).toBeTruthy();
    expect(checkRows(rows, ctx()).every((c) => c.errors.amount)).toBe(true);
  });
});
