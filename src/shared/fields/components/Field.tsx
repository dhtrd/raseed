import type { ReactNode } from "react";
import { useId } from "react";
import s from "./Field.module.css";

export type FieldState = "idle" | "valid" | "error";

export type FieldShellProps = {
  label: ReactNode;
  required?: boolean;
  optional?: boolean;
  state?: FieldState;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string | null;
  warning?: string | null;
  hint?: ReactNode;
  className?: string;
  /** يُمرَّر للعنصر المرتبط بالتسمية */
  children: (ids: FieldIds) => ReactNode;
};

export type FieldIds = {
  inputId: string;
  labelId: string;
  describedBy: string | undefined;
  invalid: boolean;
};

/** غلاف موحّد: التسمية فوق الحقل، والرسالة تحته، ومعرّفات aria مربوطة (FIELDS «قواعد مشتركة»). */
export function FieldShell(p: FieldShellProps) {
  const base = useId();
  const inputId = `${base}-in`;
  const labelId = `${base}-lb`;
  const msgId = `${base}-msg`;
  const hintId = `${base}-hint`;
  const hasMsg = Boolean(p.error || p.warning);
  const describedBy = [hasMsg ? msgId : null, p.hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  const cls = [
    s.field,
    p.state === "error" || p.error ? s.error : "",
    p.disabled ? s.disabled : "",
    p.readOnly ? s.readonly : "",
    p.className ?? "",
  ].join(" ");
  return (
    <div className={cls}>
      <label className={s.label} htmlFor={inputId} id={labelId}>
        {p.label}
        {p.required ? <span className={s.required}>مطلوب</span> : null}
        {p.optional ? <span className={s.optional}>اختياري</span> : null}
      </label>
      {p.children({ inputId, labelId, describedBy, invalid: Boolean(p.error) })}
      {p.hint ? (
        <span className={s.hint} id={hintId}>
          {p.hint}
        </span>
      ) : null}
      {p.error ? (
        <span className={s.message} id={msgId} role="alert">
          {p.error}
        </span>
      ) : p.warning ? (
        <span className={s.warning} id={msgId} role="status">
          <b>تنبيه:</b> {p.warning}
        </span>
      ) : null}
    </div>
  );
}

export { s as fieldStyles };
