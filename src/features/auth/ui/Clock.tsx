import { useEffect, useState } from "react";
import { msToNextMinute, riyadhClock } from "../core/clock";
import s from "./LoginPage.module.css";

/** ساعة 12 ساعة بتوقيت الرياض تتحدث مع بداية كل دقيقة (DECISIONS 2026-10-10). */
export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const h = setTimeout(() => setNow(new Date()), msToNextMinute(now));
    return () => clearTimeout(h);
  }, [now]);
  const c = riyadhClock(now);
  return (
    <div className={s.clock} role="timer" aria-label={`الوقت الحالي بتوقيت الرياض ${c.time} ${c.period}`}>
      <span className={s.time} aria-hidden="true">
        <span className="num">{c.time}</span>
        <small>{c.period}</small>
      </span>
      <span className={s.date} aria-hidden="true">
        {c.date}
      </span>
    </div>
  );
}
