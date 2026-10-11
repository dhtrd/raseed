import type { ReactNode } from "react";
import { Icon } from "../../ui/Icon";
import s from "./Checkbox.module.css";

export type CheckboxProps = {
  /** «mixed» لتحديد جزئي (مثل «تحديد الظاهر» حين يُحدَّد بعضه) */
  checked: boolean | "mixed";
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  invalid?: boolean;
  id?: string;
  describedBy?: string;
};

/** مربع اختيار مخصص (لا checkbox أصلي): هدف لمس 44px، ومسافة تبدّل الحالة. */
export function Checkbox(p: CheckboxProps) {
  const cls = [s.check, p.danger ? s.danger : "", p.invalid ? s.invalid : ""].join(" ");
  return (
    <button
      type="button"
      role="checkbox"
      id={p.id}
      className={cls}
      aria-checked={p.checked}
      aria-disabled={p.disabled || undefined}
      aria-invalid={p.invalid || undefined}
      aria-describedby={p.describedBy}
      onClick={() => {
        if (!p.disabled) p.onChange(p.checked !== true);
      }}
    >
      <span className={s.box}>
        <Icon name="tick" />
      </span>
      <span>{p.children}</span>
    </button>
  );
}
