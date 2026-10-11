/**
 * ترتيب الأعمدة (SPEC «الفلترة والترتيب»): كل عمود رقمي أو مبلغ أو تاريخ يُرتَّب تصاعدياً وتنازلياً.
 * الترتيب ثابت: عند التساوي يبقى الترتيب الأصلي، فلا تقفز الصفوف بين نقرة وأخرى.
 */
export type SortDir = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** نقرة على رأس عمود: العمود نفسه يعكس الاتجاه، وعمود جديد يبدأ بالاتجاه المعطى له. */
export function nextSort<K extends string>(
  cur: SortState<K>,
  key: K,
  firstDir: SortDir = "desc",
): SortState<K> {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: firstDir };
}

export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K>,
  value: (row: T, key: K) => number | string,
): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: value(row, sort.key) }))
    .sort((a, b) => {
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), "ar");
      return c !== 0 ? c * sign : a.i - b.i;
    })
    .map((x) => x.row);
}

/** قيمة aria-sort لرأس العمود. */
export function ariaSort<K extends string>(sort: SortState<K>, key: K): "ascending" | "descending" | "none" {
  if (sort.key !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}
