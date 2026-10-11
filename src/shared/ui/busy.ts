import { useEffect, useSyncExternalStore } from "react";

/**
 * «مؤشر عمل» الشعار (الخيار ٣هـ، DECISIONS 2026-10-11): عدّاد عام لما يُحفظ أو يُحمَّل الآن.
 * يرفعه كل زر «مشغول» وكل حالة تحميل، فيتحرك الشعار ما دام شيء منها قائماً.
 */
let count = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function hold(): () => void {
  count++;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count--;
    emit();
  };
}

/** يرفع العدّاد ما دام `active` صحيحاً */
export function useHoldBusy(active: boolean): void {
  useEffect(() => (active ? hold() : undefined), [active]);
}

export function useAnyBusy(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => count > 0,
  );
}
