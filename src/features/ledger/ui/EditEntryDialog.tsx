import { useState } from "react";
import { Link } from "react-router";
import { Checkbox } from "../../../shared/fields/components/Checkbox";
import { DateField } from "../../../shared/fields/components/DateField";
import { DebitCreditBar } from "../../../shared/fields/components/DebitCreditBar";
import { RefField, RefNumberOutput } from "../../../shared/fields/components/RefField";
import { Segment } from "../../../shared/fields/components/Segment";
import { TextAreaField } from "../../../shared/fields/components/TextAreaField";
import { VoucherField } from "../../../shared/fields/components/VoucherField";
import { formatDate, todayInRiyadh, type IsoDate } from "../../../shared/fields/core/date";
import { normalizeRef } from "../../../shared/fields/core/ref";
import { LIMITS } from "../../../shared/fields/core/text";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import {
  changesOf,
  EDIT_REASON_MAX,
  editedRefNo,
  formFromEntry,
  patchOf,
  validateEdit,
  type EditErrors,
  type EditForm,
} from "../core/editEntry";
import type { LedgerEntry } from "../core/ledger";
import type { IssueItem } from "../core/review";
import { updateEntry } from "../data/editRepo";
import { EntrySaveError, findRefPlaces } from "../data/entriesRepo";
import { ReasonText } from "./ReasonText";
import { readError } from "./useLedgerData";
import s from "./EditEntry.module.css";

export interface EditTarget {
  entry: LedgerEntry;
  supplierName: string;
  /** سياق المراجعة إن فُتحت النافذة من مركز المراجعة */
  issueId: string | null;
  sheetRow: number | null;
  reasons: IssueItem[];
  suggestedDate: IsoDate | null;
}

const KIND_AR = { inv: "فاتورة", misc: "قيد", note: "ملاحظة", untyped: "بلا نوع" } as const;

/**
 * نافذة تعديل الحركة (الخيار أ المعتمد في proposals/2026-10-11-edit-entry.html): وسطى على الحاسوب
 * واللوحي، ولوحة سفلية على الجوال. سبب التعديل إلزامي، وتعليم سجل المراجعة «تمت المراجعة» بخيار صريح.
 */
export function EditEntryDialog(p: {
  target: EditTarget | null;
  uid: string;
  lockedThrough: IsoDate | null;
  /** المالك: يُرشد إلى فتح القفل مؤقتاً (DECISIONS 2026-10-11، الخيار ب) */
  canUnlock: boolean;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  return (
    <Dialog isOpen={p.target !== null} wide title="تعديل الحركة" onDismiss={p.onClose}>
      {p.target ? (
        <EditBody
          key={p.target.entry.id}
          target={p.target}
          uid={p.uid}
          lockedThrough={p.lockedThrough}
          canUnlock={p.canUnlock}
          onClose={p.onClose}
          onSaved={p.onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function EditBody(p: {
  target: EditTarget;
  uid: string;
  lockedThrough: IsoDate | null;
  canUnlock: boolean;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const { entry: orig, supplierName } = p.target;
  const today = todayInRiyadh();
  const [f, setF] = useState<EditForm>(() => formFromEntry(orig));
  const [errors, setErrors] = useState<EditErrors>({});
  const [resolve, setResolve] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // تعديل الحقل يزيل خطأه حتى المحاولة التالية
  const set = <K extends keyof EditForm>(k: K, v: EditForm[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    const key = (k === "dupConfirmed" || k === "dupReason" ? "dup" : k) as keyof EditErrors;
    setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([x]) => x !== key)) : e));
  };
  const financial = f.kind === "inv" || f.kind === "misc";
  const refNo = editedRefNo(orig, f);
  const refChanged = financial && refNo !== orig.refNo;
  const changes = changesOf(orig, f);
  const lockedNow = Boolean(p.lockedThrough && orig.date <= p.lockedThrough);

  /** فحص تكرار الرقم الجديد في كل الموردين، دون الحركة نفسها. */
  const checkDup = async (form: EditForm): Promise<EditForm | null> => {
    const no = editedRefNo(orig, form);
    if (!(form.kind === "inv" || form.kind === "misc") || no === orig.refNo || !normalizeRef(form.ref))
      return { ...form, dupOf: null };
    setChecking(true);
    try {
      const places = (await findRefPlaces(no)).filter((x) => x.entryId !== orig.id);
      const next = { ...form, dupOf: places.length ? places.map((x) => x.supplierName) : null };
      setF((x) => ({ ...x, dupOf: next.dupOf }));
      return next;
    } catch (e) {
      setFailure(readError(e, "فحص تكرار الرقم المرجعي"));
      return null;
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    setFailure(null);
    const checked = await checkDup(f);
    if (!checked) return;
    const e = validateEdit(orig, checked, p.lockedThrough);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await updateEntry(p.uid, orig, patchOf(orig, checked), {
        supplierName,
        reason: checked.reason.trim(),
        dupReason: checked.dupOf?.length ? checked.dupReason.trim() : null,
        resolveIssueId: resolve ? p.target.issueId : null,
      });
      p.onSaved(
        `حُفظ تعديل حركة ${supplierName}${refNo ? ` (${refNo})` : ""} وسُجّل في التدقيق${
          resolve && p.target.issueId ? "، وأُغلق سجل المراجعة" : ""
        }.`,
      );
    } catch (err) {
      setFailure(
        err instanceof EntrySaveError
          ? err.message
          : (err as { code?: string }).code === "permission-denied"
            ? "رفضت القواعد التعديل: قد تكون الحركة أو التاريخ الجديد في فترة مقفلة، أو لا صلاحية لك."
            : readError(err, "حفظ التعديل"),
      );
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || checking;
  return (
    <form
      className={s.form}
      noValidate
      aria-label="تعديل الحركة"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className={d.sub}>
        {supplierName} · {KIND_AR[orig.kind]}
        {orig.refNo ? (
          <>
            {" "}
            <span className="num">{orig.refNo}</span>
          </>
        ) : null}
        {p.target.sheetRow ? (
          <>
            {" "}
            · الصف <span className="num">{p.target.sheetRow}</span> في الإكسل
          </>
        ) : null}
      </p>

      {p.target.reasons.length ? (
        <div className={s.issue}>
          <b>سبب المراجعة:</b>{" "}
          {p.target.reasons.map((x, i) => (
            <span key={x.code + i}>
              {i ? "؛ " : ""}
              <ReasonText text={x.text || x.code} />
            </span>
          ))}
          {p.target.suggestedDate && f.date !== p.target.suggestedDate ? (
            <Button size="sm" onClick={() => set("date", p.target.suggestedDate)} disabled={busy}>
              استعمال المرجّح {formatDate(p.target.suggestedDate)}
            </Button>
          ) : null}
        </div>
      ) : null}

      {lockedNow ? (
        <Banner tone="err">
          الحركة بتاريخ {formatDate(orig.date)} داخل الفترة المقفلة حتى {formatDate(p.lockedThrough ?? "")}؛
          القواعد تمنع تعديلها.
          {p.canUnlock ? (
            <>
              {" "}
              <Link to="/lock">افتح القفل مؤقتاً من «قفل الفترات»</Link> ثم عد إلى هذه الحركة.
            </>
          ) : (
            " يفتحها المالك مؤقتاً من «قفل الفترات»."
          )}
        </Banner>
      ) : null}

      <div className={s.grid}>
        {orig.kind !== "note" ? (
          <div className={s.full}>
            {/* «بلا نوع» لا خيار له: المنقول يُصنَّف فاتورة أو قيداً */}
            <Segment<"inv" | "misc" | "">
              label="النوع"
              value={financial ? (f.kind as "inv" | "misc") : ""}
              disabled={busy || lockedNow}
              onChange={(k) => {
                if (!k) return;
                set("kind", k);
                set("dupOf", null);
                set("dupConfirmed", false);
              }}
              options={[
                { value: "inv", label: "فاتورة" },
                { value: "misc", label: "قيد" },
              ]}
            />
            {errors.kind ? (
              <p className={s.err} role="alert">
                {errors.kind}
              </p>
            ) : null}
          </div>
        ) : null}
        <div>
          <DateField
            value={f.date}
            onChange={(v) => {
              set("date", v);
              set("dupOf", null);
            }}
            today={today}
            lockedThrough={p.lockedThrough}
            required
            disabled={busy || lockedNow}
            error={errors.date}
          />
        </div>
        {financial ? (
          <>
            <div>
              <RefField
                kind={f.kind as "inv" | "misc"}
                value={f.ref}
                onChange={(v) => {
                  set("ref", v);
                  set("dupOf", null);
                  set("dupConfirmed", false);
                }}
                onBlurCheck={() => void checkDup(f)}
                duplicateOf={f.dupOf?.length ? [...new Set(f.dupOf)].join("، ") : null}
                required
                disabled={busy || lockedNow}
                error={errors.ref}
              />
              <RefNumberOutput value={refNo} duplicate={Boolean(f.dupOf?.length)} />
            </div>
            <div className={s.full}>
              <DebitCreditBar
                kind={f.kind as "inv" | "misc"}
                reversed={f.reversed}
                onReversedChange={(r) => set("reversed", r)}
                value={f.amount}
                onChange={(v) => set("amount", v)}
                disabled={busy || lockedNow}
                error={errors.amount}
              />
            </div>
            <div>
              <VoucherField
                value={f.voucher}
                onChange={(v) => set("voucher", v)}
                disabled={busy || lockedNow}
                error={errors.voucher}
              />
            </div>
            <div className={s.full}>
              <TextAreaField
                label="التفاصيل"
                optional
                value={f.details}
                onChange={(v) => set("details", v)}
                maxLength={LIMITS.details}
                counter="near-limit"
                disabled={busy || lockedNow}
                error={errors.details}
              />
            </div>
          </>
        ) : f.kind === "note" ? (
          <div className={s.full}>
            <TextAreaField
              label="نص الملاحظة"
              required
              value={f.note}
              onChange={(v) => set("note", v)}
              maxLength={LIMITS.note}
              counter="near-limit"
              disabled={busy || lockedNow}
              error={errors.note}
            />
          </div>
        ) : null}
      </div>

      {refChanged && f.dupOf?.length ? (
        <div className={s.dup} role="group" aria-label="تحذير التكرار">
          <p>
            <b>تحذير صارم:</b> الرقم <span className="num">{refNo}</span> مسجّل مسبقاً لـ{" "}
            {[...new Set(f.dupOf)].join("، ")}.
          </p>
          <Checkbox checked={f.dupConfirmed} danger disabled={busy} onChange={(v) => set("dupConfirmed", v)}>
            أؤكد أنها حركة مختلفة
          </Checkbox>
          {f.dupConfirmed ? (
            <TextAreaField
              label="سبب تسجيل رقم مكرر"
              required
              value={f.dupReason}
              onChange={(v) => set("dupReason", v)}
              maxLength={EDIT_REASON_MAX}
              counter="near-limit"
              error={errors.dup}
            />
          ) : errors.dup ? (
            <p className={s.err} role="alert">
              {errors.dup}
            </p>
          ) : null}
        </div>
      ) : null}

      <TextAreaField
        label="سبب التعديل (يُحفظ في التدقيق)"
        required
        value={f.reason}
        onChange={(v) => set("reason", v)}
        maxLength={EDIT_REASON_MAX}
        counter="near-limit"
        disabled={busy || lockedNow}
        error={errors.reason}
      />

      <div>
        <h3 className={s.h3}>التغييرات</h3>
        {changes.length ? (
          <ul className={s.diff} aria-label="التغييرات">
            {changes.map((c) => (
              <li key={c.field}>
                <span>{c.label}:</span>
                <del>{c.from}</del>
                <span aria-hidden="true">←</span>
                <ins>{c.to}</ins>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.none}>لا تغيير بعد.</p>
        )}
      </div>

      {p.target.issueId ? (
        <Checkbox checked={resolve} disabled={busy || lockedNow} onChange={setResolve}>
          تعليم سجل المراجعة «تمت المراجعة» بعد الحفظ
        </Checkbox>
      ) : null}

      {errors.form ? <Banner tone="err">{errors.form}</Banner> : null}
      {failure ? <Banner tone="err">{failure}</Banner> : null}

      <div className={d.actions}>
        <Button type="submit" variant="primary" busy={busy} disabled={lockedNow}>
          حفظ التعديل
        </Button>
        <Button variant="ghost" disabled={saving} onClick={p.onClose}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
