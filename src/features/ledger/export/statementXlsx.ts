/**
 * ملف Excel للكشف — الخيار «أ. ورقة واحدة برأس» (DECISIONS 2026-10-11):
 * صفوف رأس، ثم الرصيد الافتتاحي، ثم الحركات من الأقدم للأحدث. الرصيد الجاري والإجمالي معادلات
 * (مع نتيجتها محفوظة) فيصح الحساب إن عُدّل الملف. رمز الريال صورة في رؤوس أعمدة المبالغ (2026-10-10).
 * ExcelJS يُحمَّل عند الطلب فقط كي لا يثقل فتح التطبيق.
 */
import type { Workbook } from "exceljs";
import type { StatementExport } from "../core/exportModel";
import { splitIso } from "../../../shared/fields/core/date";

type ExcelModule = typeof import("exceljs");

const NUM = "#,##0.00;[Red]-#,##0.00";
const HEAD = 4; // صف رؤوس الأعمدة
const OPEN = 5; // صف الرصيد الافتتاحي
const INK = "FF1B2A44";
const GREY = "FF46546D";
const RULE = "FFC9D3DE";

const toMoney = (h: number) => h / 100;
const excelDate = (iso: string) => {
  const { y, m, d } = splitIso(iso);
  return new Date(Date.UTC(y, m - 1, d));
};

/** يبني المصنَّف (قابل للاختبار في Node). `riyalPng` صورة الرمز base64 بلا بادئة، أو null. */
export function buildStatementWorkbook(
  ExcelJS: ExcelModule,
  x: StatementExport,
  riyalPng: string | null,
): Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "رصيد";
  wb.created = new Date();
  const ws = wb.addWorksheet("الكشف", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: HEAD }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${HEAD}:${HEAD}`,
    },
  });
  ws.columns = [
    { key: "date", width: 12 },
    { key: "type", width: 16 },
    { key: "refNo", width: 20 },
    { key: "desc", width: 42 },
    { key: "debit", width: 15 },
    { key: "credit", width: 15 },
    { key: "balance", width: 16 },
  ];

  ws.mergeCells("A1:G1");
  const title = ws.getCell("A1");
  title.value = `كشف حساب: ${x.supplierName}`;
  title.font = { bold: true, size: 15, color: { argb: INK } };
  ws.mergeCells("A2:G2");
  const sub = ws.getCell("A2");
  sub.value = `الفترة: ${x.periodLabel} · صُدّر ${x.printedAt}`;
  sub.font = { size: 10.5, color: { argb: GREY } };

  const head = ws.getRow(HEAD);
  head.values = ["التاريخ", "النوع", "الرقم المرجعي", "البيان", "مدين", "دائن", "الرصيد"];
  head.height = 22;
  head.eachCell((c, col) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    c.alignment = { vertical: "middle", horizontal: col >= 5 ? "center" : "right" };
  });

  const open = ws.getRow(OPEN);
  ws.mergeCells(`A${OPEN}:F${OPEN}`);
  open.getCell(1).value = x.hasOpening ? "الرصيد الافتتاحي" : "الرصيد الافتتاحي (من أول حركة)";
  open.getCell(1).font = { bold: true };
  open.getCell(7).value = toMoney(x.opening);
  open.getCell(7).numFmt = NUM;
  open.getCell(7).font = { bold: true };

  x.rows.forEach((r, i) => {
    const n = OPEN + 1 + i;
    const row = ws.getRow(n);
    row.getCell(1).value = excelDate(r.date);
    row.getCell(1).numFmt = "dd/mm/yyyy";
    row.getCell(2).value = r.type;
    row.getCell(3).value = r.refNo;
    row.getCell(4).value = r.desc; // نص عادي دائماً: لا يُفسَّر معادلة ولو بدأ بـ «=»
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    if (r.debit) row.getCell(5).value = toMoney(r.debit);
    if (r.credit) row.getCell(6).value = toMoney(r.credit);
    row.getCell(7).value = { formula: `G${n - 1}+E${n}-F${n}`, result: toMoney(r.balance) };
    [5, 6, 7].forEach((c) => (row.getCell(c).numFmt = NUM));
    if (r.isNote) row.font = { italic: true, color: { argb: GREY } };
    row.eachCell({ includeEmpty: true }, (c) => {
      c.border = { bottom: { style: "hair", color: { argb: RULE } } };
    });
  });

  const last = OPEN + x.rows.length;
  const t = ws.getRow(last + 1);
  ws.mergeCells(`A${last + 1}:D${last + 1}`);
  t.getCell(1).value = x.hasOpening ? "الرصيد الختامي للفترة" : "الرصيد الكلي";
  t.getCell(5).value = {
    formula: `SUM(E${OPEN + 1}:E${Math.max(last, OPEN + 1)})`,
    result: toMoney(x.debit),
  };
  t.getCell(6).value = {
    formula: `SUM(F${OPEN + 1}:F${Math.max(last, OPEN + 1)})`,
    result: toMoney(x.credit),
  };
  t.getCell(7).value = { formula: `G${OPEN}+E${last + 1}-F${last + 1}`, result: toMoney(x.closing) };
  t.font = { bold: true };
  [5, 6, 7].forEach((c) => {
    t.getCell(c).numFmt = NUM;
    t.getCell(c).border = { top: { style: "thin" }, bottom: { style: "double" } };
  });

  if (riyalPng) {
    const img = wb.addImage({ base64: riyalPng, extension: "png" });
    for (const col of [4, 5, 6]) {
      // صفري الفهرسة: الأعمدة E و F و G، داخل صف الرؤوس قرب حافة الخلية
      ws.addImage(img, { tl: { col: col + 0.08, row: HEAD - 1 + 0.22 }, ext: { width: 11, height: 12 } });
    }
  }
  return wb;
}

/** صورة رمز الريال الرسمي (نفس مسار Riyal في Icon.tsx) بلون أبيض فوق رأس الجدول الكحلي. */
export function riyalPngBase64(path: string): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 44;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(44 / 1145, 48 / 1270);
    ctx.translate(-40, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fill(new Path2D(path));
    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  } catch (e) {
    console.error("تعذّر رسم رمز الريال للملف؛ يُصدَّر الملف بدونه", e);
    return null;
  }
}

/** ينشئ الملف وينزّله في المتصفح. */
export async function downloadStatementXlsx(x: StatementExport, riyalPath: string): Promise<void> {
  const mod = await import("exceljs");
  const ExcelJS = ((mod as { default?: ExcelModule }).default ?? mod) as ExcelModule;
  const wb = buildStatementWorkbook(ExcelJS, x, riyalPngBase64(riyalPath));
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${x.fileBase}.xlsx`;
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
