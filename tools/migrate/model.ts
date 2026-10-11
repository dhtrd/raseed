/**
 * تخطيط النقل من الإكسل (المرحلة 3): منطق نقي بلا ملفات ولا شبكة، كي يُختبر ببيانات وهمية.
 * القاعدة: تُنقل البيانات كما هي دون أي تصحيح آلي؛ كل حالة شاذة تُعلَّم «للتعديل اليدوي» بسببها.
 */

export type Cell = Date | number | string | null;

export interface RawRow {
  row: number;
  date: Cell;
  mainRef: Cell;
  refNo: Cell;
  kind: Cell;
  voucher: Cell;
  details: Cell;
  debit: Cell;
  credit: Cell;
  /** تعبئة صفراء في خلية المرجع = «دخلت Odoo» في الإكسل */
  yellow: boolean;
}

export interface RawSheet {
  name: string;
  rows: RawRow[];
  /** إجماليات رأس الورقة (الصف 2) كما حسبها الإكسل */
  header: { debit: number | null; credit: number | null };
}

export interface RawSummary {
  from: Date | null;
  to: Date | null;
  lines: { name: string; prev: number | null; debit: number | null; credit: number | null }[];
}

export interface KnownIssue {
  issue: string;
  date?: string;
  likely_date?: string;
  main_ref?: string;
  main_refs?: string[];
  voucher?: number;
  ref?: string;
  note?: string;
}

export type Kind = "inv" | "misc" | "untyped";

export interface IssueNote {
  code: string;
  text: string;
}

export interface PlannedEntry {
  id: string;
  supplierId: string;
  sheet: string;
  row: number;
  kind: Kind;
  date: string;
  mainRef: string;
  refNo: string;
  voucher: string;
  details: string;
  debit: number;
  credit: number;
  reversed: boolean;
  odooEntered: boolean | null;
  issues: IssueNote[];
}

export interface PlannedSupplier {
  id: string;
  name: string;
  sheet: string;
}

export interface SupplierCheck {
  supplierId: string;
  name: string;
  count: number;
  debit: number;
  credit: number;
  headerDebit: number | null;
  headerCredit: number | null;
  ok: boolean;
}

export interface PeriodCheck {
  name: string;
  prev: number;
  debit: number;
  credit: number;
  final: number;
  excel: { prev: number | null; debit: number | null; credit: number | null; final: number | null };
  ok: boolean;
}

export interface Plan {
  suppliers: PlannedSupplier[];
  entries: PlannedEntry[];
  refs: Map<
    string,
    { ids: string[]; places: { entryId: string; supplierId: string; supplierName: string }[] }
  >;
  totals: {
    rows: number;
    inv: number;
    misc: number;
    untyped: number;
    reversed: number;
    odooEntered: number;
    flagged: number;
  };
  supplierChecks: SupplierCheck[];
  period: { from: string | null; to: string | null; lines: PeriodCheck[]; ok: boolean };
  /** مشكلات تمنع النقل (لا فشل صامت) */
  blockers: string[];
  /** حالات معروفة لم يُعثر عليها في الملف */
  unmatchedKnown: string[];
}

const MAX_HALALAS = 9_999_999_999;

/** المبلغ بالهللات (عدد صحيح) كما في Firestore. */
export function toHalalas(v: Cell): { ok: true; value: number } | { ok: false; reason: string } {
  if (v === null || v === "" || v === 0) return { ok: true, value: 0 };
  if (typeof v !== "number" || !Number.isFinite(v))
    return { ok: false, reason: `مبلغ غير رقمي (${String(v)})` };
  const h = Math.round(v * 100);
  if (h < 0) return { ok: false, reason: "مبلغ سالب" };
  if (h > MAX_HALALAS) return { ok: false, reason: "مبلغ يتجاوز الحد" };
  return { ok: true, value: h };
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** نص الخلية كما هو، مع قص المسافات الطرفية فقط. الصفر والفراغ = "". */
export function text(v: Cell): string {
  if (v === null || v === 0) return "";
  if (v instanceof Date) return isoDate(v);
  return String(v).trim();
}

export function kindOf(v: Cell): Kind {
  const t = text(v);
  return t === "فاتورة" ? "inv" : t === "قيد" ? "misc" : "untyped";
}

export function computedRefNo(kind: Kind, mainRef: string, date: string): string {
  return kind === "inv" ? `P${mainRef}` : `MISC/${date.slice(0, 4)}/${date.slice(5, 7)}/${mainRef}`;
}

/** مفتاح فهرس الرقم المرجعي في Firestore (مثل القواعد: `/` ← `|`). */
export function refKey(refNo: string): string {
  return refNo.replace(/\//g, "|");
}

const norm = (s: string) => s.replace(/\s+/g, "");

export function supplierId(index: number): string {
  return `s${String(index + 1).padStart(2, "0")}`;
}

export function entryId(sid: string, row: number): string {
  return `m-${sid}-r${String(row).padStart(4, "0")}`;
}

/** الصف فارغ إن لم يحمل تاريخاً ولا مرجعاً ولا نوعاً ولا مبلغاً ولا تفاصيل. */
export function isBlank(r: RawRow): boolean {
  return [r.date, r.mainRef, r.refNo, r.kind, r.debit, r.credit, r.details].every((v) => text(v) === "");
}

export function buildPlan(sheets: RawSheet[], summary: RawSummary, known: KnownIssue[], today: string): Plan {
  const blockers: string[] = [];
  const suppliers: PlannedSupplier[] = sheets.map((s, i) => ({
    id: supplierId(i),
    name: s.name.trim(),
    sheet: s.name,
  }));
  const entries: PlannedEntry[] = [];

  sheets.forEach((sheet, si) => {
    const sid = supplierId(si);
    for (const r of sheet.rows) {
      if (isBlank(r)) continue;
      const issues: IssueNote[] = [];
      const kind = kindOf(r.kind);
      let date = "";
      if (r.date instanceof Date && !Number.isNaN(r.date.getTime())) date = isoDate(r.date);
      else blockers.push(`«${sheet.name}» الصف ${r.row}: تاريخ غير صالح (${String(r.date)})`);
      const deb = toHalalas(r.debit);
      const cred = toHalalas(r.credit);
      if (!deb.ok) blockers.push(`«${sheet.name}» الصف ${r.row}: مدين ${deb.reason}`);
      if (!cred.ok) blockers.push(`«${sheet.name}» الصف ${r.row}: دائن ${cred.reason}`);
      const debit = deb.ok ? deb.value : 0;
      const credit = cred.ok ? cred.value : 0;
      const mainRef = text(r.mainRef);
      const refNo = text(r.refNo);
      const voucher = text(r.voucher);
      const details = text(r.details);

      if (kind === "untyped") issues.push({ code: "untyped", text: "بلا نوع مستند (فاتورة/قيد)" });
      if (debit > 0 && credit > 0) issues.push({ code: "both_sides", text: "مدين ودائن معاً في الصف نفسه" });
      if (kind !== "untyped" && debit === 0 && credit === 0)
        issues.push({ code: "no_amount", text: "حركة بلا مبلغ" });
      if (kind !== "untyped" && !mainRef) issues.push({ code: "no_ref", text: "بلا مرجع رئيسي" });
      if (
        kind !== "untyped" &&
        mainRef &&
        /^\d+$/.test(mainRef) &&
        mainRef.length !== (kind === "inv" ? 5 : 4)
      )
        issues.push({
          code: "ref_length",
          text: `طول المرجع ${mainRef.length} (المتوقع ${kind === "inv" ? 5 : 4})`,
        });
      if (kind !== "untyped" && date && refNo !== computedRefNo(kind, mainRef, date))
        issues.push({
          code: "ref_mismatch",
          text: `الرقم المرجعي «${refNo}» لا يطابق المحسوب «${computedRefNo(kind, mainRef, date)}»`,
        });
      if (voucher && !/^\d{1,12}$/.test(voucher))
        issues.push({ code: "voucher_text", text: `رقم السند ليس رقماً: «${voucher}»` });
      if (details.length > 200)
        issues.push({ code: "details_long", text: `التفاصيل ${details.length} حرفاً (الحد 200)` });
      if (date && date > today) issues.push({ code: "future_date", text: `تاريخ مستقبلي ${date}` });
      if (r.yellow && kind === "misc")
        issues.push({ code: "odoo_on_journal", text: "قيد مُعلَّم أصفر (دخلت Odoo) والحالة للفواتير فقط" });

      const reversed =
        (kind === "inv" && debit > 0 && credit === 0) || (kind === "misc" && credit > 0 && debit === 0);
      entries.push({
        id: entryId(sid, r.row),
        supplierId: sid,
        sheet: sheet.name,
        row: r.row,
        kind,
        date,
        mainRef,
        refNo,
        voucher,
        details,
        debit,
        credit,
        reversed,
        odooEntered: kind === "inv" ? r.yellow : null,
        issues,
      });
    }
  });

  // الأرقام المرجعية المكررة (فحص عام لكل الموردين)
  const byRef = new Map<string, PlannedEntry[]>();
  for (const e of entries) {
    if (e.kind === "untyped" || !e.refNo) continue;
    const list = byRef.get(e.refNo) ?? [];
    list.push(e);
    byRef.set(e.refNo, list);
  }
  const nameOf = new Map(suppliers.map((s) => [s.id, s.name]));
  const refs: Plan["refs"] = new Map();
  for (const [refNo, list] of byRef) {
    refs.set(refKey(refNo), {
      ids: list.map((e) => e.id),
      places: list.map((e) => ({
        entryId: e.id,
        supplierId: e.supplierId,
        supplierName: nameOf.get(e.supplierId) ?? "",
      })),
    });
    if (list.length > 1)
      for (const e of list)
        e.issues.push({
          code: "duplicate_ref",
          text: `الرقم المرجعي مكرر ${list.length} مرات: ${list.map((x) => `«${nameOf.get(x.supplierId)}» الصف ${x.row}`).join("، ")}`,
        });
  }

  // الحالات المعروفة (KNOWN-ISSUES.json): تُطابَق بالسند والمرجع والتاريخ، ولا تُصحَّح
  const unmatchedKnown: string[] = [];
  for (const k of known) {
    const v = k.voucher === undefined ? null : String(k.voucher);
    const hits = entries.filter(
      (e) =>
        v !== null &&
        e.voucher === v &&
        (k.main_ref === undefined || e.mainRef === k.main_ref) &&
        (k.main_refs === undefined || k.main_refs.includes(e.mainRef)) &&
        (k.ref === undefined || e.refNo === k.ref) &&
        (k.date === undefined || e.date === k.date),
    );
    if (!hits.length) {
      unmatchedKnown.push(
        `${k.issue} · السند ${k.voucher ?? "—"} · ${k.main_ref ?? k.ref ?? (k.main_refs ?? []).join("/")}`,
      );
      continue;
    }
    const msg =
      k.issue === "swapped_day_month"
        ? `تاريخ مقلوب على الأرجح: ${k.date} والأرجح ${k.likely_date}`
        : k.issue === "duplicate_of_row_291"
          ? `مكرر معروف: ${k.note ?? ""}`
          : k.issue === "same_voucher_two_refs"
            ? `سند واحد بمرجعين: ${k.note ?? ""}`
            : k.issue === "same_voucher_two_suppliers"
              ? `سند واحد عند موردين: ${k.note ?? ""}`
              : `${k.issue} ${k.note ?? ""}`;
    for (const e of hits) e.issues.push({ code: `known_${k.issue}`, text: msg.trim() });
  }

  // المطابقة لكل مورد: المجاميع مقابل رأس الورقة
  const supplierChecks: SupplierCheck[] = suppliers.map((s, i) => {
    const list = entries.filter((e) => e.supplierId === s.id);
    const debit = list.reduce((a, e) => a + e.debit, 0);
    const credit = list.reduce((a, e) => a + e.credit, 0);
    const h = sheets[i]!.header;
    const hd = h.debit === null ? null : Math.round(h.debit * 100);
    const hc = h.credit === null ? null : Math.round(h.credit * 100);
    return {
      supplierId: s.id,
      name: s.name,
      count: list.length,
      debit,
      credit,
      headerDebit: hd,
      headerCredit: hc,
      ok: hd === debit && hc === credit,
    };
  });

  // المطابقة مع ورقة «الرئيسية» لفترتها
  const from = summary.from ? isoDate(summary.from) : null;
  const to = summary.to ? isoDate(summary.to) : null;
  if (!from || !to) blockers.push("ورقة «الرئيسية»: تاريخا الفترة غير مقروءين");
  const lines: PeriodCheck[] = summary.lines.map((l) => {
    const s = suppliers.find((x) => norm(x.name) === norm(l.name));
    if (!s) blockers.push(`«الرئيسية»: المورد «${l.name}» بلا ورقة مطابقة`);
    const list = s ? entries.filter((e) => e.supplierId === s.id) : [];
    const prev = list.filter((e) => from && e.date < from).reduce((a, e) => a + e.debit - e.credit, 0);
    const inP = list.filter((e) => from && to && e.date >= from && e.date <= to);
    const debit = inP.reduce((a, e) => a + e.debit, 0);
    const credit = inP.reduce((a, e) => a + e.credit, 0);
    const h = (x: number | null) => (x === null ? null : Math.round(x * 100));
    const ex = { prev: h(l.prev), debit: h(l.debit), credit: h(l.credit), final: null as number | null };
    if (ex.prev !== null && ex.debit !== null && ex.credit !== null)
      ex.final = ex.prev + ex.debit - ex.credit;
    const final = prev + debit - credit;
    return {
      name: l.name,
      prev,
      debit,
      credit,
      final,
      excel: ex,
      ok: ex.prev === prev && ex.debit === debit && ex.credit === credit,
    };
  });

  const totals = {
    rows: entries.length,
    inv: entries.filter((e) => e.kind === "inv").length,
    misc: entries.filter((e) => e.kind === "misc").length,
    untyped: entries.filter((e) => e.kind === "untyped").length,
    reversed: entries.filter((e) => e.reversed).length,
    odooEntered: entries.filter((e) => e.odooEntered === true).length,
    flagged: entries.filter((e) => e.issues.length > 0).length,
  };
  return {
    suppliers,
    entries,
    refs,
    totals,
    supplierChecks,
    period: { from, to, lines, ok: lines.every((l) => l.ok) },
    blockers,
    unmatchedKnown,
  };
}
