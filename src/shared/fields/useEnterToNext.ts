import { useEffect, type RefObject } from "react";

const FIELDS =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), [role="checkbox"]:not([aria-disabled="true"])';

/**
 * Enter ينقل للحقل التالي بترتيب القراءة (FIELDS «قواعد مشتركة»).
 * في الحقول متعددة الأسطر Shift+Enter سطر جديد. القوائم المفتوحة تعالج Enter بنفسها.
 */
export function useEnterToNext(container: RefObject<HTMLElement | null>, onLast?: () => void) {
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement;
      if (!el.matches("input, textarea")) return;
      if (el.matches("textarea") && e.shiftKey) return;
      if (el.getAttribute("aria-expanded") === "true") return;
      e.preventDefault();
      const all = Array.from(root.querySelectorAll<HTMLElement>(FIELDS)).filter(
        (x) => !x.closest("[inert]") && x.offsetParent !== null,
      );
      const i = all.indexOf(el);
      (el as HTMLInputElement).blur?.();
      const next = all[i + 1];
      if (next) next.focus();
      else onLast?.();
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [container, onLast]);
}
