import { Riyal } from "../../../shared/ui/Icon";
import { formatMoney } from "../core/ledger";
import s from "./Ledger.module.css";

/** رقم مالي داخل جدول (الرمز في رأس العمود): أرقام لاتينية جدولية، والسالب بالأحمر. */
export function Amount(p: { h: number; className?: string }) {
  return <span className={`num ${p.h < 0 ? s.neg : ""} ${p.className ?? ""}`}>{formatMoney(p.h)}</span>;
}

/** قيمة مالية قائمة بذاتها (CHOSEN §4 «.money»): رمز الريال الرسمي يسار الرقم داخل عزل LTR. */
export function Money(p: { h: number; className?: string }) {
  return (
    <span className={`money ${s.money} ${p.h < 0 ? s.neg : ""} ${p.className ?? ""}`}>
      <Riyal className={s.sar} />
      <span>{formatMoney(p.h)}</span>
    </span>
  );
}

/** رمز الريال في رأس عمود المبلغ. */
export function HeadSar() {
  return <Riyal className={s.headSar} />;
}
