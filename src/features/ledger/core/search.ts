/**
 * البحث العام (الخيار أ المعتمد في proposals/2026-10-11-global-search.html، DECISIONS 2026-10-11):
 * تطبيع العربية، والمطابقة بكل الكلمات، وإبراز المطابق. منطق نقي بلا واجهة ولا Firestore.
 */
import { formatDate } from "../../../shared/fields/core/date";
import { formatMoney, kindLabel, type LedgerEntry } from "./ledger";

export interface SearchEntry extends LedgerEntry {
  deleted: boolean;
}

export interface SupplierLite {
  id: string;
  name: string;
}

/**
 * تطبيع حرف بحرف مع خريطة إلى موضعه في الأصل (لإبراز المطابقة على النص الأصلي):
 * أ/إ/آ/ٱ ← ا، ة ← ه، ى ← ي، الأرقام العربية والفارسية ← لاتينية، حذف التشكيل والتطويل والأقواس والفواصل، وأحرف صغيرة.
 */
export function normalizeWithMap(s: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] ?? "";
    if (/[ً-ٰٟـ()،,]/.test(ch)) continue;
    let out = ch;
    if (/[أإآٱ]/.test(ch)) out = "ا";
    else if (ch === "ة") out = "ه";
    else if (ch === "ى") out = "ي";
    else if (/[٠-٩]/.test(ch)) out = String(ch.charCodeAt(0) - 0x0660);
    else if (/[۰-۹]/.test(ch)) out = String(ch.charCodeAt(0) - 0x06f0);
    else out = ch.toLowerCase();
    text += out;
    map.push(i);
  }
  return { text, map };
}

export const normalize = (s: string) => normalizeWithMap(s).text;

export function termsOf(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** كل ما يُبحث فيه للحركة: المورد، الأرقام، البيان أو الملاحظة، النوع، التاريخ، والمبلغ بصيغه */
export function haystackOf(e: SearchEntry, supplierName: string): string {
  const amount = e.credit || e.debit;
  const plain = (amount / 100).toFixed(2);
  return normalize(
    [
      supplierName,
      e.refNo,
      e.mainRef,
      e.voucher,
      e.details,
      e.note,
      kindLabel(e).label,
      kindLabel(e).tag ?? "",
      e.date ? formatDate(e.date) : "",
      amount ? `${plain} ${plain.replace(/\.00$/, "")} ${formatMoney(amount)}` : "",
    ].join(" "),
  );
}

export interface SearchResult {
  suppliers: SupplierLite[];
  entries: SearchEntry[];
  /** عدد الحركات المطابقة قبل القص */
  total: number;
}

export const MAX_ENTRY_RESULTS = 50;
export const MAX_SUPPLIER_RESULTS = 6;

/** كل كلمات البحث يجب أن تطابق؛ الحركات الأحدث أولاً، والمحذوفة بعد غيرها. */
export function search(
  query: string,
  entries: SearchEntry[],
  suppliers: SupplierLite[],
  hay: (e: SearchEntry) => string,
): SearchResult {
  const ts = termsOf(query);
  if (!ts.length) return { suppliers: [], entries: [], total: 0 };
  const sups = suppliers.filter((x) => ts.every((t) => normalize(x.name).includes(t)));
  const hits = entries.filter((e) => {
    const h = hay(e);
    return ts.every((t) => h.includes(t));
  });
  hits.sort(
    (a, b) =>
      Number(a.deleted) - Number(b.deleted) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
  return {
    suppliers: sups.slice(0, MAX_SUPPLIER_RESULTS),
    entries: hits.slice(0, MAX_ENTRY_RESULTS),
    total: hits.length,
  };
}

export interface Segment {
  text: string;
  hit: boolean;
}

/** يقسم النص الأصلي إلى أجزاء مطابقة وغير مطابقة لإبرازها (كلمات من حرفين فأكثر). */
export function highlight(text: string, query: string): Segment[] {
  if (!text) return [];
  const { text: n, map } = normalizeWithMap(text);
  const marks = new Array<boolean>(text.length).fill(false);
  for (const t of termsOf(query).filter((x) => x.length > 1)) {
    let i = n.indexOf(t);
    while (i >= 0) {
      const from = map[i] ?? 0;
      const to = map[i + t.length - 1] ?? from;
      for (let k = from; k <= to; k++) marks[k] = true;
      i = n.indexOf(t, i + 1);
    }
  }
  const out: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = marks[i] ?? false;
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else out.push({ text: text[i] ?? "", hit });
  }
  return out;
}
