/**
 * التحديد بـ Shift (DECISIONS 2026-10-11): النقر مع Shift يطبّق حالة العنصر الجديدة على كل ما بين آخر عنصر
 * نُقر (المرساة) والعنصر الحالي، بترتيب العرض. إن لم تكن المرساة ظاهرة فالعنصر وحده.
 */
export function shiftRange(order: readonly string[], anchor: string | null, id: string): string[] {
  const to = order.indexOf(id);
  const from = anchor === null ? -1 : order.indexOf(anchor);
  if (to < 0) return [];
  if (from < 0) return [id];
  const [a, b] = from <= to ? [from, to] : [to, from];
  return order.slice(a, b + 1);
}

/** يطبّق التحديد على مجموعة: `on` حالة العنصر المنقور بعد النقر */
export function applyRange(current: ReadonlySet<string>, ids: readonly string[], on: boolean): Set<string> {
  const next = new Set(current);
  for (const x of ids) {
    if (on) next.add(x);
    else next.delete(x);
  }
  return next;
}
