import { normalizeDigits } from "../../../shared/fields/core/digits";

/** مدة الخمول التي يضبطها المالك (DECISIONS 2026-10-10). الحدود نفسها في firestore.rules. */
export const IDLE_DEFAULT_MINUTES = 30;
export const IDLE_MIN_MINUTES = 5;
export const IDLE_MAX_MINUTES = 120;
export const IDLE_WARN_MS = 60_000;

export function parseIdleMinutes(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const v = normalizeDigits(raw).trim();
  const n = /^\d{1,3}$/.test(v) ? Number(v) : NaN;
  if (!(n >= IDLE_MIN_MINUTES && n <= IDLE_MAX_MINUTES)) {
    return { ok: false, error: `اكتب عدداً من ${IDLE_MIN_MINUTES} إلى ${IDLE_MAX_MINUTES} دقيقة.` };
  }
  return { ok: true, value: n };
}

/** قيمة مخزّنة غير صالحة أو مفقودة تعود إلى الافتراضي بدل تعطيل الجلسة. */
export function effectiveIdleMinutes(stored: unknown): number {
  return typeof stored === "number" &&
    Number.isInteger(stored) &&
    stored >= IDLE_MIN_MINUTES &&
    stored <= IDLE_MAX_MINUTES
    ? stored
    : IDLE_DEFAULT_MINUTES;
}
