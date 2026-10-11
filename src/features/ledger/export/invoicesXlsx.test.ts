import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseEntry } from "../core/ledger";
import { buildInvoicesWorkbook, buildNotEnteredWorkbook, odooStatusText } from "./invoicesXlsx";

const inv = (id: string, d: Record<string, unknown>) => ({
  ...parseEntry(id, { supplierId: "s1", kind: "inv", date: "2026-10-05", debit: 0, credit: 0, ...d }),
  supplierName: "المورد (أ)",
});

async function roundTrip(wb: ExcelJS.Workbook) {
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  return back;
}

describe("تصدير الفواتير Excel", () => {
  it("حالة Odoo نصاً، والاستثناء ظاهر", () => {
    expect(odooStatusText({ odooEntered: false, odooLockReason: "" })).toBe("لم تدخل");
    expect(odooStatusText({ odooEntered: true, odooLockReason: "" })).toBe("دخلت");
    expect(odooStatusText({ odooEntered: true, odooLockReason: "سبب" })).toBe("دخلت (استثناء)");
  });

  it("حسب الفلتر: عمود حالة Odoo، والمرتجع سالب، والإجمالي بمعادلة، والرأس يذكر الفلتر", async () => {
    const wb = await roundTrip(
      buildInvoicesWorkbook(
        ExcelJS,
        [
          inv("a", { credit: 150000, refNo: "10001", odoo: { entered: true } }),
          inv("b", {
            debit: 20000,
            reversed: true,
            refNo: "10002",
            odoo: { entered: true, lockReason: "x" },
          }),
        ],
        { scopeLabel: "كل الموردين · كل الفترات", statusLabel: "دخلت", printedAt: "11/10/2026" },
        null,
      ),
    );
    const ws = wb.getWorksheet("الفواتير");
    expect(ws?.getCell("A1").value).toBe("الفواتير وحالتها في Odoo");
    expect(String(ws?.getCell("A2").value)).toContain("كل الموردين · كل الفترات · دخلت");
    expect(ws?.getRow(4).getCell(7).value).toBe("حالة Odoo");
    expect([ws?.getRow(5).getCell(6).value, ws?.getRow(5).getCell(7).value]).toEqual([1500, "دخلت"]);
    expect([ws?.getRow(6).getCell(6).value, ws?.getRow(6).getCell(7).value]).toEqual([
      -200,
      "دخلت (استثناء)",
    ]);
    expect(ws?.getRow(7).getCell(6).value).toMatchObject({ formula: "SUM(F5:F6)", result: 1300 });
  });

  it("تقرير «لم تدخل» يبقى بلا عمود الحالة", async () => {
    const wb = await roundTrip(
      buildNotEnteredWorkbook(
        ExcelJS,
        [inv("a", { credit: 1000 })],
        { scopeLabel: "x", printedAt: "y" },
        null,
      ),
    );
    const ws = wb.getWorksheet("لم تدخل Odoo");
    expect(ws?.getRow(4).getCell(7).value).toBeNull();
    expect(ws?.getCell("A1").value).toBe("تقرير الفواتير التي لم تدخل Odoo");
  });
});
