import { useLayoutEffect, useRef } from "react";
import { cleanPastedText } from "../core";
import { FieldShell } from "./Field";
import s from "./Field.module.css";
import t from "./TextAreaField.module.css";

export type TextAreaFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
  error?: string | null;
  /** يظهر العدّاد دائماً أو قرب الحد فقط */
  counter?: "always" | "near-limit";
  suggestions?: string[];
  suggestionsLabel?: string;
};

/** نص متعدد الأسطر يتمدد مع المحتوى. Shift+Enter سطر جديد، وEnter للحقل التالي (useEnterToNext). */
export function TextAreaField(p: TextAreaFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.blockSize = "auto";
    el.style.blockSize = `${el.scrollHeight}px`;
  }, [p.value]);
  const showCounter = p.counter === "always" || p.value.length >= p.maxLength * 0.9;
  return (
    <FieldShell
      label={p.label}
      required={p.required}
      optional={p.optional}
      disabled={p.disabled}
      error={p.error ?? null}
    >
      {(ids) => (
        <>
          <div className={s.box}>
            <textarea
              ref={ref}
              id={ids.inputId}
              className={s.textarea}
              rows={1}
              maxLength={p.maxLength}
              value={p.value}
              disabled={p.disabled}
              aria-invalid={ids.invalid || undefined}
              aria-describedby={ids.describedBy}
              data-multiline
              onChange={(e) => p.onChange(e.target.value)}
              onPaste={(e) => {
                e.preventDefault();
                const el = e.currentTarget;
                const room = p.maxLength - el.value.length + (el.selectionEnd - el.selectionStart);
                const text = cleanPastedText(e.clipboardData.getData("text"), true).slice(
                  0,
                  Math.max(0, room),
                );
                const next = el.value.slice(0, el.selectionStart) + text + el.value.slice(el.selectionEnd);
                p.onChange(next);
              }}
            />
          </div>
          {p.suggestions?.length ? (
            <div className={t.suggestions}>
              <span>{p.suggestionsLabel ?? "الأكثر استخداماً:"}</span>
              {p.suggestions.map((x) => (
                <button
                  key={x}
                  type="button"
                  className={t.chip}
                  onClick={() => p.onChange(x.slice(0, p.maxLength))}
                >
                  {x}
                </button>
              ))}
            </div>
          ) : null}
          {showCounter ? (
            <span className={s.counter} aria-live="polite">
              {p.value.length} / {p.maxLength}
            </span>
          ) : null}
        </>
      )}
    </FieldShell>
  );
}
