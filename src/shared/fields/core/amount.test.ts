import { describe, expect, it } from "vitest";
import { classifyTypedChar, cleanPastedAmount, formatHalalas, formatLive, parseAmount } from "./amount";

describe("حقل المبلغ: الكتابة", () => {
  it("فواصل الآلاف تظهر أثناء الكتابة", () => expect(formatLive("1234567", 7).value).toBe("1,234,567"));
  it("يحافظ على موضع المؤشر بعد إضافة الفاصلة", () => expect(formatLive("12345", 3)).toEqual({ value: "12,345", caret: 4 }));
  it("منزلتان كحد أقصى", () => expect(formatLive("12.345", 6).value).toBe("12.34"));
  it("يحذف الأصفار البادئة", () => expect(formatLive("00012", 5).value).toBe("12"));
  it("نقطة في البداية تصبح 0.", () => expect(formatLive(".5", 2).value).toBe("0.5"));
  it.each([["٥", "digit"], ["5", "digit"], ["۵", "digit"], [".", "decimal"], [",", "decimal"], ["،", "decimal"], ["٫", "decimal"], ["-", "sign"], ["+", "sign"], ["a", "other"], ["ر", "other"]] as const)(
    "تصنيف %s = %s",
    (ch, kind) => expect(classifyTypedChar(ch)).toBe(kind),
  );
});

describe("حقل المبلغ: الخروج", () => {
  it("يُنسَّق 1,234.50", () => {
    const r = parseAmount("1234.5");
    expect(r).toEqual({ ok: true, halalas: 123450 });
    if (r.ok === true) expect(formatHalalas(r.halalas)).toBe("1,234.50");
  });
  it("فارغ", () => expect(parseAmount("")).toEqual({ ok: "empty" }));
  it("الصفر مرفوض", () => expect(parseAmount("0.00")).toMatchObject({ ok: false, error: expect.stringMatching(/أكبر من صفر/) }));
  it("السالب مرفوض", () => expect(parseAmount("-50")).toMatchObject({ ok: false, error: expect.stringMatching(/موجب/) }));
  it("الحد الأقصى 99,999,999.99", () => {
    expect(parseAmount("99,999,999.99")).toEqual({ ok: true, halalas: 9999999999 });
    expect(parseAmount("100,000,000")).toMatchObject({ ok: false });
  });
  it("لا أخطاء كسور عشرية", () => expect(parseAmount("0.29")).toEqual({ ok: true, halalas: 29 }));
});

describe("حقل المبلغ: اللصق", () => {
  it.each([
    ["ر.س 1,234.50", "1234.50"],
    ["1,234.50 SAR", "1234.50"],
    ["⃁ 750", "750"],
    ["3,100", "3100"],
    ["1,250,000", "1250000"],
    ["١٢٥٠٠٫٥", "12500.5"],
    ["1250,5", "1250.5"],
    [" 2 500 ", "2500"],
  ])("%s ← %s", (input, out) => expect(cleanPastedAmount(input)).toEqual({ ok: true, value: out }));
  it("السالب يُرفض ولا يُقلب صامتاً", () => expect(cleanPastedAmount("-300")).toMatchObject({ ok: false }));
  it("الأقواس (سالب محاسبي) تُرفض", () => expect(cleanPastedAmount("(300)")).toMatchObject({ ok: false }));
  it("أكثر من منزلتين يُرفض ولا يُقرَّب", () => expect(cleanPastedAmount("10.555")).toMatchObject({ ok: false, error: expect.stringMatching(/منزلتين/) }));
  it("نص ليس مبلغاً", () => expect(cleanPastedAmount("مرحبا")).toMatchObject({ ok: false }));
});
