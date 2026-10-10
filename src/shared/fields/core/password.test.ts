import { describe, expect, it } from "vitest";
import { identifierToEmail, passwordStrength } from "./password";

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
});
