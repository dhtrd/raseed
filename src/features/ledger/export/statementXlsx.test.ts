import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildStatementExport } from "../core/exportModel";
import { buildStatement, parseEntry } from "../core/ledger";
import { buildStatementWorkbook } from "./statementXlsx";

const e = (id: string, d: Record<string, unknown>) =>
  parseEntry(id, { supplierId: "s1", date: "2026-07-01", debit: 0, credit: 0, ...d });

const model = buildStatementExport({
  supplierName: "المورد (أ)",
  statement: buildStatement(-100000, [
    e("a", { kind: "inv", credit: 250050, refNo: "P10002", details: '=HYPERLINK("x")' }),
    e("b", { kind: "note", note: "اتصال", date: "2026-07-02" }),
    e("c", {
      kind: "misc",
      debit: 120000,
      refNo: "MISC/2026/07/0502",
      date: "2026-07-03",
      needsManualFix: true,
    }),
  ]),
  range: { from: "2026-07-01", to: "2026-09-30" },
  today: "2026-10-11",
  now: new Date("2026-10-11T08:40:00Z"),
});

async function roundTrip() {
  const wb = buildStatementWorkbook(ExcelJS, model, null);
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  const ws = back.getWorksheet("الكشف");
  if (!ws) throw new Error("الورقة غير موجودة");
  return ws;
}

describe("ملف Excel للكشف (الخيار أ)", () => {
  it("رأس، ورصيد افتتاحي، ثم الحركات من الأقدم مع الملاحظة", async () => {
    const ws = await roundTrip();
    expect(ws.getCell("A1").value).toBe("كشف حساب: المورد (أ)");
    expect(String(ws.getCell("A2").value)).toContain("من 01/07/2026 إلى 30/09/2026");
    expect(ws.getRow(4).values).toEqual([
      undefined,
      "التاريخ",
      "النوع",
      "الرقم المرجعي",
      "البيان",
      "مدين",
      "دائن",
      "الرصيد",
    ]);
    expect(ws.getCell("G5").value).toBe(-1000);
    expect(ws.getCell("C6").value).toBe("P10002");
    expect(ws.getCell("D7").value).toBe("اتصال");
    expect(ws.getCell("E7").value).toBeNull();
  });

  it("الرصيد الجاري والإجمالي معادلات بنتائج صحيحة", async () => {
    const ws = await roundTrip();
    expect(ws.getCell("G6").value).toMatchObject({ formula: "G5+E6-F6", result: -3500.5 });
    expect(ws.getCell("G8").value).toMatchObject({ formula: "G7+E8-F8", result: -2300.5 });
    expect(ws.getCell("E9").value).toMatchObject({ formula: "SUM(E6:E8)", result: 1200 });
    expect(ws.getCell("F9").value).toMatchObject({ formula: "SUM(F6:F8)", result: 2500.5 });
    expect(ws.getCell("G9").value).toMatchObject({ formula: "G5+E9-F9", result: -2300.5 });
    expect(ws.getCell("G9").numFmt).toBe("#,##0.00;[Red]-#,##0.00");
  });

  it("الورقة من اليمين لليسار، والتاريخ تاريخ حقيقي، والنص الذي يبدأ بـ = يبقى نصاً", async () => {
    const ws = await roundTrip();
    expect(ws.views[0]).toMatchObject({ rightToLeft: true, state: "frozen", ySplit: 4 });
    expect(ws.getCell("A6").value).toBeInstanceOf(Date);
    expect(ws.getCell("A6").numFmt).toBe("dd/mm/yyyy");
    expect(ws.getCell("D6").value).toBe('=HYPERLINK("x")');
    expect(ws.getCell("D6").formula).toBeUndefined();
  });

  it("لا وسم «للمراجعة» في الملف", async () => {
    const ws = await roundTrip();
    const texts: string[] = [];
    ws.eachRow((r) => r.eachCell((c) => texts.push(String(c.value))));
    expect(texts.join(" ")).not.toContain("للمراجعة");
  });
});
