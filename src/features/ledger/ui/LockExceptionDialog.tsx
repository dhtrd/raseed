import { useState } from "react";
import { TextAreaField } from "../../../shared/fields/components/TextAreaField";
import { formatDate, type IsoDate } from "../../../shared/fields/core/date";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import { LOCK_REASON_MAX, validateLockReason, type InvoiceRow } from "../core/invoices";
import type { OdooChange } from "../data/invoicesRepo";
import s from "./Invoices.module.css";

export interface LockException {
  rows: InvoiceRow[];
  change: OdooChange;
}

/**
 * استثناء الفترة المقفلة (الخيار أ المعتمد في proposals/2026-10-11-odoo-lock-exception.html): المالك وحده
 * يغيّر حالة Odoo لفواتير مقفلة بسبب إلزامي، دون فتح القفل ودون تغيير أي حقل آخر (القواعد تفرض ذلك).
 */
export function LockExceptionDialog(p: {
  target: LockException | null;
  lockedThrough: IsoDate | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  return (
    <Dialog isOpen={p.target !== null} tone="warn" title="استثناء الفترة المقفلة" onDismiss={p.onCancel}>
      {p.target ? (
        <Body
          key={p.target.rows.map((r) => r.id).join(",")}
          target={p.target}
          lockedThrough={p.lockedThrough}
          onCancel={p.onCancel}
          onConfirm={p.onConfirm}
        />
      ) : null}
    </Dialog>
  );
}

function Body(p: {
  target: LockException;
  lockedThrough: IsoDate | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { rows, change } = p.target;
  const to = change.entered ? "«دخلت»" : "«لم تدخل»";
  return (
    <form
      className={s.excForm}
      noValidate
      aria-label="استثناء الفترة المقفلة"
      onSubmit={(e) => {
        e.preventDefault();
        const err = validateLockReason(reason);
        setError(err);
        if (!err) p.onConfirm(reason.trim());
      }}
    >
      <div className={s.excSum}>
        <p>
          {rows.length === 1 ? "الفاتورة" : `${rows.length} فواتير`}{" "}
          <span className="num">
            {rows
              .slice(0, 6)
              .map((r) => r.refNo)
              .join("، ")}
          </span>
          {rows.length > 6 ? ` و${rows.length - 6} غيرها` : ""} بتاريخ داخل الفترة المقفلة
          {p.lockedThrough ? (
            <>
              {" "}
              حتى <span className="num">{formatDate(p.lockedThrough)}</span>
            </>
          ) : null}
          .
        </p>
        <p>تتغير حالة Odoo إلى {to} فقط، ولا يُفتح القفل ولا يتغير شيء آخر.</p>
      </div>
      <TextAreaField
        label="سبب الاستثناء (يُحفظ مع الفاتورة وفي التدقيق)"
        required
        value={reason}
        onChange={(v) => {
          setReason(v);
          setError(null);
        }}
        maxLength={LOCK_REASON_MAX}
        counter="near-limit"
        error={error ?? undefined}
      />
      <div className={d.actions}>
        <Button type="submit" variant="primary">
          تطبيق الاستثناء
        </Button>
        <Button variant="ghost" onClick={p.onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
