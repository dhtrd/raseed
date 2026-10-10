import { describe, expect, it } from "vitest";
import { addDays, checkDate, formatDate, formatDateWithDay, parseDateInput, todayInRiyadh } from "./date";

const today = "2026-10-10"; // السبت
const ok = (raw: string, extra: Partial<Parameters<typeof parseDateInput>[1]> = {}) => {
  const r = parseDateInput(raw, { today, ...extra });
  if (!r.ok) throw new Error(`متوقع صحيح: ${raw} — ${r.error}`);
  return r.date;
};
const bad = (raw: string, extra: Partial<Parameters<typeof parseDateInput>[1]> = {}) => {
  const r = parseDateInput(raw, { today, ...extra });
  if (r.ok) throw new Error(`متوقع خطأ: ${raw} → ${r.date}`);
  return r.error;
};

describe("جدول إدخال التاريخ في SPEC (يوم ثم شهر دائماً)", () => {
  it("15 = اليوم 15 من الشهر والسنة الحاليين", () => expect(ok("15")).toBe("2026-10-15"));
  it("رقم واحد", () => expect(ok("5")).toBe("2026-10-05"));
  it("1508 = 15 أغسطس من السنة الحالية", () => expect(ok("1508")).toBe("2026-08-15"));
  it("15/8 = 15 أغسطس", () => expect(ok("15/8")).toBe("2026-08-15"));
  it("15.8 = 15 أغسطس", () => expect(ok("15.8")).toBe("2026-08-15"));
  it("150826 = 15 أغسطس 2026", () => expect(ok("150826")).toBe("2026-08-15"));
  it("15082026 = 15 أغسطس 2026", () => expect(ok("15082026")).toBe("2026-08-15"));
  it("فارغ = اليوم", () => expect(ok("")).toBe(today));
  it("مسافات فقط = اليوم", () => expect(ok("   ")).toBe(today));
  it("+1 من تاريخ الأساس", () => expect(ok("+1", { base: "2026-08-14" })).toBe("2026-08-15"));
  it("-3 من تاريخ الأساس", () => expect(ok("-3", { base: "2026-08-14" })).toBe("2026-08-11"));
  it("+n بلا أساس يُحسب من اليوم", () => expect(ok("+2")).toBe("2026-10-12"));
  it("+n يعبر نهاية الشهر والسنة", () => expect(ok("+3", { base: "2026-12-30" })).toBe("2027-01-02"));
});

describe("الصيغ الإضافية المعتمدة 2026-10-10", () => {
  it("15/8/26", () => expect(ok("15/8/26")).toBe("2026-08-15"));
  it("15/8/2026", () => expect(ok("15/8/2026")).toBe("2026-08-15"));
  it("15-8-2026", () => expect(ok("15-8-2026")).toBe("2026-08-15"));
  it("ISO عند اللصق فقط", () => {
    expect(ok("2026-08-15", { pasted: true })).toBe("2026-08-15");
    expect(bad("2026-08-15")).toMatch(/صيغة|يوجد/);
  });
  it("الأرقام الهندية والفارسية", () => {
    expect(ok("١٥٠٨")).toBe("2026-08-15");
    expect(ok("۱۵/۸")).toBe("2026-08-15");
  });
});

describe("لا يُقبل تاريخ غير صالح بصمت (SPEC §3-د)", () => {
  it("31/02 غير موجود", () => expect(bad("3102")).toBe("لا يوجد يوم 31 في فبراير 2026."));
  it("29/02 في سنة غير كبيسة", () => expect(bad("29/2/2026")).toMatch(/29/));
  it("29/02 في سنة كبيسة صحيح", () => expect(ok("29/2/2028")).toBe("2028-02-29"));
  it("شهر 13", () => expect(bad("0113")).toMatch(/شهر رقم 13/));
  it("لا قراءة شهر/يوم: 08/15 خطأ لأن الشهر 15", () => expect(bad("08/15")).toMatch(/شهر رقم 15/));
  it.each(["158", "15082", "1508202"])("طول ملتبس %s يُرفض", (s) => expect(bad(s)).toMatch(/لا يُفهم بلا لبس/));
  it("حروف", () => expect(bad("15أ")).toMatch(/أرقام/));
  it("سنة بثلاثة أرقام", () => expect(bad("15/8/202")).toMatch(/السنة/));
  it("يوم صفر", () => expect(bad("00")).toMatch(/لا يوجد يوم 0/));
});

describe("العرض والتحققات", () => {
  it("يعرض 15/08/2026 مع اسم اليوم", () => {
    expect(formatDate("2026-08-15")).toBe("15/08/2026");
    expect(formatDateWithDay("2026-08-15")).toBe("السبت 15/08/2026");
  });
  it("الفترة المقفلة تمنع", () => expect(checkDate("2026-06-30", { today, lockedThrough: "2026-06-30" }).error).toMatch(/مقفلة حتى 30\/06\/2026/));
  it("بعد القفل مسموح", () => expect(checkDate("2026-07-01", { today, lockedThrough: "2026-06-30" })).toEqual({}));
  it("المستقبل تنبيه لا منع", () => expect(checkDate("2026-10-11", { today })).toEqual({ warning: expect.stringMatching(/المستقبل/) }));
  it("أقدم من 12 شهراً تنبيه", () => expect(checkDate("2025-10-09", { today }).warning).toMatch(/12 شهراً/));
  it("addDays", () => expect(addDays("2026-02-28", 1)).toBe("2026-03-01"));
  it("اليوم بتوقيت الرياض (UTC+3)", () => {
    expect(todayInRiyadh(new Date("2026-10-10T21:30:00Z"))).toBe("2026-10-11");
    expect(todayInRiyadh(new Date("2026-10-10T20:59:00Z"))).toBe("2026-10-10");
  });
});
