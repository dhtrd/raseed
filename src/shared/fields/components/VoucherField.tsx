import { useCallback, useRef, useState } from "react";
import { normalizeVoucher, validateVoucher } from "../core";
import { FieldShell } from "./Field";
import { useNativeBeforeInput } from "./useNativeBeforeInput";
import s from "./Field.module.css";

/** رقم السند: أرقام فقط تُحفظ نصاً بأصفارها البادئة، اختياري. */
export function VoucherField(p: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState<string | null>(null);
  const before = useCallback((e: InputEvent) => {
    if (e.inputType === "insertText" && e.data && !/^[0-9٠-٩۰-۹]+$/.test(e.data)) {
      e.preventDefault();
      setOwn("رقم السند أرقام فقط، بلا حروف ولا كسور.");
    }
  }, []);
  useNativeBeforeInput(ref, before);
  return (
    <FieldShell label="رقم السند" optional disabled={p.disabled} error={own ?? p.error ?? null}>
      {(ids) => (
        <div className={s.box}>
          <input
            ref={ref}
            id={ids.inputId}
            className={`${s.input} ${s.num}`}
            inputMode="numeric"
            autoComplete="off"
            value={p.value}
            disabled={p.disabled}
            aria-invalid={ids.invalid || undefined}
            aria-describedby={ids.describedBy}
            onChange={(e) => {
              setOwn(null);
              p.onChange(normalizeVoucher(e.target.value));
            }}
            onPaste={(e) => {
              e.preventDefault();
              const v = normalizeVoucher(e.clipboardData.getData("text"));
              const err = validateVoucher(v);
              if (err) setOwn(err);
              else p.onChange(v);
            }}
            onBlur={() => setOwn(validateVoucher(p.value))}
          />
        </div>
      )}
    </FieldShell>
  );
}
