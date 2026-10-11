import type { ReactNode } from "react";
import s from "./Switch.module.css";

export type SwitchProps = {
  checked: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
};

/** مفتاح تشغيل مخصص (role=switch) بلا checkbox أصلي، هدف لمس 44px. */
export function Switch(p: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      className={s.sw}
      aria-checked={p.checked}
      aria-disabled={p.disabled || undefined}
      onClick={() => {
        if (!p.disabled) p.onChange(!p.checked);
      }}
    >
      <span className={s.track} aria-hidden="true" />
      <span>{p.children}</span>
    </button>
  );
}
