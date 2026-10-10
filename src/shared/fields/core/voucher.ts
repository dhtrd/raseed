import { normalizeDigits } from "./digits";

export const VOUCHER_MAX_DIGITS = 12;

export function normalizeVoucher(raw: string): string {
  return normalizeDigits(raw).replace(/[\s\u00a0]/g, "");
}

/** اختياري؛ أرقام فقط تُحفظ نصاً بأصفارها. */
export function validateVoucher(v: string): string | null {
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return "رقم السند أرقام فقط، بلا حروف ولا كسور.";
  if (v.length > VOUCHER_MAX_DIGITS) return `رقم السند حتى ${VOUCHER_MAX_DIGITS} رقماً.`;
  return null;
}
