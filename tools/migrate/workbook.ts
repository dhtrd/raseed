/**
 * قراءة ملف الإكسل (المشفّر أو غير المشفّر) إلى بنية خام. كلمة المرور تُستعمل في الذاكرة فقط.
 */
import ExcelJS from "exceljs";
import officeCrypto from "officecrypto-tool";
import type { Cell, RawRow, RawSheet, RawSummary } from "./model.ts";

/** ملف OOXML المشفّر حاوية CFB تبدأ بهذه البصمة. */
export function isEncrypted(buf: Buffer): boolean {
  return buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}

export async function decrypt(buf: Buffer, password: string): Promise<Buffer> {
  try {
    return await officeCrypto.decrypt(buf, { password });
  } catch {
    throw new Error("تعذّر فك تشفير الملف: كلمة المرور غير صحيحة أو الملف تالف.");
  }
}

function cell(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") {
    if ("result" in v) return cell((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("error" in v) return null;
  }
  return null;
}

const num = (v: Cell): number | null => (typeof v === "number" ? v : null);

/**
 * رقم من خلية قد تكون معادلة: ExcelJS يُسقط النتيجة المخزنة حين تكون صفراً،
 * فالمعادلة بلا نتيجة تُقرأ صفراً (تحققنا من الملف بقارئ آخر). الخلية الفارغة تبقى null.
 */
function formulaNum(raw: ExcelJS.CellValue): number | null {
  if (
    raw &&
    typeof raw === "object" &&
    "formula" in raw &&
    (raw as { result?: unknown }).result === undefined
  )
    return 0;
  return num(cell(raw));
}

/** تعبئة صفراء (FFFF00) على الخلية. */
function isYellow(c: ExcelJS.Cell): boolean {
  const f = c.fill as ExcelJS.FillPattern | undefined;
  if (!f || f.type !== "pattern" || f.pattern === "none") return false;
  const argb = f.fgColor?.argb ?? "";
  return /^(FF)?FFFF00$/i.test(argb);
}

export interface LoadedWorkbook {
  sheets: RawSheet[];
  summary: RawSummary;
}

/**
 * أوراق الموردين هي الواقعة بين «نوع المستند» و«تقرير_التكرار» (ترتيب الملف)، ورأس الجدول في الصف 3:
 * م · التاريخ · مرجع رئيسي · الرقم المرجعي · نوع المستند · رقم السند · التفاصيل · مدين · دائن · الرصيد.
 */
export async function loadWorkbook(buf: Buffer): Promise<LoadedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const names = wb.worksheets.map((w) => w.name);
  const start = names.indexOf("نوع المستند");
  const end = names.indexOf("تقرير_التكرار");
  if (start < 0 || end < 0 || end <= start + 1)
    throw new Error("بنية الملف غير متوقعة: لم أجد ورقتي «نوع المستند» و«تقرير_التكرار» حول أوراق الموردين.");

  const sheets: RawSheet[] = wb.worksheets.slice(start + 1, end).map((ws) => {
    const head = ws.getRow(3);
    const expected = ["م", "التاريخ", "مرجع رئيسي"];
    const got = [1, 2, 3].map((c) => String(cell(head.getCell(c).value) ?? "").trim());
    if (got.join("|") !== expected.join("|"))
      throw new Error(`ورقة «${ws.name}»: رأس الجدول في الصف 3 غير متوقع (${got.join(" · ")}).`);
    const rows: RawRow[] = [];
    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const v = (c: number) => cell(row.getCell(c).value);
      rows.push({
        row: r,
        date: v(2),
        mainRef: v(3),
        refNo: v(4),
        kind: v(5),
        voucher: v(6),
        details: v(7),
        debit: v(8),
        credit: v(9),
        yellow: isYellow(row.getCell(3)),
      });
    }
    const h = ws.getRow(2);
    return {
      name: ws.name,
      rows,
      header: { debit: formulaNum(h.getCell(8).value), credit: formulaNum(h.getCell(9).value) },
    };
  });

  const main = wb.getWorksheet("الرئيسية");
  if (!main) throw new Error("ورقة «الرئيسية» غير موجودة.");
  const d = (c: Cell) => (c instanceof Date ? c : null);
  const lines: RawSummary["lines"] = [];
  for (let r = 5; r <= main.rowCount; r++) {
    const row = main.getRow(r);
    const name = cell(row.getCell(2).value);
    if (typeof name !== "string" || !name.trim() || cell(row.getCell(1).value) === "⚠️") break;
    lines.push({
      name: name.trim(),
      prev: formulaNum(row.getCell(3).value),
      debit: formulaNum(row.getCell(4).value),
      credit: formulaNum(row.getCell(5).value),
    });
  }
  return {
    sheets,
    summary: {
      from: d(cell(main.getRow(3).getCell(1).value)),
      to: d(cell(main.getRow(3).getCell(4).value)),
      lines,
    },
  };
}
