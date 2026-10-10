import { normalizeDigits } from "../core";
import { Icon } from "../../ui/Icon";
import { FieldShell } from "./Field";
import s from "./Field.module.css";

/** يبحث في المورد والمرجع والتفاصيل والمبلغ؛ الأرقام الهندية تُحوَّل. */
export function SearchField(p: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <FieldShell label={p.label ?? "بحث"}>
      {(ids) => (
        <div className={s.box} role="search">
          <Icon name="search" className={s.affix} />
          <input
            id={ids.inputId}
            className={s.input}
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={p.value}
            placeholder="مورد، مرجع، تفاصيل أو مبلغ"
            onChange={(e) => p.onChange(normalizeDigits(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Escape" && p.value) {
                e.preventDefault();
                p.onChange("");
              }
            }}
          />
          {p.value ? (
            <button
              type="button"
              className={s.iconButton}
              aria-label="مسح البحث"
              onClick={() => p.onChange("")}
            >
              ×
            </button>
          ) : null}
        </div>
      )}
    </FieldShell>
  );
}
