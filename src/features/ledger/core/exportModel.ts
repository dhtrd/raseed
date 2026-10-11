/**
 * نموذج تصدير الكشف المشترك بين الطباعة وExcel (DECISIONS 2026-10-11: الخيار «أ» لكليهما).
 * من الأقدم إلى الأحدث دائماً (SPEC)، والملاحظات ظاهرة بلا مبلغ، ووسم «للمراجعة» داخلي لا يُصدَّر.
 */
import { formatDate, type IsoDate } from "../../../shared/fields/core/date";
import { kindLabel, type Statement } from "./ledger";

export interface ExportRow {
  date: IsoDate;
  /** «فاتورة» أو «فاتورة · مرتجع» … */
  type: string;
  refNo: string;
  /** البيان، والسند في آخره إن وُجد؛ والملاحظة نصها */
  desc: string;
  debit: number;
  credit: number;
  balance: number;
  isNote: boolean;
}

export interface StatementExport {
  supplierName: string;
  periodLabel: string;
  printedAt: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  hasOpening: boolean;
  rows: ExportRow[];
  fileBase: string;
}

const RIYADH_TIME = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  timeZone: "Asia/Riyadh",
  hour: "numeric",
  minute: "2-digit",
});

/** «11/10/2026 الساعة 11:40 ص» بتوقيت الرياض. */
export function riyadhStamp(now: Date, today: IsoDate): string {
  return `${formatDate(today)} الساعة ${RIYADH_TIME.format(now)}`;
}

/** اسم ملف آمن: يحذف ما ترفضه أنظمة الملفات ويختصر المسافات. */
export function safeFileName(s: string): string {
  return (
    s
      // eslint-disable-next-line no-control-regex -- محارف التحكم تُرفض في أسماء الملفات
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "كشف"
  );
}

export function buildStatementExport(p: {
  supplierName: string;
  statement: Statement;
  range: { from: IsoDate; to: IsoDate } | null;
  today: IsoDate;
  now: Date;
}): StatementExport {
  const { statement: st } = p;
  const rows: ExportRow[] = st.rows.map((r) => {
    const k = kindLabel(r);
    const isNote = r.kind === "note";
    const desc = isNote
      ? r.note
      : [r.details, r.voucher ? `سند ${r.voucher}` : ""].filter(Boolean).join(" · ");
    return {
      date: r.date,
      type: k.tag ? `${k.label} · ${k.tag}` : k.label,
      refNo: r.refNo,
      desc,
      debit: r.debit,
      credit: r.credit,
      balance: r.balance,
      isNote,
    };
  });
  return {
    supplierName: p.supplierName,
    periodLabel: p.range
      ? `من ${formatDate(p.range.from)} إلى ${formatDate(p.range.to)}`
      : `كل الحركات حتى ${formatDate(p.today)}`,
    printedAt: riyadhStamp(p.now, p.today),
    opening: st.opening,
    debit: st.debit,
    credit: st.credit,
    closing: st.closing,
    hasOpening: p.range !== null,
    rows,
    fileBase: safeFileName(`كشف-${p.supplierName}-${p.today}`),
  };
}
