import { describe, expect, it } from "vitest";
import {
  balanceState,
  currentQuarter,
  formatMoney,
  kindLabel,
  parseEntry,
  sumBalances,
  withRunningBalance,
} from "./ledger";

describe("الأرصدة والكشف", () => {
  it("التنسيق بأرقام لاتينية ومنزلتين", () => {
    expect(formatMoney(120148800)).toBe("1,201,488.00");
    expect(formatMoney(-5)).toBe("-0.05");
    expect(formatMoney(0)).toBe("0.00");
  });
  it("السالب مستحق للمورد", () => {
    expect(balanceState(-1)).toMatchObject({ tone: "neg", label: "مستحق للمورد" });
    expect(balanceState(1).tone).toBe("pos");
    expect(balanceState(0).tone).toBe("zero");
  });
  it("الرصيد التراكمي = السابق + مدين − دائن", () => {
    const r = withRunningBalance(-5000, [
      { debit: 0, credit: 120000 },
      { debit: 120000, credit: 0 },
      { debit: 0, credit: 0 },
    ]);
    expect(r.map((x) => x.balance)).toEqual([-125000, -5000, -5000]);
  });
  it("الإجمالي والربع الحالي", () => {
    const t = sumBalances([
      { id: "a", name: "أ", archived: false, prev: -100, debit: 50, credit: 20, final: -70 },
      { id: "b", name: "ب", archived: false, prev: 10, debit: 0, credit: 5, final: 5 },
    ]);
    expect(t).toEqual({ prev: -90, debit: 50, credit: 25, final: -65 });
    expect(currentQuarter("2026-10-11")).toMatchObject({ from: "2026-10-01", to: "2026-12-31" });
    expect(currentQuarter("2026-03-31")).toMatchObject({ from: "2026-01-01", to: "2026-03-31" });
  });
  it("وسم المرتجع والاسترداد تلقائي", () => {
    expect(kindLabel({ kind: "inv", reversed: true })).toEqual({ label: "فاتورة", tag: "مرتجع" });
    expect(kindLabel({ kind: "misc", reversed: true })).toEqual({ label: "قيد", tag: "استرداد" });
    expect(kindLabel({ kind: "untyped", reversed: false }).label).toBe("بلا نوع");
  });
  it("قراءة الحركة بأمان", () => {
    const e = parseEntry("x", { kind: "inv", debit: 1.5, credit: 300, odoo: { entered: true } });
    expect(e).toMatchObject({ kind: "inv", debit: 0, credit: 300, odooEntered: true, date: "" });
    expect(parseEntry("y", { kind: "weird" }).kind).toBe("untyped");
  });
});
