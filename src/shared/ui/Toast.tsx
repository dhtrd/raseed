import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import s from "./Toast.module.css";

export type ToastTone = "ok" | "err" | "info";

export interface ToastInput {
  tone: ToastTone;
  text: string;
  /** إجراء سريع (مثل «فتح الكشف») */
  action?: { label: string; onAction: () => void };
}

interface Item extends ToastInput {
  id: number;
}

/** مدة بقاء النجاح والمعلومة (قرار المستخدم 2026-10-11)؛ الخطأ يبقى حتى يُغلق */
export const TOAST_MS = 5000;
const MAX = 3;

const Ctx = createContext<(t: ToastInput) => void>(() => {
  console.error("useToast خارج ToastProvider: لن يظهر الإشعار");
});

/** إطلاق إشعار عائم من أي شاشة داخل الواجهة */
export const useToast = () => useContext(Ctx);

/**
 * الإشعارات العائمة (الخيار ج المعتمد في proposals/2026-10-11-notifications.html): أسفل الشاشة
 * (فوق التنقل السفلي على الجوال)، ثلاثة على الأكثر، والنجاح يختفي بعد 5 ثوانٍ بشريط يتناقص.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((cur) => [...cur.slice(-(MAX - 1)), { ...t, id }]);
      if (t.tone !== "err")
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), TOAST_MS),
        );
    },
    [dismiss],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <Ctx.Provider value={notify}>
      {children}
      <div className={s.region} role="region" aria-label="الإشعارات">
        {items.map((t) => (
          <div key={t.id} className={`${s.toast} ${s[t.tone]}`} role={t.tone === "err" ? "alert" : "status"}>
            <span className={s.ic} aria-hidden="true">
              {t.tone === "ok" ? "✓" : t.tone === "err" ? "!" : "i"}
            </span>
            <p className={s.text}>{t.text}</p>
            <button type="button" className={s.x} aria-label="إغلاق الإشعار" onClick={() => dismiss(t.id)}>
              ×
            </button>
            {t.action ? (
              <span className={s.act}>
                <button
                  type="button"
                  onClick={() => {
                    dismiss(t.id);
                    t.action?.onAction();
                  }}
                >
                  {t.action.label}
                </button>
              </span>
            ) : null}
            {t.tone !== "err" ? (
              <span className={s.bar} aria-hidden="true">
                <i />
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
