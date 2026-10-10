import { useCallback, useId, useRef, useState } from "react";
import { normalizeRef, validateRef, type EntryKind } from "../core";
import { FieldShell } from "./Field";
import { useNativeBeforeInput } from "./useNativeBeforeInput";
import s from "./Field.module.css";

export type RefFieldProps = {
  kind: EntryKind;
  value: string;
  onChange: (ref: string, opts: { fromSuggestion: boolean }) => void;
  /** المرجع المقترح (آخر رقم للمورد والنوع + 1) */
  suggestion?: string | null;
  /** نتيجة فحص التكرار من طبقة البيانات (يظهر عند الخروج) */
  duplicateOf?: string | null;
  onBlurCheck?: (ref: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
};

const ALLOWED_CHAR = /^[A-Za-z0-9ء-ي٠-٩۰-۹/\- ]+$/;

/** المرجع نص لا رقم: يحفظ الأصفار البادئة، ويقبل العربي، ويُقص ويُكبَّر عند الخروج. */
export function RefField(p: RefFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState<string | null>(null);
  const before = useCallback((e: InputEvent) => {
    if (e.inputType === "insertText" && e.data && !ALLOWED_CHAR.test(e.data)) {
      e.preventDefault();
      setOwn("المرجع حروف وأرقام و / و - فقط.");
    }
  }, []);
  useNativeBeforeInput(ref, before);

  const dup = p.duplicateOf
    ? `المرجع مكرر: مسجّل لـ ${p.duplicateOf}. عدّله أو أكّد أنها حركة مختلفة مع ذكر السبب.`
    : null;
  const error = own ?? p.error ?? dup;
  return (
    <FieldShell
      label="المرجع الرئيسي"
      required={p.required}
      disabled={p.disabled}
      error={error}
      hint={
        p.suggestion && p.value === p.suggestion
          ? `مقترح: التالي لآخر ${p.kind === "inv" ? "فاتورة" : "قيد"} لهذا المورد`
          : null
      }
    >
      {(ids) => (
        <div className={s.box}>
          <input
            ref={ref}
            id={ids.inputId}
            className={`${s.input} ${s.num}`}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={60}
            value={p.value}
            disabled={p.disabled}
            aria-invalid={ids.invalid || undefined}
            aria-describedby={ids.describedBy}
            onChange={(e) => {
              setOwn(null);
              p.onChange(e.target.value, { fromSuggestion: false });
            }}
            onBlur={() => {
              const v = normalizeRef(p.value);
              if (v !== p.value) p.onChange(v, { fromSuggestion: v === p.suggestion });
              const err = validateRef(v, p.kind);
              setOwn(err);
              if (!err) p.onBlurCheck?.(v);
            }}
          />
        </div>
      )}
    </FieldShell>
  );
}

export function RefNumberOutput({ value, duplicate }: { value: string; duplicate?: boolean }) {
  const id = useId();
  return (
    <div className={s.field}>
      <span className={s.label} id={id}>
        الرقم المرجعي (يتولّد)
      </span>
      <output aria-labelledby={id} className={`${s.refno} ${duplicate ? s.refnoDup : ""}`}>
        {value}
      </output>
    </div>
  );
}
