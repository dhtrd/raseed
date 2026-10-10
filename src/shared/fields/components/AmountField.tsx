import { useState } from "react";
import { Riyal } from "../../ui/Icon";
import { AmountInput } from "./AmountInput";
import { FieldShell } from "./Field";
import s from "./Field.module.css";

export type AmountFieldProps = {
  label?: string;
  value: number | null;
  onChange: (halalas: number | null) => void;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** خطأ من الأعلى (مثل «أدخل المبلغ» عند الحفظ) */
  error?: string | null;
};

export function AmountField(p: AmountFieldProps) {
  const [own, setOwn] = useState<string | null>(null);
  const error = own ?? p.error ?? null;
  return (
    <FieldShell
      label={p.label ?? "المبلغ"}
      required={p.required}
      disabled={p.disabled}
      readOnly={p.readOnly}
      error={error}
    >
      {(ids) => (
        <div className={s.box}>
          <Riyal className={s.affix} />
          <AmountInput
            id={ids.inputId}
            value={p.value}
            onChange={p.onChange}
            onValidity={setOwn}
            disabled={p.disabled}
            readOnly={p.readOnly}
            describedBy={ids.describedBy}
            invalid={ids.invalid}
          />
        </div>
      )}
    </FieldShell>
  );
}
