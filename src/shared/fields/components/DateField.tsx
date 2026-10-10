import { useCallback, useEffect, useRef, useState } from "react";
import { checkDate, formatDate, formatDateWithDay, parseDateInput, type IsoDate } from "../core";
import { Icon } from "../../ui/Icon";
import { Calendar } from "./Calendar";
import { FieldShell } from "./Field";
import { useNativeBeforeInput } from "./useNativeBeforeInput";
import s from "./Field.module.css";

export type DateFieldProps = {
  label?: string;
  value: IsoDate | null;
  onChange: (iso: IsoDate | null) => void;
  today: IsoDate;
  /** أساس +n/−n */
  base?: IsoDate;
  lockedThrough?: IsoDate | null;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string | null;
};

const ALLOWED = /^[0-9٠-٩۰-۹/.\-+−]+$/;

/** كتابة + تقويم (DECISIONS 2026-10-10): يوم ثم شهر دائماً، ويُعرض «السبت 15/08/2026» بعد الخروج. */
export function DateField(p: DateFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(p.value ? formatDate(p.value) : "");
  const [own, setOwn] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (document.activeElement !== ref.current) setText(p.value ? formatDate(p.value) : "");
  }, [p.value]);

  const before = useCallback((e: InputEvent) => {
    if (e.inputType === "insertText" && e.data && !ALLOWED.test(e.data)) {
      e.preventDefault();
      setOwn("التاريخ أرقام وفواصل فقط. اكتب: 15 أو 1508 أو 15/8 أو 150826 أو +1");
    }
  }, []);
  useNativeBeforeInput(ref, before);

  function commit(raw: string, pasted = false) {
    const r = parseDateInput(raw, { today: p.today, base: p.base, pasted });
    setWarn(null);
    if (!r.ok) {
      setOwn(r.error);
      p.onChange(null);
      return;
    }
    setText(formatDate(r.date));
    const c = checkDate(r.date, { today: p.today, lockedThrough: p.lockedThrough });
    if (c.error) {
      setOwn(c.error);
      p.onChange(null);
      return;
    }
    setOwn(null);
    setWarn(c.warning ?? null);
    p.onChange(r.date);
  }

  const error = own ?? p.error ?? null;
  return (
    <FieldShell
      label={p.label ?? "التاريخ"}
      required={p.required}
      disabled={p.disabled}
      readOnly={p.readOnly}
      error={error}
      warning={warn}
      hint={p.value && !error ? formatDateWithDay(p.value) : null}
    >
      {(ids) => (
        <div className={s.anchor}>
          <div className={s.box}>
            <input
              ref={ref}
              id={ids.inputId}
              className={`${s.input} ${s.num}`}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={text}
              disabled={p.disabled}
              readOnly={p.readOnly}
              aria-invalid={ids.invalid || undefined}
              aria-describedby={ids.describedBy}
              onChange={(e) => {
                setOwn(null);
                setText(e.target.value);
              }}
              onBlur={() => commit(text)}
              onPaste={(e) => {
                e.preventDefault();
                commit(e.clipboardData.getData("text"), true);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && e.altKey) {
                  e.preventDefault();
                  setOpen(true);
                }
              }}
            />
            {!p.disabled && !p.readOnly ? (
              <button
                type="button"
                className={s.iconButton}
                aria-label="اختيار التاريخ من التقويم"
                aria-haspopup="dialog"
                aria-expanded={open}
                data-cal-trigger
                onClick={() => setOpen((o) => !o)}
              >
                <Icon name="calendar" />
              </button>
            ) : null}
          </div>
          {open ? (
            <Calendar
              selected={p.value}
              today={p.today}
              lockedThrough={p.lockedThrough}
              onClose={() => {
                setOpen(false);
                ref.current?.focus();
              }}
              onPick={(iso) => {
                setOpen(false);
                commit(formatDate(iso));
                ref.current?.focus();
              }}
            />
          ) : null}
        </div>
      )}
    </FieldShell>
  );
}
