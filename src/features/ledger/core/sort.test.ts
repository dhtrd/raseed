import { describe, expect, it } from "vitest";
import { buildStatement, parseEntry } from "./ledger";
import { ariaSort, nextSort, sortRows } from "./sort";

describe("ترتيب الأعمدة", () => {
  const rows = [
    { n: "ب", v: 5 },
    { n: "أ", v: -3 },
    { n: "ج", v: 5 },
  ];
  const val = (r: (typeof rows)[number], k: "n" | "v") => r[k];

  it("تصاعدي وتنازلي، وثابت عند التساوي", () => {
    expect(sortRows(rows, { key: "v", dir: "asc" }, val).map((r) => r.n)).toEqual(["أ", "ب", "ج"]);
    expect(sortRows(rows, { key: "v", dir: "desc" }, val).map((r) => r.n)).toEqual(["ب", "ج", "أ"]);
    expect(sortRows(rows, { key: "n", dir: "asc" }, val).map((r) => r.n)).toEqual(["أ", "ب", "ج"]);
  });

  it("النقرة على العمود نفسه تعكس الاتجاه، وعلى غيره تبدأ بالاتجاه المحدد", () => {
    expect(nextSort({ key: "v", dir: "desc" }, "v")).toEqual({ key: "v", dir: "asc" });
    expect(nextSort({ key: "v", dir: "asc" }, "n", "asc")).toEqual({ key: "n", dir: "asc" });
    expect(ariaSort({ key: "v", dir: "asc" }, "v")).toBe("ascending");
    expect(ariaSort({ key: "v", dir: "asc" }, "n")).toBe("none");
  });

  it("لا يغيّر المصفوفة الأصلية", () => {
    const copy = [...rows];
    sortRows(rows, { key: "v", dir: "asc" }, val);
    expect(rows).toEqual(copy);
  });
});

describe("بناء الكشف", () => {
  const e = (id: string, d: Record<string, unknown>) =>
    parseEntry(id, { supplierId: "s1", date: "2026-07-01", debit: 0, credit: 0, ...d });

  it("الرصيد الجاري من الافتتاحي، والملاحظة لا تؤثر ولا تُعدّ", () => {
    const st = buildStatement(-1000, [
      e("a", { kind: "inv", credit: 5000 }),
      e("b", { kind: "note", note: "اتصال" }),
      e("c", { kind: "misc", debit: 2000, date: "2026-07-03", needsManualFix: true }),
    ]);
    expect(st.rows.map((r) => r.balance)).toEqual([-6000, -6000, -4000]);
    expect(st).toMatchObject({
      opening: -1000,
      debit: 2000,
      credit: 5000,
      closing: -4000,
      financialCount: 2,
      noteCount: 1,
      reviewCount: 1,
      lastDate: "2026-07-03",
    });
  });

  it("كشف فارغ: الختامي = الافتتاحي", () => {
    expect(buildStatement(250, [])).toMatchObject({ closing: 250, financialCount: 0, lastDate: null });
  });
});
