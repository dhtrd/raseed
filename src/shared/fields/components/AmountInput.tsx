import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  AMOUNT_MESSAGES,
  classifyTypedChar,
  cleanPastedAmount,
  formatHalalas,
  formatLive,
  normalizeDigits,
  parseAmount,
  toHalalas,
} from "../core";
import { insertAtCaret, useNativeBeforeInput } from "./useNativeBeforeInput";
import s from "./Field.module.css";

export type AmountInputProps = {
  id?: string;
  value: number | null;
  onChange: (halalas: number | null) => void;
  /** خطأ من الحقل نفسه (حرف مرفوض، صفر، تجاوز الحد) أو null عند التصحيح */
  onValidity: (error: string | null) => void;
  disabled?: boolean;
  readOnly?: boolean;
  describedBy?: string | undefined;
  invalid?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
};

/** حقل مبلغ: موجب فقط، منزلتان، فواصل آلاف حية، أرقام هندية، لصق منظَّف (FIELDS «المبلغ»). */
export function AmountInput(p: AmountInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(p.value == null ? "" : formatHalalas(p.value));
  const caret = useRef<number | null>(null);
  const { onValidity, onChange } = p;

  // مزامنة القيمة الخارجية حين لا يكون الحقل في التركيز
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(p.value == null ? "" : formatHalalas(p.value));
  }, [p.value]);

  useLayoutEffect(() => {
    if (caret.current != null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  const before = useCallback(
    (e: InputEvent, el: HTMLInputElement | HTMLTextAreaElement) => {
      if (e.inputType !== "insertText" || !e.data) return;
      const kind = classifyTypedChar(e.data);
      if (kind === "digit") {
        const v = el.value;
        const dot = v.indexOf(".");
        const c = el.selectionStart ?? v.length;
        if (dot > -1 && c > dot && v.length - dot - 1 >= 2 && el.selectionEnd === c) {
          e.preventDefault();
          onValidity(AMOUNT_MESSAGES.twoDecimals);
          return;
        }
        const latin = normalizeDigits(e.data);
        if (latin !== e.data) {
          e.preventDefault();
          insertAtCaret(el, latin);
        }
        return;
      }
      e.preventDefault();
      if (kind === "decimal") {
        if (el.value.includes(".")) onValidity(AMOUNT_MESSAGES.oneDecimal);
        else insertAtCaret(el, ".");
        return;
      }
      onValidity(kind === "sign" ? AMOUNT_MESSAGES.positiveOnly : AMOUNT_MESSAGES.digitsOnly);
    },
    [onValidity],
  );
  useNativeBeforeInput(ref, before);

  function apply(raw: string, pos: number) {
    const f = formatLive(raw, pos);
    caret.current = f.caret;
    setText(f.value);
    onChange(toHalalas(f.value.replace(/,/g, "")) || null);
  }

  return (
    <input
      ref={ref}
      id={p.id}
      className={`${s.input} ${s.num}`}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={text}
      disabled={p.disabled}
      readOnly={p.readOnly}
      aria-invalid={p.invalid || undefined}
      aria-describedby={p.describedBy}
      aria-label={p.ariaLabel}
      aria-labelledby={p.ariaLabelledBy}
      onKeyDown={p.onKeyDown}
      onChange={(e) => {
        onValidity(null);
        // احتياط: بعض لوحات المفاتيح وIME لا تطلق beforeinput (Firefox، أندرويد)،
        // فنحوّل الأرقام الهندية والفاصلة العربية هنا أيضاً. «,» تبقى فاصل آلاف من تنسيقنا.
        const raw = normalizeDigits(e.target.value).replace(/[٫،]/g, ".");
        apply(raw, e.target.selectionStart ?? raw.length);
      }}
      onPaste={(e) => {
        e.preventDefault();
        const r = cleanPastedAmount(e.clipboardData.getData("text"));
        if (!r.ok) return onValidity(r.error);
        onValidity(null);
        apply(r.value, r.value.length);
      }}
      onBlur={() => {
        const r = parseAmount(text);
        if (r.ok === true) {
          setText(formatHalalas(r.halalas));
          onChange(r.halalas);
          onValidity(null);
        } else if (r.ok === "empty") {
          onChange(null);
        } else {
          onChange(null);
          onValidity(r.error);
        }
      }}
    />
  );
}
