/**
 * قفل الفترات (الخيار ب المعتمد في proposals/2026-10-11-period-lock.html، DECISIONS 2026-10-11):
 * خط الأشهر، وتخطيط التغيير (قفل / فتح مؤقت / إعادة القفل) والتحقق منه. منطق نقي بلا واجهة ولا Firestore.
 * القواعد تفرض الشيء نفسه من الخادم: المالك وحده، سبب إلزامي، لا تاريخ بعد اليوم، وtempFrom بعد التاريخ الجديد.
 */
import { formatDate, type IsoDate } from "../../../shared/fields/core/date";

export const LOCK_REASON_MAX = 300;

export interface LockState {
  lockedThrough: IsoDate | null;
  /** أثناء الفتح المؤقت: التاريخ الذي يُعاد القفل إليه */
  tempFrom: IsoDate | null;
}

export type MonthState = "locked" | "opened" | "open" | "future";

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
];

const pad = (n: number) => String(n).padStart(2, "0");
export const monthEnd = (y: number, m: number): IsoDate =>
  `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
/** اليوم السابق لبداية الشهر: الفتح المؤقت «من بدايته» يقفل حتى هذا اليوم */
export const beforeMonth = (y: number, m: number): IsoDate =>
  m === 1 ? `${y - 1}-12-31` : monthEnd(y, m - 1);

export interface MonthCell {
  month: number;
  name: string;
  end: IsoDate;
  state: MonthState;
}

export function monthsOf(year: number, s: LockState, today: IsoDate): MonthCell[] {
  return MONTH_NAMES.map((name, i) => {
    const end = monthEnd(year, i + 1);
    const locked = Boolean(s.lockedThrough && end <= s.lockedThrough);
    const opened = Boolean(s.tempFrom && !locked && end <= s.tempFrom);
    const state: MonthState = locked ? "locked" : opened ? "opened" : end > today ? "future" : "open";
    return { month: i + 1, name, end, state };
  });
}

export type LockAction = "lockSet" | "lockTempOpen" | "lockRestore";

export interface LockPlan {
  action: LockAction;
  next: LockState;
}

export type LockErrors = Partial<Record<"date" | "reason" | "form", string>>;

/**
 * يتحقق من التغيير ويُرجع الحالة الجديدة:
 * - «قفل» (lockSet): تاريخ جديد ≤ اليوم ويختلف عن الحالي؛ يُنهي أي فتح مؤقت.
 * - «فتح مؤقت» (lockTempOpen): إلى تاريخ أقدم من الحالي، ويحفظ الحالي في tempFrom.
 * - «إعادة القفل» (lockRestore): إلى tempFrom.
 */
export function planLock(
  kind: LockAction,
  cur: LockState,
  date: IsoDate | null,
  reason: string,
  today: IsoDate,
): { plan: LockPlan | null; errors: LockErrors } {
  const e: LockErrors = {};
  const r = reason.trim();
  if (!r) e.reason = "اكتب السبب؛ يُحفظ في سجل التدقيق.";
  else if (r.length > LOCK_REASON_MAX) e.reason = `السبب حتى ${LOCK_REASON_MAX} حرف.`;

  let next: LockState | null = null;
  if (kind === "lockRestore") {
    if (!cur.tempFrom) e.form = "لا فتح مؤقت لإعادته.";
    else next = { lockedThrough: cur.tempFrom, tempFrom: null };
  } else if (!date) e.date = "اكتب التاريخ يوماً ثم شهراً.";
  else if (date > today) e.date = `لا يتجاوز تاريخ الإقفال اليوم (${formatDate(today)}).`;
  else if (kind === "lockSet") {
    if (date === cur.lockedThrough && !cur.tempFrom) e.date = "هذا هو تاريخ الإقفال الحالي.";
    else next = { lockedThrough: date, tempFrom: null };
  } else {
    if (cur.tempFrom) e.form = "القفل مفتوح مؤقتاً الآن؛ أعده أولاً.";
    else if (!cur.lockedThrough || date >= cur.lockedThrough)
      e.date = "الفتح المؤقت يكون إلى تاريخ أقدم من تاريخ الإقفال الحالي.";
    else next = { lockedThrough: date, tempFrom: cur.lockedThrough };
  }
  return { plan: next && !Object.keys(e).length ? { action: kind, next } : null, errors: e };
}

/** نص قصير لسجل الإقفال من سجل التدقيق */
export function describeLockChange(action: string, after: Partial<LockState> | undefined): string {
  const to = after?.lockedThrough ? formatDate(after.lockedThrough) : "—";
  if (action === "lockTempOpen") return `فتح مؤقت إلى ${to}`;
  if (action === "lockRestore") return `إعادة القفل حتى ${to}`;
  return `قفل حتى ${to}`;
}
