import { useId, useRef, useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { LIMITS } from "../core";
import { TextAreaField } from "./TextAreaField";
import f from "./Field.module.css";
import s from "./ReasonDialog.module.css";

export type OdooRevertReason = "wrong" | "cancelled" | "other";
export const ODOO_REVERT_REASONS: { value: OdooRevertReason; label: string; desc: string }[] = [
  { value: "wrong", label: "حُددت بالخطأ", desc: "ضُغطت «دخلت» على فاتورة لم تُدخل في Odoo." },
  { value: "cancelled", label: "أُلغيت في Odoo", desc: "أُدخلت ثم أُلغيت هناك." },
  { value: "other", label: "أخرى", desc: "اكتب السبب في الحقل أدناه (إلزامي)." },
];

export type ReasonDialogProps = {
  isOpen: boolean;
  count: number;
  onCancel: () => void;
  onConfirm: (r: { reason: OdooRevertReason; text: string }) => void;
};

/** نافذة وسطى (DECISIONS 2026-10-10): سبب إلزامي من قائمة، و«أخرى» تجعل النص إلزامياً. سبب واحد للكل. */
export function ReasonDialog(p: ReasonDialogProps) {
  const [reason, setReason] = useState<OdooRevertReason | null>(null);
  const [text, setText] = useState("");
  const [errReason, setErrReason] = useState<string | null>(null);
  const [errText, setErrText] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = useId();

  const reset = () => {
    setReason(null);
    setText("");
    setErrReason(null);
    setErrText(null);
  };
  const submit = () => {
    let ok = true;
    if (!reason) {
      setErrReason("اختر سبب الإرجاع.");
      ok = false;
    }
    if (reason === "other" && !text.trim()) {
      setErrText("اكتب السبب، فهو مطلوب مع «أخرى».");
      ok = false;
    }
    if (!ok || !reason) return;
    p.onConfirm({ reason, text: text.trim() });
    reset();
  };

  const idx = ODOO_REVERT_REASONS.findIndex((r) => r.value === reason);
  return (
    <ModalOverlay
      className={s.overlay}
      isOpen={p.isOpen}
      isDismissable
      onOpenChange={(open) => {
        if (!open) {
          reset();
          p.onCancel();
        }
      }}
    >
      <Modal className={s.modal}>
        <Dialog className={s.dialog}>
          <Heading slot="title" className={s.title}>
            إرجاع {p.count} {p.count === 1 ? "فاتورة" : "فواتير"} إلى «لم تدخل»
          </Heading>
          <p className={s.sub}>السبب يُحفظ مع كل فاتورة وفي سجل التدقيق. سبب واحد يُطبَّق على الكل.</p>
          <div className={f.label} id={labelId}>
            السبب <span className={f.required}>مطلوب</span>
          </div>
          <div
            className={`${s.cards} ${errReason ? s.cardsInvalid : ""}`}
            role="radiogroup"
            tabIndex={-1}
            aria-labelledby={labelId}
            aria-invalid={Boolean(errReason) || undefined}
            onKeyDown={(e) => {
              const step = { ArrowDown: 1, ArrowUp: -1, ArrowLeft: 1, ArrowRight: -1 }[e.key];
              if (!step) return;
              e.preventDefault();
              const n = (Math.max(idx, 0) + step + ODOO_REVERT_REASONS.length) % ODOO_REVERT_REASONS.length;
              const next = ODOO_REVERT_REASONS[n];
              if (next) {
                setReason(next.value);
                setErrReason(null);
                refs.current[n]?.focus();
              }
            }}
          >
            {ODOO_REVERT_REASONS.map((r, k) => (
              <button
                key={r.value}
                ref={(el) => {
                  refs.current[k] = el;
                }}
                type="button"
                role="radio"
                className={s.card}
                aria-checked={reason === r.value}
                tabIndex={reason === r.value || (!reason && k === 0) ? 0 : -1}
                onClick={() => {
                  setReason(r.value);
                  setErrReason(null);
                }}
              >
                <span className={s.dot} />
                <span>
                  {r.label}
                  <small className={s.desc}>{r.desc}</small>
                </span>
              </button>
            ))}
          </div>
          {errReason ? (
            <span className={f.message} role="alert">
              {errReason}
            </span>
          ) : null}
          <TextAreaField
            label="تفاصيل"
            required={reason === "other"}
            optional={reason !== "other"}
            value={text}
            onChange={(v) => {
              setText(v);
              if (v.trim()) setErrText(null);
            }}
            maxLength={LIMITS.otherReason}
            counter="near-limit"
            error={errText}
          />
          <div className={s.actions}>
            <button type="button" className={`${s.btn} ${s.danger}`} onClick={submit}>
              إرجاع إلى «لم تدخل»
            </button>
            <button type="button" className={s.btn} slot="close" onClick={() => (reset(), p.onCancel())}>
              إلغاء
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
