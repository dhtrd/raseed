import { FieldShell } from "./Field";
import f from "./Field.module.css";

export type TextFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onEnter?: () => void;
  maxLength: number;
  required?: boolean;
  readOnly?: boolean;
  error?: string | null;
  hint?: string;
  ltr?: boolean;
  inputMode?: "text" | "numeric" | "email";
  autoComplete?: string;
};

/** حقل نص عام (اسم ظاهر، مسمى دور…): input نصي بمظهر مخصص، والحد الأقصى مفروض. */
export function TextField(p: TextFieldProps) {
  return (
    <FieldShell
      label={p.label}
      required={p.required}
      readOnly={p.readOnly}
      error={p.error ?? null}
      hint={p.hint}
    >
      {(ids) => (
        <div className={f.box}>
          <input
            id={ids.inputId}
            className={`${f.input} ${p.ltr ? f.num : ""}`}
            value={p.value}
            maxLength={p.maxLength}
            readOnly={p.readOnly}
            inputMode={p.inputMode ?? "text"}
            autoComplete={p.autoComplete ?? "off"}
            aria-invalid={ids.invalid || undefined}
            aria-describedby={ids.describedBy}
            onChange={(e) => p.onChange(e.target.value)}
            onBlur={p.onBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter" && p.onEnter) {
                e.preventDefault();
                p.onEnter();
              }
            }}
          />
        </div>
      )}
    </FieldShell>
  );
}
