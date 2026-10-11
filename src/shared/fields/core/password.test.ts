import { describe, expect, it } from "vitest";
import {
  browserRandomInt,
  generatePassword,
  identifierToEmail,
  isStrongPassword,
  passwordStrength,
} from "./password";

describe("الدخول", () => {
  it("اسم المستخدم يُحوَّل داخلياً إلى بريد ثابت", () => {
    expect(identifierToEmail("Ahmad")).toEqual({ ok: true, email: "ahmad@users.raseed.internal" });
    expect(identifierToEmail("a@b.co")).toEqual({ ok: true, email: "a@b.co" });
    expect(identifierToEmail("x")).toMatchObject({ ok: false });
    expect(identifierToEmail("bad@")).toMatchObject({ ok: false });
  });
  it("قوة كلمة المرور", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("password123")).toBe(1);
    expect(passwordStrength("aaaaaaaaaaaaaa")).toBe(1);
    expect(passwordStrength("Ahmad2026!xyzQ", ["ahmad"])).toBe(1);
    expect(passwordStrength("Tq7#mLx9!pR2vZ")).toBe(3);
  });
  it("«قوية» تطابق سياسة Firebase: 12 حرفاً والأنواع الأربعة", () => {
    // ثلاثة أنواع فقط (بلا رمز) لم تعد «قوية» لأن Firebase يرفضها
    expect(passwordStrength("Tq7mLx9pR2vZab")).toBe(2);
    // 11 حرفاً بالأنواع الأربعة
    expect(passwordStrength("Tq7#mLx9!pR")).toBe(2);
    expect(isStrongPassword("Tq7#mLx9!pR2")).toBe(true);
    expect(isStrongPassword("Tq7mLx9pR2vZab")).toBe(false);
    expect(isStrongPassword("Fahad#2026xyQ", ["fahad"])).toBe(false);
  });
  it("الكلمة المولّدة قوية دائماً وبلا حروف ملتبسة", () => {
    for (let i = 0; i < 300; i++) {
      const p = generatePassword(browserRandomInt);
      expect(p).toHaveLength(16);
      expect(isStrongPassword(p)).toBe(true);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
  it("المولّد في المدى المطلوب", () => {
    for (let i = 0; i < 500; i++) {
      const v = browserRandomInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
});
