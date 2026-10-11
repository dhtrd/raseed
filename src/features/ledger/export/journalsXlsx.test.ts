import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseEntry } from "../core/ledger";
import { buildJournalsWorkbook } from "./journalsXlsx";

const j = (id: string, d: Record<string, unknown>) => ({
  ...parseEntry(id, { supplierId: "s1", kind: "misc", date: "2026-10-05", debit: 0, credit: 0, ...d }),
  supplierName: "المورد (أ)",
});

describe("تصدير فهرس القيود Excel", () => {
  it("المدين والدائن وإجمالياتهما والصافي بمعادلات، والنص يبقى نصاً", async () => {
    const wb = buildJournalsWorkbook(
      ExcelJS,
      [
        j("a", { debit: 120000, refNo: "MISC/2026/10/0502", voucher: "6227", details: '=HYPERLINK("x")' }),
        j("b", { credit: 20000, reversed: true, refNo: "MISC/2026/10/0503" }),
      ],
      { scopeLabel: "كل الموردين", printedAt: "11/10/2026" },
      null,
    );
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await wb.xlsx.writeBuffer());
    const ws = back.getWorksheet("القيود");
    expect(ws?.getRow(5).getCell(6).value).toBe(1200);
    expect(ws?.getRow(5).getCell(5).value).toBe('=HYPERLINK("x")');
    expect(ws?.getRow(6).getCell(7).value).toBe(200);
    expect(ws?.getRow(6).getCell(5).value).toBe("(استرداد)");
    expect(ws?.getRow(7).getCell(6).value).toMatchObject({ formula: "SUM(F5:F6)", result: 1200 });
    expect(ws?.getRow(8).getCell(6).value).toMatchObject({ formula: "F7-G7", result: 1000 });
  });
});
