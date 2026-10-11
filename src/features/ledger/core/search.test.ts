import { describe, expect, it } from "vitest";
import { parseEntry } from "./ledger";
import { haystackOf, highlight, normalize, search, type SearchEntry } from "./search";

const ent = (id: string, d: Record<string, unknown>, deleted = false): SearchEntry => ({
  ...parseEntry(id, { supplierId: "s1", ...d }),
  deleted,
});
const SUP = [
  { id: "s1", name: "المورد (أ)" },
  { id: "s2", name: "مؤسسة الإسمنت" },
];
const ENT = [
  ent("a", {
    kind: "inv",
    date: "2026-10-02",
    mainRef: "10002",
    refNo: "P10002",
    details: "فاتورة مشتريات",
    credit: 250050,
  }),
  ent("b", {
    kind: "inv",
    date: "2026-09-15",
    mainRef: "20001",
    refNo: "P20001",
    details: "إسمنت مقاوم",
    credit: 400000,
    supplierId: "s2",
  }),
  ent("c", {
    kind: "misc",
    date: "2026-10-05",
    mainRef: "0501",
    refNo: "MISC/2026/10/0501",
    voucher: "305",
    details: "سداد",
    debit: 250000,
  }),
  ent("d", { kind: "note", date: "2026-10-03", note: "اتصال لتأكيد التوريد" }),
  ent(
    "e",
    {
      kind: "inv",
      date: "2026-10-09",
      mainRef: "10009",
      refNo: "P10009",
      details: "فاتورة مشتريات",
      credit: 1000,
    },
    true,
  ),
];
const nameOf = (id: string) => SUP.find((s) => s.id === id)?.name ?? "";
const run = (q: string) => search(q, ENT, SUP, (e) => haystackOf(e, nameOf(e.supplierId)));

describe("البحث العام", () => {
  it("التطبيع: الهمزات والتاء المربوطة والياء والأرقام العربية والتشكيل", () => {
    expect(normalize("إسمنتٌ مؤسسة على ٢٠٢٦")).toBe("اسمنت مؤسسه علي 2026");
  });

  it("كل الكلمات يجب أن تطابق، والأحدث أولاً والمحذوف آخراً", () => {
    expect(run("مشتريات").entries.map((x) => x.id)).toEqual(["a", "e"]);
    expect(run("اسمنت").suppliers.map((x) => x.id)).toEqual(["s2"]);
    expect(run("اسمنت").entries.map((x) => x.id)).toEqual(["b"]);
    expect(run("مشتريات 10002").entries.map((x) => x.id)).toEqual(["a"]);
    expect(run("   ").total).toBe(0);
  });

  it("المبلغ بلا فواصل وبها، والسند والرقم المرجعي والملاحظة", () => {
    expect(
      run("2500")
        .entries.map((x) => x.id)
        .sort(),
    ).toEqual(["a", "c"]);
    expect(run("2,500.50").entries.map((x) => x.id)).toEqual(["a"]);
    expect(run("٣٠٥").entries.map((x) => x.id)).toEqual(["c"]);
    expect(run("MISC/2026/10").entries.map((x) => x.id)).toEqual(["c"]);
    expect(run("التوريد").entries.map((x) => x.id)).toEqual(["d"]);
  });

  it("الإبراز على النص الأصلي ولو اختلفت الهمزة", () => {
    expect(highlight("إسمنت مقاوم", "اسمنت")).toEqual([
      { text: "إسمنت", hit: true },
      { text: " مقاوم", hit: false },
    ]);
    expect(highlight("P10002", "x")).toEqual([{ text: "P10002", hit: false }]);
  });
});
