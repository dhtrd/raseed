/**
 * تصدير فهرس القيود Excel (قرار المستخدم 2026-10-11) على نسق تقرير الفواتير: ورقة من اليمين لليسار،
 * رأس، جدول بعمودي المدين والدائن، وإجماليات ومعادلة الصافي.
 */
import type { Workbook } from "exceljs";
import { splitIso, type IsoDate } from "../../../shared/fields/core/date";
import { journalCounts, type JournalRow } from "../core/journals";
import { kindLabel } from "../core/ledger";
import { loadExcel, riyalPngBase64, saveWorkbook, type ExcelModule } from "./statementXlsx";

const NUM = "#,##0.00;[Red]-#,##0.00";
const INK = "FF1B2A44";
const GREY = "FF46546D";
const HEAD = 4;

export function buildJournalsWorkbook(
  ExcelJS: ExcelModule,
  rows: JournalRow[],
  meta: { scopeLabel: string; printedAt: string },
  riyalPng: string | null,
): Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "رصيد";
  const ws = wb.addWorksheet("القيود", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: HEAD }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 22 },
    { width: 12 },
    { width: 22 },
    { width: 10 },
    { width: 36 },
    { width: 15 },
    { width: 15 },
  ];
  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = "فهرس القيود";
  ws.getCell("A1").font = { bold: true, size: 15, color: { argb: INK } };
  ws.mergeCells("A2:G2");
  ws.getCell("A2").value = `${meta.scopeLabel} · صُدّر ${meta.printedAt} · العدد ${rows.length}`;
  ws.getCell("A2").font = { size: 10.5, color: { argb: GREY } };
  const head = ws.getRow(HEAD);
  head.values = ["المورد", "التاريخ", "الرقم المرجعي", "السند", "البيان", "مدين", "دائن"];
  head.eachCell((c, col) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    c.alignment = { horizontal: col >= 6 ? "center" : "right" };
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
    if (r.debit) row.getCell(6).value = r.debit / 100;
    if (r.credit) row.getCell(7).value = r.credit / 100;
    row.getCell(6).numFmt = NUM;
    row.getCell(7).numFmt = NUM;
  });
  const first = HEAD + 1;
  const last = Math.max(HEAD + rows.length, first);
  const c = journalCounts(rows);
  const total = ws.getRow(HEAD + rows.length + 1);
  ws.mergeCells(`A${total.number}:E${total.number}`);
  total.getCell(1).value = "الإجمالي";
  total.getCell(6).value = { formula: `SUM(F${first}:F${last})`, result: c.debit / 100 };
  total.getCell(7).value = { formula: `SUM(G${first}:G${last})`, result: c.credit / 100 };
  const net = ws.getRow(total.number + 1);
  ws.mergeCells(`A${net.number}:E${net.number}`);
  net.getCell(1).value = "الصافي (السداد − الاسترداد)";
  net.getCell(6).value = { formula: `F${total.number}-G${total.number}`, result: c.net / 100 };
  for (const r of [total, net]) {
    r.font = { bold: true };
    r.getCell(6).numFmt = NUM;
    r.getCell(7).numFmt = NUM;
  }
  net.getCell(6).border = { top: { style: "thin" }, bottom: { style: "double" } };
  if (riyalPng) {
    const img = wb.addImage({ base64: riyalPng, extension: "png" });
    for (const col of [5, 6])
      ws.addImage(img, { tl: { col: col + 0.08, row: HEAD - 1 + 0.22 }, ext: { width: 11, height: 12 } });
  }
  return wb;
}

export async function downloadJournalsXlsx(
  rows: JournalRow[],
  meta: { scopeLabel: string; printedAt: string; fileBase: string },
  riyalPath: string,
): Promise<void> {
  const ExcelJS = await loadExcel();
  await saveWorkbook(buildJournalsWorkbook(ExcelJS, rows, meta, riyalPngBase64(riyalPath)), meta.fileBase);
}
