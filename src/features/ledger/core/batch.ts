/**
 * الإدخال السريع (لسان 4 المعتمد في proposals/2026-10-10-fields-excel-components.html):
 * دفعة لمورد واحد تملؤها ثلاث طرق على جدول واحد (المتتابع، التعبئة التسلسلية، اللصق من الإكسل)،
 * وكل صف يمر بالتحققات نفسها قبل الحفظ. منطق نقي بلا واجهة ولا Firestore.
 */
import { formatHalalas, parseAmount, cleanPastedAmount } from "../../../shared/fields/core/amount";
import { checkDate, parseDateInput, type IsoDate } from "../../../shared/fields/core/date";
import { normalizeDigits } from "../../../shared/fields/core/digits";
import { buildRefNo, nextInSequence, normalizeRef, validateRef } from "../../../shared/fields/core/ref";
import { LIMITS } from "../../../shared/fields/core/text";
import { normalizeVoucher, validateVoucher } from "../../../shared/fields/core/voucher";

export type BatchKind = "inv" | "misc";
export type BatchField = "date" | "ref" | "voucher" | "details" | "amount" | "dup";
/** ترتيب التنقل بـ Enter داخل الصف (FIELDS «قواعد مشتركة») */
export const FIELD_ORDER: Exclude<BatchField, "dup">[] = ["date", "ref", "voucher", "details", "amount"];

export interface BatchRow {
  key: string;
  dateRaw: string;
  type: BatchKind;
  ref: string;
  /** المرجع مقترح (يتحدث مع التسلسل) ما دام المستخدم لم يكتبه بنفسه */
  refAuto: boolean;
  voucher: string;
  details: string;
  amountRaw: string;
  reversed: boolean;
  dupConfirmed: boolean;
  dupReason: string;
  /** صف من اللصق: يقبل التاريخ بصيغة ISO (FIELDS: «2026-08-15 عند اللصق فقط») */
  pasted: boolean;
  /** أخطاء اللصق نفسها (عمود ناقص، نوع غير معروف، مبلغ لا يُقرأ) */
  pasteError: string | null;
}

export interface RowCheck {
  date: IsoDate | null;
  refNo: string;
  amount: number | null;
  errors: Partial<Record<BatchField, string>>;
  warning: string | null;
  /** أسماء الموردين المسجّل عندهم الرقم مسبقاً */
  dupOf: string[] | null;
}

let seq = 0;
const newKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export function blankRow(prev?: Pick<BatchRow, "dateRaw" | "type">): BatchRow {
  return {
    key: newKey(),
    dateRaw: prev?.dateRaw ?? "",
    type: prev?.type ?? "inv",
    ref: "",
    refAuto: true,
    voucher: "",
    details: "",
    amountRaw: "",
    reversed: false,
    dupConfirmed: false,
    dupReason: "",
    pasted: false,
    pasteError: null,
  };
}

/** صف لم يُكتب فيه شيء (المرجع المقترح لا يُعدّ). يُتجاهل عند الحفظ. */
export function isBlank(r: BatchRow): boolean {
  return (r.refAuto || !r.ref) && !r.amountRaw.trim() && !r.voucher.trim() && !r.details.trim() && !r.pasted;
}

/**
 * يملأ المراجع المقترحة: آخر مرجع من النوع نفسه في الدفعة + 1، وإلا آخر مرجع محفوظ للمورد + 1.
 * إن عدّل المستخدم رقماً يكمل ما بعده من رقمه (SPEC «الإدخال المتتابع»).
 */
export function suggestRefs(rows: BatchRow[], lastSaved: Record<BatchKind, string | null>): BatchRow[] {
  const last: Record<BatchKind, string | null> = { ...lastSaved };
  return rows.map((r) => {
    let ref = r.ref;
    if (r.refAuto) ref = (last[r.type] && nextInSequence(last[r.type] ?? "")) || "";
    if (ref && nextInSequence(ref)) last[r.type] = ref;
    return ref === r.ref ? r : { ...r, ref };
  });
}

export interface CheckContext {
  today: IsoDate;
  lockedThrough: IsoDate | null;
  /** تاريخ آخر حركة محفوظة للمورد: أساس +n في الصف الأول */
  lastDate: IsoDate | null;
  /** أماكن الأرقام المرجعية المسجلة (من فهرس refs)؛ undefined = لم يُفحص بعد */
  saved: Map<string, string[]>;
}

/** يفحص كل الصفوف بالترتيب: +n يُحسب من تاريخ الصف السابق، والتكرار داخل الدفعة يُكشف. */
export function checkRows(rows: BatchRow[], ctx: CheckContext): RowCheck[] {
  const out: RowCheck[] = [];
  const seen = new Map<string, number>();
  let base: IsoDate | null = ctx.lastDate;
  rows.forEach((r, i) => {
    const errors: RowCheck["errors"] = {};
    let warning: string | null = null;
    let date: IsoDate | null = null;
    const pd = parseDateInput(r.dateRaw, { today: ctx.today, base: base ?? undefined, pasted: r.pasted });
    if (!pd.ok) errors.date = pd.error;
    else {
      date = pd.date;
      const c = checkDate(date, { today: ctx.today, lockedThrough: ctx.lockedThrough });
      if (c.error) errors.date = c.error;
      else if (c.warning) warning = c.warning;
      base = date;
    }
    const ref = normalizeRef(r.ref);
    const refErr = validateRef(ref, r.type);
    if (refErr) errors.ref = refErr;
    const vErr = r.voucher ? validateVoucher(normalizeVoucher(r.voucher)) : null;
    if (vErr) errors.voucher = vErr;
    if (r.details.trim().length > LIMITS.details) errors.details = `التفاصيل حتى ${LIMITS.details} حرف.`;
    let amount: number | null = null;
    const a = parseAmount(r.amountRaw);
    if (a.ok === "empty") errors.amount = "أدخل المبلغ.";
    else if (a.ok === false) errors.amount = a.error;
    else amount = a.halalas;
    if (r.pasteError) errors.amount = errors.amount ?? r.pasteError;
    const refNo = !refErr && date ? buildRefNo(r.type, ref, date) : "";
    let dupOf: string[] | null = null;
    if (refNo) {
      const first = seen.get(refNo);
      if (first !== undefined)
        errors.ref = `الرقم ${refNo} مكرر في الصف ${first + 1} من هذه الدفعة. احفظ أحدهما أولاً، ثم أضف الآخر بتأكيد التكرار.`;
      else seen.set(refNo, i);
      const places = ctx.saved.get(refNo);
      if (places && places.length) {
        dupOf = places;
        if (!r.dupConfirmed)
          errors.dup = "الرقم مسجّل مسبقاً: أكّد أنها حركة مختلفة واكتب السبب، أو عدّل المرجع.";
        else if (!r.dupReason.trim()) errors.dup = "اكتب سبب تسجيل رقم مكرر.";
        else if (r.dupReason.trim().length > 300) errors.dup = "السبب حتى 300 حرف.";
      }
    }
    out.push({ date, refNo, amount, errors, warning, dupOf });
  });
  return out;
}

/** التعبئة التسلسلية: الصفوف المحددة بالترتيب تأخذ start، start+1… بنفس العرض. */
export function fillSequence(
  rows: BatchRow[],
  indices: number[],
  start: string,
): { rows: BatchRow[]; error: string | null; last: string | null } {
  const s = normalizeDigits(start).trim();
  if (!indices.length) return { rows, error: "حدّد صفاً واحداً على الأقل من عمود التحديد.", last: null };
  if (!/^\d+$/.test(s)) return { rows, error: "رقم البداية أرقام فقط، مثل 12300.", last: null };
  const sorted = [...indices].sort((a, b) => a - b);
  const next = rows.map((r) => ({ ...r }));
  let cur = s;
  for (const i of sorted) {
    const row = next[i];
    if (!row) continue;
    row.ref = cur;
    row.refAuto = false;
    cur = nextInSequence(cur) ?? cur;
  }
  return { rows: next, error: null, last: next[sorted[sorted.length - 1] ?? 0]?.ref ?? null };
}

const TYPE_WORDS: Record<string, BatchKind> = { فاتورة: "inv", ف: "inv", قيد: "misc", ق: "misc" };

/**
 * اللصق من الإكسل (DECISIONS 2026-10-10): 5 أعمدة بالترتيب التاريخ، المرجع، المبلغ، البيان، النوع
 * (فاتورة/قيد/ف/ق). عمود ناقص أو قيمة غير معروفة = خطأ في الصف، ولا يُرفض الصف بصمت.
 */
export function parsePasted(text: string): BatchRow[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const c = line.split("\t").map((x) => x.trim());
      const r = blankRow();
      r.pasted = true;
      r.refAuto = false;
      r.dateRaw = c[0] ?? "";
      r.ref = c[1] ?? "";
      r.details = (c[3] ?? "").slice(0, LIMITS.details);
      const typeWord = (c[4] ?? "").replace(/\s+/g, "");
      const errs: string[] = [];
      if (c.length < 5)
        errs.push(`الصف فيه ${c.length} أعمدة، والمتوقع 5: التاريخ، المرجع، المبلغ، البيان، النوع.`);
      const t = TYPE_WORDS[typeWord];
      if (t) r.type = t;
      else if (c.length >= 5) errs.push(`النوع «${c[4]}» غير معروف: اكتب فاتورة أو قيد (أو ف / ق).`);
      const a = cleanPastedAmount(c[2] ?? "");
      if (a.ok) {
        const parsed = parseAmount(a.value);
        r.amountRaw = parsed.ok === true ? formatHalalas(parsed.halalas) : a.value;
      } else {
        r.amountRaw = c[2] ?? "";
        errs.push(a.error);
      }
      r.pasteError = errs[0] ?? null;
      return r;
    });
}

/** ملخص الدفعة لشريط الحالة. */
export function batchSummary(rows: BatchRow[], checks: RowCheck[]) {
  let ready = 0;
  let bad = 0;
  let dups = 0;
  rows.forEach((r, i) => {
    if (isBlank(r)) return;
    const c = checks[i];
    if (!c) return;
    const keys = Object.keys(c.errors);
    if (keys.length === 1 && keys[0] === "dup") dups++;
    else if (keys.length) bad++;
    else ready++;
  });
  return { ready, bad, dups, total: ready + bad + dups };
}

/** المبلغ أثناء الكتابة: أرقام وفاصلة عشرية واحدة ومنزلتان، وفواصل آلاف (FIELDS «المبلغ»). */
export function cleanTypedAmount(v: string): string {
  const raw = normalizeDigits(v).replace(/[،٫]/g, ".");
  const s = raw.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const [int = "", ...rest] = s.split(".");
  const dec = rest.length ? "." + rest.join("").slice(0, 2) : "";
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + dec;
}
