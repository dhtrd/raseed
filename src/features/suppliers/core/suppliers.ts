/**
 * إدارة الموردين (الخيار ب المعتمد في proposals/2026-10-11-suppliers.html، DECISIONS 2026-10-11):
 * التحقق من الاسم. يُمنع المطابق بعد توحيد الهمزات والمسافات (قرار المستخدم)، ويُحذَّر من المتشابه.
 * منطق نقي بلا واجهة ولا Firestore؛ القواعد تفرض الطول والشكل.
 */
export const SUPPLIER_NAME_MAX = 100;

export interface NamedSupplier {
  id: string;
  name: string;
  archived: boolean;
}

/** توحيد للمقارنة: أ/إ/آ/ٱ ← ا، ة ← ه، ى ← ي، حذف التشكيل والتطويل، ومسافة واحدة، وأحرف صغيرة. */
export function normalizeName(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** مسافة التحرير بين نصين (للأسماء القصيرة فقط) */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] ?? 0;
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
}

export interface NameCheck {
  error: string | null;
  /** أسماء متشابهة (تحذير لا يمنع) */
  similar: string[];
}

/**
 * `exceptId`: المورد نفسه عند تعديل اسمه. المتشابه: يختلف بحرف أو حرفين، أو أحدهما يحوي الآخر
 * (من 4 أحرف فأكثر)، دون فراغات.
 */
export function checkSupplierName(
  name: string,
  all: NamedSupplier[],
  exceptId: string | null = null,
): NameCheck {
  const t = name.trim();
  if (!t) return { error: "اكتب اسم المورد.", similar: [] };
  if (t.length > SUPPLIER_NAME_MAX) return { error: `الاسم أطول من ${SUPPLIER_NAME_MAX} حرف.`, similar: [] };
  const n = normalizeName(t);
  const others = all.filter((x) => x.id !== exceptId);
  const same = others.find((x) => normalizeName(x.name) === n);
  if (same)
    return {
      error: `يوجد مورد بهذا الاسم: «${same.name}»${same.archived ? " (مؤرشف؛ أعد تنشيطه من كشفه بدل إضافة جديد)" : ""}.`,
      similar: [],
    };
  const bare = n.replace(/ /g, "");
  const similar = others
    .filter((x) => {
      const o = normalizeName(x.name).replace(/ /g, "");
      if (o === bare) return true;
      if (Math.min(o.length, bare.length) >= 4 && (o.includes(bare) || bare.includes(o))) return true;
      return Math.abs(o.length - bare.length) <= 2 && distance(o, bare) <= 2;
    })
    .map((x) => x.name);
  return { error: null, similar };
}
