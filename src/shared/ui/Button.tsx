import type { ButtonHTMLAttributes, ReactNode } from "react";
import s from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  wide?: boolean;
  busy?: boolean;
  children: ReactNode;
};

/** الزر (CHOSEN §4): 44px (48px جوال)، إطار 1.5px، زوايا 6px. «مشغول» يمنع النقر المزدوج ويعلن الحالة. */
export function Button({
  variant = "secondary",
  size = "md",
  wide,
  busy,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = [s.btn, s[variant], size === "sm" ? s.sm : "", wide ? s.wide : ""].join(" ");
  return (
    <button
      type="button"
      {...rest}
      className={cls}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={busy ? (e) => e.preventDefault() : rest.onClick}
    >
      {busy ? <span className={s.spin} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export { s as buttonStyles };
