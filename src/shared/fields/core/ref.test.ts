import { describe, expect, it } from "vitest";
import { buildRefNo, nextInSequence, normalizeRef, refIndexKey, validateRef } from "./ref";
import { cleanPastedText, normalizeForSearch } from "./text";
import { normalizeVoucher, validateVoucher } from "./voucher";
import { reversalTag, sideFor } from "../../domain/direction";

describe("المرجع الرئيسي", () => {
  it("يحفظ الأصفار البادئة", () => expect(normalizeRef("0791")).toBe("0791"));
  it("يقص المسافات ويكبّر اللاتيني", () => expect(normalizeRef("  out/00013 ")).toBe("OUT/00013"));
  it("يحوّل الأرقام الهندية", () => expect(normalizeRef("٠٧٩١")).toBe("0791"));
  it("الفاتورة 5 أرقام بالضبط", () => {
    expect(validateRef("12345", "inv")).toBeNull();
    expect(validateRef("0791", "inv")).toMatch(/5 أرقام/);
    expect(validateRef("123456", "inv")).toMatch(/5 أرقام/);
  });
  it("القيد 4 أرقام بالضبط", () => {
    expect(validateRef("0395", "misc")).toBeNull();
    expect(validateRef("395", "misc")).toMatch(/4 أرقام/);
    expect(validateRef("03950", "misc")).toMatch(/4 أرقام/);
  });
  it("المراجع ببادئة تُقبل كما تُكتب", () => {
    expect(validateRef("OUT/00013", "inv")).toBeNull();
    expect(validateRef("العز/OUT/00011", "inv")).toBeNull();
  });
  it("يرفض المسافات الداخلية والرموز", () => {
    expect(validateRef("12 345", "inv")).toMatch(/بلا مسافات/);
    expect(validateRef("12$45", "inv")).toMatch(/حروف/);
  });
  it("حتى 40 حرفاً", () => expect(validateRef("A".repeat(41), "inv")).toMatch(/40/));
  it("التسلسل يزيد بنفس العرض", () => {
    expect(nextInSequence("0799")).toBe("0800");
    expect(nextInSequence("12291")).toBe("12292");
    expect(nextInSequence("OUT/00013")).toBe("OUT/00014");
    expect(nextInSequence("ABC")).toBeNull();
  });
  it("الرقم المرجعي", () => {
    expect(buildRefNo("inv", "12292", "2026-08-15")).toBe("P12292");
    expect(buildRefNo("misc", "0395", "2026-08-15")).toBe("MISC/2026/08/0395");
  });
  it("مفتاح الفهرس بلا /", () => expect(refIndexKey("MISC/2026/08/0395")).toBe("MISC|2026|08|0395"));
});

describe("السند والنص والبحث", () => {
  it("السند أرقام بأصفارها", () => {
    expect(normalizeVoucher(" ٠٠٤٢ ")).toBe("0042");
    expect(validateVoucher("0042")).toBeNull();
    expect(validateVoucher("12a")).toMatch(/أرقام فقط/);
    expect(validateVoucher("1.5")).toMatch(/أرقام فقط/);
    expect(validateVoucher("1234567890123")).toMatch(/12/);
    expect(validateVoucher("")).toBeNull();
  });
  it("لصق النص", () => {
    expect(cleanPastedText("سطر\r\nثان\u0007", true)).toBe("سطر\nثان ");
    expect(cleanPastedText("سطر\nثان", false)).toBe("سطر ثان");
  });
  it("بحث يتجاهل الهمزات والتاء المربوطة والتشكيل", () => {
    expect(normalizeForSearch("مؤسسة الأَمثلة")).toBe(normalizeForSearch("مؤسسه الامثله"));
  });
});

describe("اتجاه المبلغ", () => {
  it("الفاتورة دائن والقيد مدين", () => {
    expect(sideFor("inv", false)).toBe("credit");
    expect(sideFor("misc", false)).toBe("debit");
  });
  it("العكس الصريح", () => {
    expect(sideFor("inv", true)).toBe("debit");
    expect(reversalTag("inv", true)).toBe("مرتجع");
    expect(reversalTag("misc", true)).toBe("استرداد");
    expect(reversalTag("inv", false)).toBeNull();
  });
});
