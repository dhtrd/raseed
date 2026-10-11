/**
 * «تقرير الفواتير التي لم تدخل» Excel (direction-1/invoices.html: زر «تصدير التقرير Excel»).
 * على نسق ملف الكشف المعتمد: ورقة من اليمين لليسار، رأس، جدول، وإجمالي بمعادلة. المرتجع بإشارة سالبة.
 */
import type { Workbook } from "exceljs";
import { splitIso, type IsoDate } from "../../../shared/fields/core/date";
import { invoiceAmount, type InvoiceRow } from "../core/invoices";
import { kindLabel } from "../core/ledger";
import { loadExcel, riyalPngBase64, saveWorkbook, type ExcelModule } from "./statementXlsx";

const NUM = "#,##0.00;[Red]-#,##0.00";
const INK = "FF1B2A44";
const GREY = "FF46546D";
const HEAD = 4;

export function buildNotEnteredWorkbook(
  ExcelJS: ExcelModule,
  rows: InvoiceRow[],
  meta: { scopeLabel: string; printedAt: string },
  riyalPng: string | null,
): Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "رصيد";
  const ws = wb.addWorksheet("لم تدخل Odoo", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: HEAD }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [{ width: 22 }, { width: 12 }, { width: 16 }, { width: 10 }, { width: 40 }, { width: 16 }];
  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = "تقرير الفواتير التي لم تدخل Odoo";
  ws.getCell("A1").font = { bold: true, size: 15, color: { argb: INK } };
  ws.mergeCells("A2:F2");
  ws.getCell("A2").value = `${meta.scopeLabel} · صُدّر ${meta.printedAt} · العدد ${rows.length}`;
  ws.getCell("A2").font = { size: 10.5, color: { argb: GREY } };
  const head = ws.getRow(HEAD);
  head.values = ["المورد", "التاريخ", "الرقم المرجعي", "السند", "البيان", "المبلغ"];
  head.eachCell((c, col) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    c.alignment = { horizontal: col === 6 ? "center" : "right" };
  });
  rows.forEach((r, i) => {
    const row = ws.getRow(HEAD + 1 + i);
    const { y, m, d } = splitIso(r.date as IsoDate);
    const tag = kindLabel(r).tag;
    row.getCell(1).value = r.supplierName;
    row.getCell(2).value = new Date(Date.UTC(y, m - 1, d));
    row.getCell(2).numFmt = "dd/mm/yyyy";
    row.getCell(3).value = r.refNo;
    row.getCell(4).value = r.voucher;
    row.getCell(5).value = tag ? `${r.details} (${tag})`.trim() : r.details;
    row.getCell(6).value = invoiceAmount(r) / 100;
    row.getCell(6).numFmt = NUM;
  });
  const last = HEAD + rows.length;
  const t = ws.getRow(last + 1);
  ws.mergeCells(`A${last + 1}:E${last + 1}`);
  t.getCell(1).value = "الإجمالي";
  t.getCell(6).value = {
    formula: `SUM(F${HEAD + 1}:F${Math.max(last, HEAD + 1)})`,
    result: rows.reduce((a, r) => a + invoiceAmount(r), 0) / 100,
  };
  t.getCell(6).numFmt = NUM;
  t.font = { bold: true };
  t.getCell(6).border = { top: { style: "thin" }, bottom: { style: "double" } };
  if (riyalPng) {
    const img = wb.addImage({ base64: riyalPng, extension: "png" });
    ws.addImage(img, { tl: { col: 5 + 0.08, row: HEAD - 1 + 0.22 }, ext: { width: 11, height: 12 } });
  }
  return wb;
}

export async function downloadNotEnteredXlsx(
  rows: InvoiceRow[],
  meta: { scopeLabel: string; printedAt: string; fileBase: string },
  riyalPath: string,
): Promise<void> {
  const ExcelJS = await loadExcel();
  await saveWorkbook(buildNotEnteredWorkbook(ExcelJS, rows, meta, riyalPngBase64(riyalPath)), meta.fileBase);
}
