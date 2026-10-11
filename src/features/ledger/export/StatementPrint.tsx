import { createPortal } from "react-dom";
import { formatDate } from "../../../shared/fields/core/date";
import { Mark } from "../../../shared/ui/Logo";
import type { StatementExport } from "../core/exportModel";
import { Amount, HeadSar, Money } from "../ui/Amount";
import s from "./StatementPrint.module.css";

/**
 * نسخة الطباعة A4 للكشف — الخيار «أ. كشف رسمي عمودي» (DECISIONS 2026-10-11).
 * تُرسم خارج #root ولا تظهر إلا عند الطباعة، فتعمل مع زر «طباعة / PDF» ومع Ctrl+P معاً.
 * بلا خانات توقيع ولا اسم من طبع (قرار المستخدم «ما يحتاج حالياً»)، و«للمراجعة» لا يظهر.
 */
export function StatementPrint({ x }: { x: StatementExport }) {
  return createPortal(
    <div className={s.root} aria-hidden="true">
      <header className={s.lh}>
        <div>
          <div className={s.brand}>
            <Mark className={s.mark} />
            رصيد
          </div>
          <div className={s.sub}>كشف حساب مورد</div>
        </div>
        <div className={s.who}>
          <h1>{x.supplierName}</h1>
          <div className={s.sub}>{x.periodLabel}</div>
          <div className={s.sub}>طُبع {x.printedAt}</div>
        </div>
      </header>

      <dl className={s.sum}>
        <div>
          <dt>{x.hasOpening ? "الرصيد الافتتاحي" : "الرصيد الافتتاحي (من أول حركة)"}</dt>
          <dd>
            <Money h={x.opening} />
          </dd>
        </div>
        <div>
          <dt>مجموع المدين</dt>
          <dd>
            <Money h={x.debit} />
          </dd>
        </div>
        <div>
          <dt>مجموع الدائن</dt>
          <dd>
            <Money h={x.credit} />
          </dd>
        </div>
        <div>
          <dt>{x.hasOpening ? "الرصيد الختامي" : "الرصيد الكلي"}</dt>
          <dd>
            <Money h={x.closing} />
          </dd>
        </div>
      </dl>

      <table className={s.table}>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>النوع</th>
            <th>الرقم المرجعي</th>
            <th>البيان</th>
            <th className={s.amt}>
              مدين
              <HeadSar />
            </th>
            <th className={s.amt}>
              دائن
              <HeadSar />
            </th>
            <th className={s.amt}>
              الرصيد
              <HeadSar />
            </th>
          </tr>
        </thead>
        <tbody>
          {x.rows.length === 0 ? (
            <tr>
              <td colSpan={7} className={s.empty}>
                لا حركات في هذه الفترة.
              </td>
            </tr>
          ) : null}
          {x.rows.map((r, i) => (
            <tr key={i} className={r.isNote ? s.note : undefined}>
              <td className="num">{formatDate(r.date)}</td>
              <td>{r.type}</td>
              <td className="num">{r.refNo}</td>
              <td className={s.desc}>{r.desc}</td>
              <td className={s.amt}>{r.debit ? <Amount h={r.debit} /> : null}</td>
              <td className={s.amt}>{r.credit ? <Amount h={r.credit} /> : null}</td>
              <td className={s.amt}>
                <Amount h={r.balance} />
              </td>
            </tr>
          ))}
          {/* الإجمالي داخل الجسم لا في tfoot، لأن المتصفح يكرر tfoot في كل صفحة */}
          <tr className={s.total}>
            <th colSpan={4} scope="row">
              {x.hasOpening ? "الرصيد الختامي" : "الرصيد الكلي"}
            </th>
            <td className={s.amt}>
              <Amount h={x.debit} />
            </td>
            <td className={s.amt}>
              <Amount h={x.credit} />
            </td>
            <td className={s.amt}>
              <Amount h={x.closing} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>,
    document.body,
  );
}
