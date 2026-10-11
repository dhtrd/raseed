import { useEffect, useRef, useState } from "react";
import { createIdleTracker, type IdleTracker } from "../core/idle";
import { IDLE_DEFAULT_MINUTES, IDLE_WARN_MS } from "../core/sessionSettings";
import { watchIdleMinutes } from "../../users/data/settingsRepo";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import { Button } from "../../../shared/ui/Button";
import { useSession } from "./SessionProvider";
import s from "./IdleGuard.module.css";

const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * إنهاء الجلسة بعد الخمول (DECISIONS 2026-10-10): المدة من settings/session ويسري تغييرها فوراً،
 * وتحذير بعدّ تنازلي قبل الخروج بدقيقة.
 */
export function IdleGuard(p: { canReadSettings: boolean }) {
  const { endSession } = useSession();
  const [minutes, setMinutes] = useState(IDLE_DEFAULT_MINUTES);
  const [warning, setWarning] = useState(false);
  const [left, setLeft] = useState(60);
  const tracker = useRef<IdleTracker | null>(null);

  // صاحب الكلمة المؤقتة لا يقرأ الإعدادات (القواعد)، فيأخذ الافتراضي
  useEffect(() => {
    if (!p.canReadSettings) return;
    return watchIdleMinutes(setMinutes, (e) => {
      console.error("تعذّر قراءة مدة الخمول؛ استُخدم الافتراضي", e);
      setMinutes(IDLE_DEFAULT_MINUTES);
    });
  }, [p.canReadSettings]);

  useEffect(() => {
    const t = createIdleTracker({
      timeoutMs: IDLE_DEFAULT_MINUTES * 60_000,
      warnMs: IDLE_WARN_MS,
      onChange: (st) => {
        setWarning(st === "warning");
        if (st === "expired") void endSession("expired");
      },
    });
    tracker.current = t;
    const onActivity = () => t.activity();
    for (const ev of ACTIVITY) window.addEventListener(ev, onActivity, { passive: true, capture: true });
    return () => {
      for (const ev of ACTIVITY) window.removeEventListener(ev, onActivity, { capture: true });
      t.stop();
      tracker.current = null;
    };
  }, [endSession]);

  useEffect(() => {
    tracker.current?.setTimeoutMs(minutes * 60_000);
  }, [minutes]);

  useEffect(() => {
    if (!warning) return;
    const tick = () =>
      setLeft(Math.max(0, Math.ceil(((tracker.current?.deadline() ?? 0) - Date.now()) / 1000)));
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [warning]);

  return (
    <Dialog isOpen={warning} alert tone="warn" title="ستنتهي جلستك">
      <p className={d.sub}>لا نشاط منذ مدة. ستخرج تلقائياً بعد:</p>
      <p className={`${s.count} num`} aria-live="off">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
      </p>
      <p className={d.sub}>ما لم يُحفظ في نموذج مفتوح سيضيع.</p>
      <div className={d.actions}>
        <Button variant="primary" onClick={() => tracker.current?.extend()}>
          متابعة العمل
        </Button>
        <Button variant="ghost" onClick={() => void endSession("expired")}>
          خروج الآن
        </Button>
      </div>
    </Dialog>
  );
}
