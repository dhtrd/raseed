import type { ReactNode } from "react";
import { useHoldBusy } from "./busy";
import { Mark } from "./Logo";
import s from "./LedgerState.module.css";

/**
 * حالتا التحميل والفراغ (الخيار ج المعتمد في proposals/2026-10-11-loading-empty.html، DECISIONS 2026-10-11):
 * صفحة دفتر مسطّرة بهامشها، وفي وسطها شعار «علامة التوازن» بحركة «الكفّتان» (DECISIONS 2026-10-11).
 */
export function LoadingLedger({ label }: { label: string }) {
  useHoldBusy(true);
  return (
    <div className={s.ledger} role="status" aria-live="polite">
      <div className={s.center}>
        <Mark className={s.mark} motion="loading" />
        <span>{label}</span>
      </div>
    </div>
  );
}

/** الفراغ: لماذا هو فارغ، والخطوة التالية بزر أو رابط */
export function EmptyLedger(p: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`${s.ledger} ${s.empty}`} role="status">
      <div className={s.center}>
        <h2 className={s.title}>{p.title}</h2>
        {p.children ? <p className={s.text}>{p.children}</p> : null}
        {p.actions ? <div className={s.actions}>{p.actions}</div> : null}
      </div>
    </div>
  );
}
