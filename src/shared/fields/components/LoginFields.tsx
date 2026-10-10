import { useState } from "react";
import { passwordStrength, STRENGTH_LABEL } from "../core";
import { Icon } from "../../ui/Icon";
import { FieldShell } from "./Field";
import f from "./Field.module.css";
import s from "./LoginFields.module.css";

export function IdentifierField(p: { value: string; onChange: (v: string) => void; error?: string | null }) {
  return (
    <FieldShell label="البريد أو اسم المستخدم" required error={p.error ?? null}>
      {(ids) => (
        <div className={f.box}>
          <input
            id={ids.inputId}
            className={`${f.input} ${f.num}`}
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={p.value}
            aria-invalid={ids.invalid || undefined}
            aria-describedby={ids.describedBy}
            onChange={(e) => p.onChange(e.target.value)}
          />
        </div>
      )}
    </FieldShell>
  );
}

export type PasswordFieldProps = {
  value: string;
  onChange: (v: string) => void;
  /** set = إنشاء أو تغيير (يُظهر مؤشر القوة)، signin = دخول */
  mode: "signin" | "set";
  label?: string;
  context?: string[];
  error?: string | null;
};

/** زر إظهار/إخفاء، ومؤشر قوة بالمستوى فقط دون كشف القواعد. */
export function PasswordField(p: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  const strength = p.mode === "set" ? passwordStrength(p.value, p.context) : 0;
  return (
    <FieldShell label={p.label ?? "كلمة المرور"} required error={p.error ?? null}>
      {(ids) => (
        <>
          <div className={f.box}>
            <input
              id={ids.inputId}
              className={`${f.input} ${f.num}`}
              type={shown ? "text" : "password"}
              autoComplete={p.mode === "set" ? "new-password" : "current-password"}
              autoCapitalize="none"
              spellCheck={false}
              value={p.value}
              aria-invalid={ids.invalid || undefined}
              aria-describedby={ids.describedBy}
              onChange={(e) => p.onChange(e.target.value)}
            />
            <button
              type="button"
              className={f.iconButton}
              aria-pressed={shown}
              aria-label={shown ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              onClick={() => setShown((x) => !x)}
            >
              <Icon name={shown ? "eyeOff" : "eye"} />
            </button>
          </div>
          {p.mode === "set" && p.value ? (
            <>
              <div className={s.meter} aria-hidden="true">
                {[1, 2, 3].map((n) => (
                  <span key={n} className={`${s.bar} ${strength >= n ? s[`on${strength}` as "on1"] : ""}`} />
                ))}
              </div>
              <span className={s.level} aria-live="polite">
                القوة: {STRENGTH_LABEL[strength]}
              </span>
            </>
          ) : null}
        </>
      )}
    </FieldShell>
  );
}
