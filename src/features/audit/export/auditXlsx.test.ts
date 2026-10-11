import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildAuditWorkbook } from "./auditXlsx";

describe("تصدير سجل التدقيق Excel", () => {
  it("سطر لكل سجل بالجملة والسبب والتغيير", async () => {
    const wb = buildAuditWorkbook(
      ExcelJS,
      [
        {
          id: "a",
          actor: "u1",
          at: Date.UTC(2026, 9, 11, 10, 40),
          action: "delete",
          entity: "entries",
          entityId: "e1",
          before: { deleted: false },
          after: { deleted: true },
          reason: "أُدخلت مرتين",
        },
      ],
      { user: () => "سالم", supplier: (s) => s, entry: () => "P10003 · المورد (أ)" },
      { scopeLabel: "الكل", printedAt: "11/10/2026" },
    );
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await wb.xlsx.writeBuffer());
    const row = back.getWorksheet("التدقيق")?.getRow(5);
    expect(row?.getCell(2).value).toBe("1:40 م");
    expect(row?.getCell(3).value).toBe("سالم");
    expect(row?.getCell(4).value).toBe("حذف الحركة P10003 · المورد (أ)");
    expect(row?.getCell(5).value).toBe("أُدخلت مرتين");
    expect(row?.getCell(6).value).toBe("محذوفة: لا ← نعم");
  });
});
