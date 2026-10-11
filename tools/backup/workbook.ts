/**
 * ملف Excel المقروء مع النسخة (DECISIONS 2026-10-11): ورقة «الأرصدة» لكل الموردين، ثم ورقة كشف لكل مورد
 * من الأقدم للأحدث برصيد جارٍ. المحذوف لا يدخل (كما في الكشف). المرجع الكامل هو ملف البيانات لا هذا الملف.
 */
import ExcelJS from "exceljs";
import type { BackupDump, Encoded } from "./model.ts";

/** نسخة Node مصغّرة من parseEntry/kindLabel في الواجهة (ملفات src تستورد بلا امتدادات فلا يشغّلها Node) */
interface LedgerEntry {
  id: string;
  supplierId: string;
  kind: "inv" | "misc" | "note" | "untyped";
  date: string;
  refNo: string;
  voucher: string;
  details: string;
  note: string;
  debit: number;
  credit: number;
  reversed: boolean;
}

export function parseEntry(id: string, d: Record<string, Encoded>): LedgerEntry {
  const str = (v: Encoded | undefined) => (typeof v === "string" ? v : "");
  const int = (v: Encoded | undefined) => (typeof v === "number" && Number.isInteger(v) ? v : 0);
  const kind = (["inv", "misc", "note", "untyped"] as const).find((k) => k === d.kind) ?? "untyped";
  return {
    id,
    supplierId: str(d.supplierId),
    kind,
    date: str(d.date),
    refNo: str(d.refNo),
    voucher: str(d.voucher),
    details: str(d.details),
    note: str(d.note),
    debit: int(d.debit),
    credit: int(d.credit),
    reversed: d.reversed === true,
  };
}

export function kindLabel(e: Pick<LedgerEntry, "kind" | "reversed">): string {
  if (e.kind === "inv") return e.reversed ? "فاتورة · مرتجع" : "فاتورة";
  if (e.kind === "misc") return e.reversed ? "قيد · استرداد" : "قيد";
  if (e.kind === "note") return "ملاحظة";
  return "بلا نوع";
}

const NUM = "#,##0.00;[Red]-#,##0.00";
const money = (h: number) => h / 100;

/** اسم ورقة صالح وفريد (31 حرفاً على الأكثر، بلا الرموز الممنوعة في Excel) */
export function sheetName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(/[[\]:*?/\\]/g, " ")
      .trim()
      .slice(0, 28) || "مورد";
  let n = base;
  for (let i = 2; used.has(n); i++) n = `${base.slice(0, 26)} ${i}`;
  used.add(n);
  return n;
}

interface SupplierRow {
  id: string;
  name: string;
  archived: boolean;
  entries: LedgerEntry[];
}

export function suppliersOf(dump: Pick<BackupDump, "collections">): SupplierRow[] {
  const sup = dump.collections.suppliers ?? {};
  const byId = new Map<string, SupplierRow>(
    Object.entries(sup).map(([id, d]) => [
      id,
      {
        id,
        name: typeof d.name === "string" ? d.name : id,
        archived: d.status === "archived",
        entries: [],
      },
    ]),
  );
  for (const [id, d] of Object.entries(dump.collections.entries ?? {})) {
    if ((d as { deleted?: Encoded }).deleted === true) continue;
    const e = parseEntry(id, d);
    const s = byId.get(e.supplierId);
    if (s) s.entries.push(e);
  }
  const list = [...byId.values()];
  for (const s of list) s.entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return list.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export function buildBackupWorkbook(dump: Pick<BackupDump, "collections" | "day">): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "رصيد";
  const sups = suppliersOf(dump);
  const used = new Set<string>(["الأرصدة"]);

  const sum = wb.addWorksheet("الأرصدة", { views: [{ rightToLeft: true, state: "frozen", ySplit: 2 }] });
  sum.columns = [{ width: 30 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }];
  sum.addRow([`نسخة «رصيد» الاحتياطية · ${dump.day}`]).font = { bold: true, size: 13 };
  const head = sum.addRow(["المورد", "الحالة", "مدين", "دائن", "الرصيد", "الحركات"]);
  head.font = { bold: true };

  for (const s of sups) {
    let bal = 0;
    const rows = s.entries.map((e) => ({ ...e, balance: (bal += e.debit - e.credit) }));
    let debit = 0;
    let credit = 0;
    for (const r of rows) {
      debit += r.debit;
      credit += r.credit;
    }
    const r = sum.addRow([
      s.name,
      s.archived ? "مؤرشف" : "نشط",
      money(debit),
      money(credit),
      money(debit - credit),
      s.entries.length,
    ]);
    for (const c of [3, 4, 5]) r.getCell(c).numFmt = NUM;

    const ws = wb.addWorksheet(sheetName(s.name, used), {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 2 }],
    });
    ws.columns = [
      { width: 12 },
      { width: 14 },
      { width: 20 },
      { width: 16 },
      { width: 40 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
    ];
    ws.addRow([`كشف ${s.name}`]).font = { bold: true, size: 13 };
    ws.addRow(["التاريخ", "النوع", "الرقم المرجعي", "السند", "البيان", "مدين", "دائن", "الرصيد"]).font = {
      bold: true,
    };
    for (const e of rows) {
      const line = ws.addRow([
        e.date,
        kindLabel(e),
        e.refNo,
        e.voucher,
        e.kind === "note" ? e.note : e.details,
        e.debit ? money(e.debit) : null,
        e.credit ? money(e.credit) : null,
        money(e.balance),
      ]);
      for (const c of [6, 7, 8]) line.getCell(c).numFmt = NUM;
    }
  }
  return wb;
}
