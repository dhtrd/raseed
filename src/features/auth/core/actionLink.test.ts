import { describe, expect, it } from "vitest";
import { parseActionLink } from "./actionLink";

describe("parseActionLink", () => {
  it("رابط إعادة التعيين", () => {
    expect(parseActionLink("?mode=resetPassword&oobCode=AbC_12-xyz9&apiKey=k&lang=ar")).toEqual({
      kind: "reset",
      code: "AbC_12-xyz9",
    });
  });
  it("وضع آخر غير مدعوم", () => {
    expect(parseActionLink("?mode=verifyEmail&oobCode=AbC_12-xyz9")).toEqual({ kind: "unsupported" });
  });
  it("رمز ناقص أو مشوّه", () => {
    expect(parseActionLink("")).toEqual({ kind: "missing" });
    expect(parseActionLink("?mode=resetPassword")).toEqual({ kind: "missing" });
    expect(parseActionLink("?mode=resetPassword&oobCode=<script>alert(1)</script>")).toEqual({
      kind: "missing",
    });
  });
});
