import { useEffect, useId, useRef } from "react";
import s from "./Segment.module.css";
import f from "./Field.module.css";

export type SegmentOption<T extends string> = { value: T; label: string; hotkey?: string };

export type SegmentProps<T extends string> = {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
  /** Alt+رقم على مستوى الصفحة (مثل Alt+1 فاتورة) */
  globalHotkeys?: boolean;
  disabled?: boolean;
};

/** مقطّع مخصص بنمط radiogroup: الأسهم تنقل الاختيار، وAlt+رقم اختصار. */
export function Segment<T extends string>(p: SegmentProps<T>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { options, onChange, globalHotkeys } = p;

  useEffect(() => {
    if (!globalHotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const opt = options.find((o) => o.hotkey && e.code === `Digit${o.hotkey}`);
      if (opt) {
        e.preventDefault();
        onChange(opt.value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [options, onChange, globalHotkeys]);

  const i = p.options.findIndex((o) => o.value === p.value);
  return (
    <div className={f.field}>
      <span className={f.label} id={id}>
        {p.label}
      </span>
      <div
        className={s.seg}
        role="radiogroup"
        tabIndex={-1}
        aria-labelledby={id}
        onKeyDown={(e) => {
          const step = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const n = (i + step + p.options.length) % p.options.length;
          const next = p.options[n];
          if (next) {
            p.onChange(next.value);
            refs.current[n]?.focus();
          }
        }}
      >
        {p.options.map((o, k) => (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[k] = el;
            }}
            type="button"
            role="radio"
            aria-checked={o.value === p.value}
            tabIndex={o.value === p.value ? 0 : -1}
            disabled={p.disabled}
            onClick={() => p.onChange(o.value)}
            aria-keyshortcuts={o.hotkey ? `Alt+${o.hotkey}` : undefined}
          >
            {o.label}
            {o.hotkey ? <kbd className={s.kbd}>Alt+{o.hotkey}</kbd> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export type DocType = "inv" | "misc" | "note";
export const DOC_TYPE_OPTIONS: SegmentOption<DocType>[] = [
  { value: "inv", label: "فاتورة", hotkey: "1" },
  { value: "misc", label: "قيد", hotkey: "2" },
  { value: "note", label: "ملاحظة", hotkey: "3" },
];

export function DocTypeSegment(p: { value: DocType; onChange: (v: DocType) => void; disabled?: boolean }) {
  return (
    <Segment
      label="نوع المستند"
      value={p.value}
      options={DOC_TYPE_OPTIONS}
      onChange={p.onChange}
      globalHotkeys
      disabled={p.disabled}
    />
  );
}
