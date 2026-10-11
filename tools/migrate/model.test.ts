// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildPlan,
  computedRefNo,
  refKey,
  toHalalas,
  type RawRow,
  type RawSheet,
  type RawSummary,
} from "./model.ts";

/** بيانات وهمية فقط (المستودع عام). */
const d = (s: string) => new Date(`${s}T00:00:00Z`);
let n = 4;
const row = (o: Partial<RawRow>): RawRow => ({
  row: n++,
  date: d("2026-07-10"),
  mainRef: null,
  refNo: null,
  kind: null,
  voucher: null,
  details: "تفاصيل",
  debit: null,
  credit: null,
  yellow: false,
  ...o,
});
const inv = (ref: string, amount: number, o: Partial<RawRow> = {}) =>
  row({ kind: "فاتورة", mainRef: ref, refNo: `P${ref}`, credit: amount, voucher: 101, ...o });
const misc = (ref: string, amount: number, date = "2026-07-12", o: Partial<RawRow> = {}) =>
  row({
    kind: "قيد",
    mainRef: ref,
    refNo: computedRefNo("misc", ref, date),
    date: d(date),
    debit: amount,
    voucher: 6001,
    ...o,
  });

function fixture() {
  n = 4;
  const a: RawSheet = {
    name: "المورد (أ) ",
    rows: [
      row({ date: d("2026-06-01"), details: "رصيد افتتاحي", credit: 50 }),
      inv("10001", 1200.5, { yellow: true }),
      misc("0101", 1200.5),
      inv("10002", 300, { debit: 300, credit: null }), // مرتجع
      row({ date: null, details: null }), // فارغ
    ],
    header: { debit: 1500.5, credit: 1250.5 },
  };
  n = 4;
  const b: RawSheet = {
    name: "المورد (ب)",
    rows: [
      inv("10001", 99), // تكرار عام مع (أ)
      misc("0102", 10, "2026-07-20", { credit: 10, debit: null }), // استرداد
      misc("0103", 5, "2026-07-21", { yellow: true, voucher: "سداد فاتورة" }),
      inv("123", 7),
    ],
    header: { debit: 5, credit: 116 },
  };
  const summary: RawSummary = {
    from: d("2026-07-01"),
    to: d("2026-09-30"),
    lines: [
      { name: "المورد (أ)", prev: -50, debit: 1500.5, credit: 1200.5 },
      { name: "المورد  (ب)", prev: 0, debit: 5, credit: 116 },
    ],
  };
  return { sheets: [a, b], summary };
}

describe("النقل من الإكسل", () => {
  it("المبالغ بالهللات بلا كسور عائمة، والسالب والنص مرفوضان", () => {
    expect(toHalalas(1201487.9999999998)).toEqual({ ok: true, value: 120148800 });
    expect(toHalalas(null)).toEqual({ ok: true, value: 0 });
    expect(toHalalas(-1)).toMatchObject({ ok: false });
    expect(toHalalas("12")).toMatchObject({ ok: false });
    expect(refKey("MISC/2026/07/0101")).toBe("MISC|2026|07|0101");
  });

  it("ينقل كما هو: الأعداد والاتجاه وOdoo والمطابقة", () => {
    const { sheets, summary } = fixture();
    const p = buildPlan(sheets, summary, [], "2026-10-11");
    expect(p.blockers).toEqual([]);
    expect(p.totals).toMatchObject({ rows: 8, inv: 4, misc: 3, untyped: 1, reversed: 2, odooEntered: 1 });
    expect(p.suppliers.map((s) => [s.id, s.name])).toEqual([
      ["s01", "المورد (أ)"],
      ["s02", "المورد (ب)"],
    ]);
    const first = p.entries[1]!;
    expect(first).toMatchObject({
      id: "m-s01-r0005",
      kind: "inv",
      credit: 120050,
      odooEntered: true,
      reversed: false,
    });
    expect(p.entries.find((e) => e.mainRef === "10002")).toMatchObject({ reversed: true, debit: 30000 });
    expect(p.supplierChecks.every((c) => c.ok)).toBe(true);
    expect(p.period.ok).toBe(true);
  });

  it("يعلّم الشاذ للتعديل اليدوي دون تصحيحه", () => {
    const { sheets, summary } = fixture();
    const p = buildPlan(sheets, summary, [], "2026-10-11");
    const codes = (ref: string) =>
      p.entries.filter((e) => e.mainRef === ref).flatMap((e) => e.issues.map((i) => i.code));
    expect(codes("10001")).toEqual(["duplicate_ref", "duplicate_ref"]);
    expect(codes("0103")).toEqual(expect.arrayContaining(["voucher_text", "odoo_on_journal"]));
    expect(codes("123")).toEqual(["ref_length"]);
    expect(p.entries[0]!.issues.map((i) => i.code)).toEqual(["untyped"]);
    expect(p.entries.find((e) => e.mainRef === "0103")!.voucher).toBe("سداد فاتورة");
    expect(p.refs.get("P10001")!.places.map((x) => x.supplierId)).toEqual(["s01", "s02"]);
  });

  it("الحالات المعروفة تُطابق بالسند، وغير الموجود يُبلَّغ عنه", () => {
    const { sheets, summary } = fixture();
    const p = buildPlan(
      sheets,
      summary,
      [
        {
          issue: "swapped_day_month",
          date: "2026-07-12",
          likely_date: "2026-12-07",
          main_ref: "0101",
          voucher: 6001,
        },
        { issue: "same_voucher_two_refs", main_refs: ["9999"], voucher: 1 },
      ],
      "2026-10-11",
    );
    expect(p.entries.find((e) => e.mainRef === "0101")!.issues[0]).toMatchObject({
      code: "known_swapped_day_month",
    });
    expect(p.unmatchedKnown).toHaveLength(1);
  });

  it("فرق في المجاميع أو تاريخ تالف يظهر ولا يُبتلع", () => {
    const { sheets, summary } = fixture();
    sheets[0]!.header.debit = 1;
    sheets[1]!.rows[0]!.date = "تاريخ" as unknown as Date;
    const p = buildPlan(sheets, summary, [], "2026-10-11");
    expect(p.supplierChecks[0]!.ok).toBe(false);
    expect(p.blockers.join()).toContain("تاريخ غير صالح");
  });
});
