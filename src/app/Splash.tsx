import { useEffect, useState } from "react";
import { Mark } from "../shared/ui/Logo";
import s from "./Splash.module.css";

const KEY = "raseed.splash";

/** يُعرض مرة في الجلسة، ولا يُعرض لمن فعّل «تقليل الحركة» */
function shouldShow(): boolean {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return window.sessionStorage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

/**
 * فتح التطبيق «أ. التوازن» (DECISIONS 2026-10-11): الشريطان يدخلان من الجهتين ويستقران، ثم الاسم، ثم تتلاشى
 * الشاشة (نحو 1.3 ث). لا تحجب النقر (pointer-events: none) ولا تُقرأ (aria-hidden): التطبيق يعمل تحتها.
 */
export function Splash() {
  const [show, setShow] = useState(shouldShow);
  useEffect(() => {
    if (!show) return;
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      // تخزين الجلسة غير متاح: تُعرض مرة لكل تحميل، بلا ضرر
    }
    const t = window.setTimeout(() => setShow(false), 1700);
    return () => window.clearTimeout(t);
  }, [show]);
  if (!show) return null;
  return (
    <div className={s.splash} aria-hidden="true">
      <div className={s.row}>
        <Mark className={s.mark} />
        <span className={s.word}>رصيد</span>
      </div>
    </div>
  );
}
