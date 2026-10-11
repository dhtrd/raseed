import { describe as group, expect, it } from "vitest";
import { describe, diffOf, groupByDay, riyadhParts, toneOf, type AuditRecord } from "./audit";

const rec = (o: Partial<AuditRecord>): AuditRecord => ({
  id: "a",
  actor: "u1",
  at: Date.UTC(2026, 9, 11, 10, 40),
  action: "update",
  entity: "entries",
  entityId: "e1",
  before: null,
  after: null,
  reason: "",
  ...o,
});
const names = {
  user: (u: string) => ({ u1: "سالم", u2: "منى" })[u] ?? "مستخدم محذوف",
  supplier: (s: string) => ({ s1: "المورد (أ)" })[s] ?? s,
  entry: (e: string) => (e === "e1" ? "P10003 · المورد (أ)" : null),
};

group("سجل التدقيق", () => {
  it("الجملة: الفاعل والفعل والهدف", () => {
    expect(describe(rec({}), names)).toEqual({
      who: "سالم",
      verb: "عدّل",
      target: "الحركة P10003 · المورد (أ)",
    });
    expect(describe(rec({ action: "rename", entity: "suppliers", entityId: "s1" }), names).target).toBe(
      "المورد «المورد (أ)»",
    );
    expect(describe(rec({ action: "odooEntered" }), names).target).toBe("الفاتورة P10003 · المورد (أ)");
    expect(describe(rec({ action: "createUser", entity: "users", entityId: "u2" }), names)).toMatchObject({
      verb: "أنشأ حساب",
      target: "«منى»",
    });
    expect(describe(rec({ action: "غريب" }), names).verb).toBe("غريب");
  });

  it("قبل ← بعد للحقول المتغيرة فقط وبصيغها", () => {
    const d = diffOf(
      rec({
        before: { credit: 225075, date: "2026-10-06", details: "x" },
        after: { credit: 220575, date: "2026-10-05", details: "x" },
      }),
    );
    expect(d).toEqual([
      { field: "credit", label: "دائن", from: "2,250.75", to: "2,205.75" },
      { field: "date", label: "التاريخ", from: "06/10/2026", to: "05/10/2026" },
    ]);
    expect(diffOf(rec({ before: { status: "active" }, after: { status: "archived" } }))[0]).toMatchObject({
      from: "نشط",
      to: "مؤرشف",
    });
    expect(diffOf(rec({ before: null, after: { a: 1 } }))).toEqual([]);
  });

  it("اللون بحسب النوع", () => {
    expect(toneOf("delete")).toBe("del");
    expect(toneOf("lockTempOpen")).toBe("lock");
    expect(toneOf("odooEnteredLocked")).toBe("lock");
    expect(toneOf("create")).toBe("normal");
  });

  it("الوقت بتوقيت الرياض والتجميع باليوم", () => {
    expect(riyadhParts(Date.UTC(2026, 9, 11, 10, 40))).toEqual({ day: "2026-10-11", time: "1:40 م" });
    expect(riyadhParts(Date.UTC(2026, 9, 10, 22, 5))).toEqual({ day: "2026-10-11", time: "1:05 ص" });
    const g = groupByDay(
      [
        rec({ id: "1" }),
        rec({ id: "2" }),
        rec({ id: "3", at: Date.UTC(2026, 9, 10, 9) }),
        rec({ id: "4", at: Date.UTC(2026, 9, 1, 9) }),
      ],
      "2026-10-11",
    );
    expect(g.map((x) => [x.label, x.items.length])).toEqual([
      ["اليوم 11/10/2026", 2],
      ["أمس 10/10/2026", 1],
      ["01/10/2026", 1],
    ]);
  });
});
