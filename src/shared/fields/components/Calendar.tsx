import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  addMonthsClamped,
  DAY_NAMES,
  formatDate,
  MONTH_NAMES,
  splitIso,
  toIso,
  weekday,
  type IsoDate,
} from "../core";
import { Icon } from "../../ui/Icon";
import s from "./Calendar.module.css";

const WEEK = ["س", "ح", "ن", "ث", "ر", "خ", "ج"]; // يبدأ السبت (DECISIONS 2026-10-10)

export type CalendarProps = {
  selected: IsoDate | null;
  today: IsoDate;
  lockedThrough?: IsoDate | null;
  onPick: (iso: IsoDate) => void;
  onClose: () => void;
  label?: string;
};

type Mode = "days" | "months" | "years";

/** شبكة ARIA: الأسهم للأيام، PageUp/PageDown للأشهر ومع Shift للسنوات، Enter للاختيار، Esc للإغلاق. */
export function Calendar(p: CalendarProps) {
  const start = p.selected ?? p.today;
  const [focus, setFocus] = useState<IsoDate>(start);
  const [mode, setMode] = useState<Mode>("days");
  const [yearPage, setYearPage] = useState(splitIso(start).y);
  const root = useRef<HTMLDivElement>(null);
  const [focusTick, setFocusTick] = useState(1);
  const { y, m } = splitIso(focus);
  const locked = (iso: IsoDate) => Boolean(p.lockedThrough && iso <= p.lockedThrough);

  // ينقل التركيز بعد التنقل بلوحة المفاتيح أو تغيير العرض فقط، لا بعد كل رسم
  useLayoutEffect(() => {
    if (!focusTick) return;
    const el = root.current?.querySelector<HTMLElement>(
      mode === "days" ? "[data-focus='true']" : "[data-cur='true']",
    );
    el?.focus();
  }, [focusTick, mode]);

  useEffect(() => {
    const out = (e: PointerEvent) => {
      if (
        root.current &&
        !root.current.contains(e.target as Node) &&
        !(e.target as Element).closest?.("[data-cal-trigger]")
      )
        p.onClose();
    };
    document.addEventListener("pointerdown", out);
    return () => document.removeEventListener("pointerdown", out);
  }, [p]);

  const go = (iso: IsoDate, keepFocus = true) => {
    setFocus(iso);
    if (keepFocus) setFocusTick((n) => n + 1);
  };
  const pick = (iso: IsoDate) => {
    if (!locked(iso)) p.onPick(iso);
  };

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      p.onClose();
      return;
    }
    if (mode !== "days") return;
    const step: Record<string, number> = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 };
    if (e.key in step) {
      e.preventDefault();
      go(addDays(focus, step[e.key] ?? 0));
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      go(addMonthsClamped(focus, (e.key === "PageDown" ? 1 : -1) * (e.shiftKey ? 12 : 1)));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const wd = (weekday(focus) + 1) % 7;
      go(addDays(focus, e.key === "Home" ? -wd : 6 - wd));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focus);
    }
  }

  const arrow = (label: string, icon: "prev" | "next" | "prev2" | "next2", onClick: () => void) => (
    <button type="button" className={s.arrow} aria-label={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );

  let head;
  let body;
  if (mode === "days") {
    const first = toIso(y, m, 1);
    const gridStart = addDays(first, -((weekday(first) + 1) % 7));
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    head = (
      <div className={s.head}>
        <span className={s.group}>
          {arrow("السنة السابقة", "prev2", () => go(addMonthsClamped(focus, -12), false))}
          {arrow("الشهر السابق", "prev", () => go(addMonthsClamped(focus, -1), false))}
        </span>
        <button
          type="button"
          className={s.title}
          onClick={() => setMode("months")}
          aria-label={`${MONTH_NAMES[m - 1]} ${y}، اختر شهراً`}
        >
          {MONTH_NAMES[m - 1]} <span className="num">{y}</span>
        </button>
        <span className={s.group}>
          {arrow("الشهر التالي", "next", () => go(addMonthsClamped(focus, 1), false))}
          {arrow("السنة التالية", "next2", () => go(addMonthsClamped(focus, 12), false))}
        </span>
      </div>
    );
    body = (
      <div className={s.grid} role="grid" aria-label={`${MONTH_NAMES[m - 1]} ${y}`}>
        <div role="row" className={s.row}>
          {WEEK.map((w, i) => (
            <span
              key={w}
              role="columnheader"
              className={`${s.wd} ${i === 6 ? s.fri : ""}`}
              aria-label={DAY_NAMES[(i + 6) % 7]}
            >
              {w}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, r) => (
          <div role="row" key={r} className={s.row}>
            {days.slice(r * 7, r * 7 + 7).map((d) => {
              const dm = splitIso(d).m;
              const isLocked = locked(d);
              const cls = [
                s.day,
                dm !== m ? s.out : "",
                d === p.today ? s.today : "",
                d === p.selected ? s.sel : "",
                isLocked ? s.lock : "",
              ].join(" ");
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  className={cls}
                  tabIndex={d === focus ? 0 : -1}
                  data-focus={d === focus}
                  aria-selected={d === p.selected}
                  aria-disabled={isLocked || undefined}
                  aria-label={`${DAY_NAMES[weekday(d)]} ${formatDate(d)}${isLocked ? "، فترة مقفلة" : ""}`}
                  onClick={() => pick(d)}
                  onFocus={() => d !== focus && setFocus(d)}
                >
                  {splitIso(d).d}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  } else if (mode === "months") {
    head = (
      <div className={s.head}>
        {arrow("السنة السابقة", "prev", () => go(addMonthsClamped(focus, -12), false))}
        <button
          type="button"
          className={s.title}
          onClick={() => (setYearPage(y), setMode("years"))}
          aria-label={`${y}، اختر سنة`}
        >
          <span className="num">{y}</span>
        </button>
        {arrow("السنة التالية", "next", () => go(addMonthsClamped(focus, 12), false))}
      </div>
    );
    body = (
      <div className={s.cells}>
        {MONTH_NAMES.map((name, i) => (
          <button
            type="button"
            key={name}
            className={i + 1 === m ? s.cur : ""}
            data-cur={i + 1 === m}
            onClick={() => {
              setFocus(addMonthsClamped(focus, i + 1 - m));
              setMode("days");
            }}
          >
            {name}
          </button>
        ))}
      </div>
    );
  } else {
    const years = Array.from({ length: 9 }, (_, i) => yearPage - 4 + i);
    head = (
      <div className={s.head}>
        {arrow("سنوات أقدم", "prev", () => setYearPage(yearPage - 9))}
        <span className={s.title} aria-disabled="true">
          اختر السنة
        </span>
        {arrow("سنوات أحدث", "next", () => setYearPage(yearPage + 9))}
      </div>
    );
    body = (
      <div className={s.cells}>
        {years.map((yy) => (
          <button
            type="button"
            key={yy}
            className={yy === y ? s.cur : ""}
            data-cur={yy === y}
            onClick={() => {
              setFocus(addMonthsClamped(focus, (yy - y) * 12));
              setMode("months");
            }}
          >
            <span className="num">{yy}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- مفاتيح الشبكة وEsc تُعالج على مستوى النافذة
    <div
      ref={root}
      className={s.cal}
      role="dialog"
      aria-label={p.label ?? "اختيار التاريخ"}
      onKeyDown={onKey}
    >
      {head}
      <div className={s.body}>{body}</div>
      <div className={s.foot}>
        <span>
          {p.lockedThrough ? (
            <>
              مقفل حتى <span className="num">{formatDate(p.lockedThrough)}</span>
            </>
          ) : null}
        </span>
        <span className={s.actions}>
          <button type="button" onClick={() => pick(p.today)} disabled={locked(p.today)}>
            اليوم
          </button>
          <button type="button" onClick={p.onClose}>
            إغلاق
          </button>
        </span>
      </div>
    </div>
  );
}
