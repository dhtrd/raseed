import { normalizeDigits } from "./digits";

/** التواريخ داخل النظام نصوص ISO «YYYY-MM-DD» بلا منطقة زمنية؛ «اليوم» يُحسب بتوقيت الرياض. */
export type IsoDate = string;

export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
export const MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

export const DATE_FORMS_HINT = "اكتب: 15 أو 1508 أو 15/8 أو 150826 أو +1";

export function todayInRiyadh(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function toIso(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function splitIso(iso: IsoDate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 0, m: m ?? 0, d: d ?? 0 };
}

/** يعيد ISO إن كان اليوم موجوداً فعلاً في التقويم، وإلا null. */
export function makeDate(y: number, m: number, d: number): IsoDate | null {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2200) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
    ? toIso(y, m, d)
    : null;
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  const { y, m, d } = splitIso(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function addMonthsClamped(iso: IsoDate, n: number): IsoDate {
  const { y, m, d } = splitIso(iso);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const ny = first.getUTCFullYear();
  const nm = first.getUTCMonth() + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return toIso(ny, nm, Math.min(d, last));
}

export function weekday(iso: IsoDate): number {
  const { y, m, d } = splitIso(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** «15/08/2026» */
export function formatDate(iso: IsoDate): string {
  const { y, m, d } = splitIso(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** «السبت 15/08/2026» */
export function formatDateWithDay(iso: IsoDate): string {
  return `${DAY_NAMES[weekday(iso)]} ${formatDate(iso)}`;
}

export type ParseDateOptions = {
  /** اليوم بتوقيت الرياض */
  today: IsoDate;
  /** أساس +n/−n: الصف السابق أو آخر حركة محفوظة للمورد */
  base?: IsoDate;
  /** صيغة ISO (2026-08-15) تُقبل عند اللصق فقط */
  pasted?: boolean;
};

export type ParseDateResult = { ok: true; date: IsoDate } | { ok: false; error: string };

/**
 * يقرأ التاريخ يوماً ثم شهراً دائماً (SPEC «إدخال التاريخ كأرقام» + DECISIONS 2026-10-10).
 */
export function parseDateInput(raw: string, opts: ParseDateOptions): ParseDateResult {
  const s = normalizeDigits(raw).trim().replace(/\s+/g, "");
  const { y: ty, m: tm } = splitIso(opts.today);
  if (s === "") return { ok: true, date: opts.today };

  const rel = s.match(/^([+\-−])(\d{1,3})$/);
  if (rel) {
    const n = Number(rel[2]) * (rel[1] === "+" ? 1 : -1);
    return { ok: true, date: addDays(opts.base ?? opts.today, n) };
  }

  if (opts.pasted) {
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return check(Number(iso[3]), Number(iso[2]), Number(iso[1]));
  }

  if (/[/.-]/.test(s)) {
    const parts = s.split(/[/.-]/);
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) {
      return { ok: false, error: `صيغة غير مفهومة. ${DATE_FORMS_HINT}` };
    }
    const [dd = "", mm = "", yy] = parts;
    let year = ty;
    if (yy !== undefined) {
      if (yy.length === 2) year = 2000 + Number(yy);
      else if (yy.length === 4) year = Number(yy);
      else return { ok: false, error: `السنة برقمين أو أربعة. ${DATE_FORMS_HINT}` };
    }
    return check(Number(dd), Number(mm), year);
  }

  if (!/^\d+$/.test(s)) return { ok: false, error: `التاريخ أرقام وفواصل فقط. ${DATE_FORMS_HINT}` };
  switch (s.length) {
    case 1:
    case 2:
      return check(Number(s), tm, ty);
    case 4:
      return check(Number(s.slice(0, 2)), Number(s.slice(2)), ty);
    case 6:
      return check(Number(s.slice(0, 2)), Number(s.slice(2, 4)), 2000 + Number(s.slice(4)));
    case 8:
      return check(Number(s.slice(0, 2)), Number(s.slice(2, 4)), Number(s.slice(4)));
    default:
      return { ok: false, error: `عدد الأرقام (${s.length}) لا يُفهم بلا لبس. ${DATE_FORMS_HINT}` };
  }

  function check(d: number, m: number, y: number): ParseDateResult {
    if (m < 1 || m > 12) return { ok: false, error: `لا يوجد شهر رقم ${m}. اليوم أولاً ثم الشهر.` };
    const iso = makeDate(y, m, d);
    if (!iso) return { ok: false, error: `لا يوجد يوم ${d} في ${MONTH_NAMES[m - 1]} ${y}.` };
    return { ok: true, date: iso };
  }
}

export type DateCheck = { error?: string; warning?: string };

/** الفترة المقفلة تمنع، والمستقبل أو الأقدم من 12 شهراً ينبّه فقط. */
export function checkDate(iso: IsoDate, opts: { today: IsoDate; lockedThrough?: IsoDate | null }): DateCheck {
  if (opts.lockedThrough && iso <= opts.lockedThrough) {
    return {
      error: `الفترة مقفلة حتى ${formatDate(opts.lockedThrough)}. اختر تاريخاً بعده أو اطلب فك القفل من المالك.`,
    };
  }
  if (iso > opts.today) return { warning: "تاريخ في المستقبل. تأكد منه قبل الحفظ." };
  if (iso < addMonthsClamped(opts.today, -12)) return { warning: "أقدم من 12 شهراً. تأكد منه قبل الحفظ." };
  return {};
}
