import { normalizeDigits } from "./digits";
import { splitIso, type IsoDate } from "./date";

export type EntryKind = "inv" | "misc";

/** طول المرجع الرقمي (DECISIONS 2026-10-10): الفاتورة 5 أرقام والقيد 4. */
export const REF_DIGITS: Record<EntryKind, number> = { inv: 5, misc: 4 };
export const REF_MAX_LENGTH = 40;

const ALLOWED = /^[A-Z0-9ء-ي/-]+$/;

/** أرقام لاتينية، قص المسافات الطرفية، وحروف لاتينية كبيرة. الأصفار البادئة تبقى. */
export function normalizeRef(raw: string): string {
  return normalizeDigits(raw)
    .trim()
    .replace(/[a-z]+/g, (x) => x.toUpperCase());
}

export function validateRef(ref: string, kind: EntryKind): string | null {
  if (ref === "") return "أدخل المرجع الرئيسي.";
  if (ref.length > REF_MAX_LENGTH) return `المرجع حتى ${REF_MAX_LENGTH} حرفاً.`;
  if (!ALLOWED.test(ref)) return "المرجع حروف وأرقام و / و - فقط، بلا مسافات.";
  if (/^\d+$/.test(ref)) {
    const need = REF_DIGITS[kind];
    const label = kind === "inv" ? "الفاتورة" : "القيد";
    if (ref.length !== need) return `مرجع ${label} ${need} أرقام بالضبط، وكتبت ${ref.length}.`;
  }
  return null; // المراجع ببادئة (OUT/00013) تُقبل كما تُكتب
}

/** التالي في التسلسل: يزيد آخر جزء رقمي بنفس العرض. null إن لم يوجد جزء رقمي. */
export function nextInSequence(ref: string): string | null {
  const m = ref.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return null;
  const [, head = "", digits = "", tail = ""] = m;
  const next = String(Number(digits) + 1).padStart(digits.length, "0");
  return head + next + tail;
}

/** الرقم المرجعي: فاتورة ← P + المرجع، قيد ← MISC/السنة/الشهر برقمين/المرجع. */
export function buildRefNo(kind: EntryKind, ref: string, date: IsoDate): string {
  if (kind === "inv") return "P" + ref;
  const { y, m } = splitIso(date);
  return `MISC/${y}/${String(m).padStart(2, "0")}/${ref}`;
}

/** معرّف مستند فهرس الرقم المرجعي في Firestore («/» غير مسموحة في المعرّف). يطابق firestore.rules. */
export function refIndexKey(refNo: string): string {
  return refNo.replace(/\//g, "|");
}
