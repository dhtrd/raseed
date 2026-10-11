/**
 * تصدير سجل التدقيق Excel (قرار المستخدم 2026-10-11): السجلات المحمّلة بالفلتر الحالي، من الأحدث،
 * بجملها العربية والسبب و«قبل ← بعد». على نسق تقارير النظام: ورقة من اليمين لليسار برأس.
 */
import type { Workbook } from "exceljs";
import { loadExcel, saveWorkbook, type ExcelModule } from "../../ledger/export/statementXlsx";
import { describe, diffOf, riyadhParts, type AuditRecord, type Names } from "../core/audit";

const INK = "FF1B2A44";
const GREY = "FF46546D";
const HEAD = 4;

export function buildAuditWorkbook(
  ExcelJS: ExcelModule,
  records: AuditRecord[],
  names: Names,
  meta: { scopeLabel: string; printedAt: string },
): Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "رصيد";
  const ws = wb.addWorksheet("التدقيق", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: HEAD }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [{ width: 12 }, { width: 10 }, { width: 18 }, { width: 46 }, { width: 34 }, { width: 46 }];
  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = "سجل التدقيق";
  ws.getCell("A1").font = { bold: true, size: 15, color: { argb: INK } };
  ws.mergeCells("A2:F2");
  ws.getCell("A2").value = `${meta.scopeLabel} · صُدّر ${meta.printedAt} · العدد ${records.length}`;
  ws.getCell("A2").font = { size: 10.5, color: { argb: GREY } };
  const head = ws.getRow(HEAD);
  head.values = ["التاريخ", "الوقت", "المستخدم", "الإجراء", "السبب", "قبل ← بعد"];
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    c.alignment = { horizontal: "right" };
  });
  records.forEach((r, i) => {
    const row = ws.getRow(HEAD + 1 + i);
    const d = describe(r, names);
    if (r.at !== null) {
      const p = riyadhParts(r.at);
      const [y, m, day] = p.day.split("-").map(Number);
      row.getCell(1).value = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1));
      row.getCell(1).numFmt = "dd/mm/yyyy";
      row.getCell(2).value = p.time;
    }
    row.getCell(3).value = d.who;
    row.getCell(4).value = `${d.verb} ${d.target}`.trim();
    row.getCell(5).value = r.reason;
    row.getCell(6).value = diffOf(r, names.supplier)
      .map((x) => `${x.label}: ${x.from} ← ${x.to}`)
      .join("\n");
    row.getCell(6).alignment = { wrapText: true, vertical: "top" };
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
  });
  return wb;
}

export async function downloadAuditXlsx(
  records: AuditRecord[],
  names: Names,
  meta: { scopeLabel: string; printedAt: string; fileBase: string },
): Promise<void> {
  const ExcelJS = await loadExcel();
  await saveWorkbook(buildAuditWorkbook(ExcelJS, records, names, meta), meta.fileBase);
}
