import { useEffect, type RefObject } from "react";

/**
 * React لا يمرر beforeinput الأصلي بثبات بين المتصفحات، فنستمع له مباشرة.
 * يُستخدم لمنع الحرف قبل ظهوره بدل حذفه بعد ظهوره.
 */
export function useNativeBeforeInput(
  ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  handler: (e: InputEvent, el: HTMLInputElement | HTMLTextAreaElement) => void,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fn = (e: Event) => handler(e as InputEvent, el);
    el.addEventListener("beforeinput", fn);
    return () => el.removeEventListener("beforeinput", fn);
  }, [ref, handler]);
}

/** يُدرج نصاً عند المؤشر ويطلق input حتى يلتقطه onChange في React. */
export function insertAtCaret(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  el.setRangeText(text, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, "end");
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
