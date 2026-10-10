import { useId, useState } from "react";
import type { EntryKind } from "../core";
import { reversalTag, sideFor, type Side } from "../../domain/direction";
import { Riyal } from "../../ui/Icon";
import { AmountInput } from "./AmountInput";
import { Checkbox } from "./Checkbox";
import f from "./Field.module.css";
import s from "./DebitCreditBar.module.css";

export type DebitCreditBarProps = {
  kind: EntryKind;
  reversed: boolean;
  onReversedChange: (reversed: boolean) => void;
  value: number | null;
  onChange: (halalas: number | null) => void;
  error?: string | null;
  disabled?: boolean;
};

const LABEL: Record<Side, string> = { debit: "مدين", credit: "دائن" };

/**
 * شريط مدين | دائن (DECISIONS 2026-10-10): الفاتورة دائن والقيد مدين، والخانة الأخرى مقفلة.
 * العكس (مرتجع/استرداد) بمفتاح صريح فقط. المبلغ واحد ينتقل مع الاتجاه، فلا يجتمع الاثنان أبداً.
 */
export function DebitCreditBar(p: DebitCreditBarProps) {
  const base = useId();
  const [own, setOwn] = useState<string | null>(null);
  const active = sideFor(p.kind, p.reversed);
  const tag = reversalTag(p.kind, p.reversed);
  const error = own ?? p.error ?? null;
  const msgId = `${base}-msg`;
  const natural =
    p.kind === "inv"
      ? "الفاتورة تُسجَّل في الدائن فقط. خانة المدين مقفلة."
      : "القيد يُسجَّل في المدين فقط. خانة الدائن مقفلة.";

  const cell = (side: Side) => {
    const on = side === active;
    const headId = `${base}-${side}`;
    return (
      <div className={`${s.cell} ${on ? "" : s.locked} ${error && on ? f.error : ""}`} key={side}>
        <div className={f.box}>
          <Riyal className={f.affix} />
          {on ? (
            <AmountInput
              value={p.value}
              onChange={p.onChange}
              onValidity={setOwn}
              disabled={p.disabled}
              ariaLabelledBy={headId}
              describedBy={error ? msgId : undefined}
              invalid={Boolean(error)}
            />
          ) : (
            <input
              className={`${f.input} ${f.num}`}
              disabled
              aria-labelledby={headId}
              aria-disabled="true"
              value=""
              readOnly
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={s.wrap} role="group" aria-labelledby={`${base}-title`}>
      <span className={f.label} id={`${base}-title`}>
        المبلغ <span className={f.required}>مطلوب</span>
        {tag ? <span className={s.tag}>{tag}</span> : null}
      </span>
      <div className={s.bar}>
        {(["debit", "credit"] as const).map((side) => (
          <span key={side} id={`${base}-${side}`} className={`${s.head} ${side === active ? s.on : ""}`}>
            {LABEL[side]}
            {side !== active ? <span className="sr-only"> (مقفلة)</span> : null}
          </span>
        ))}
        {cell("debit")}
        {cell("credit")}
      </div>
      {error ? (
        <span className={f.message} id={msgId} role="alert">
          {error}
        </span>
      ) : null}
      <Checkbox checked={p.reversed} onChange={p.onReversedChange} disabled={p.disabled}>
        عكس الاتجاه: {p.kind === "inv" ? "مرتجع (الفاتورة في المدين)" : "استرداد (القيد في الدائن)"}
      </Checkbox>
      <span className={s.hint}>
        {p.reversed ? `معكوس عمداً: يُحفظ بوسم «${tag}» ويظهر في التدقيق.` : natural}
      </span>
    </div>
  );
}
