import { describe, expect, it } from "vitest";
import { beforeMonth, describeLockChange, monthsOf, planLock } from "./lock";

const TODAY = "2026-10-11";

describe("قفل الفترات: خط الأشهر", () => {
  it("المقفل والمفتوح مؤقتاً والقادم", () => {
    const m = monthsOf(2026, { lockedThrough: "2026-02-28", tempFrom: "2026-06-30" }, TODAY);
    expect(m.map((x) => x.state)).toEqual([
      "locked",
      "locked",
      "opened",
      "opened",
      "opened",
      "opened",
      "open",
      "open",
      "open",
      "future",
      "future",
      "future",
    ]);
    expect(m[1]?.end).toBe("2026-02-28");
    expect(beforeMonth(2026, 3)).toBe("2026-02-28");
    expect(beforeMonth(2026, 1)).toBe("2025-12-31");
  });
});

describe("قفل الفترات: التخطيط", () => {
  const cur = { lockedThrough: "2026-06-30", tempFrom: null };

  it("القفل: سبب إلزامي، ولا تاريخ بعد اليوم ولا نفس التاريخ", () => {
    expect(planLock("lockSet", cur, "2026-09-30", "", TODAY).errors.reason).toBeTruthy();
    expect(planLock("lockSet", cur, "2026-10-31", "x", TODAY).errors.date).toMatch(/لا يتجاوز/);
    expect(planLock("lockSet", cur, "2026-06-30", "x", TODAY).errors.date).toBeTruthy();
    expect(planLock("lockSet", cur, "2026-09-30", "إقفال الربع", TODAY).plan).toEqual({
      action: "lockSet",
      next: { lockedThrough: "2026-09-30", tempFrom: null },
    });
  });

  it("الفتح المؤقت إلى أقدم فقط، ويحفظ الحالي، ثم الإعادة إليه", () => {
    expect(planLock("lockTempOpen", cur, "2026-07-31", "x", TODAY).errors.date).toBeTruthy();
    const t = planLock("lockTempOpen", cur, "2026-02-28", "تاريخ مقلوب", TODAY).plan;
    expect(t?.next).toEqual({ lockedThrough: "2026-02-28", tempFrom: "2026-06-30" });
    const open = t?.next ?? cur;
    expect(planLock("lockTempOpen", open, "2026-01-31", "x", TODAY).errors.form).toBeTruthy();
    expect(planLock("lockRestore", open, null, "انتهى التصحيح", TODAY).plan?.next).toEqual({
      lockedThrough: "2026-06-30",
      tempFrom: null,
    });
    expect(planLock("lockRestore", cur, null, "x", TODAY).errors.form).toBeTruthy();
  });

  it("وصف السجل", () => {
    expect(describeLockChange("lockTempOpen", { lockedThrough: "2026-02-28" })).toBe(
      "فتح مؤقت إلى 28/02/2026",
    );
    expect(describeLockChange("update", { lockedThrough: "2026-06-30" })).toBe("قفل حتى 30/06/2026");
  });
});
