import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Checkbox } from "../../../shared/fields/components/Checkbox";
import { TextAreaField } from "../../../shared/fields/components/TextAreaField";
import { formatDate, type IsoDate } from "../../../shared/fields/core/date";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import {
  balanceEffect,
  DELETE_REASON_MAX,
  DELETE_REASONS,
  validateDeletion,
  type DeleteErrors,
  type DeleteForm,
  type DeleteMode,
  type Deletion,
} from "../core/deleteEntry";
import { formatMoney, kindLabel, type LedgerEntry } from "../core/ledger";
import { restoreEntry, softDeleteEntry } from "../data/deleteRepo";
import { EntrySaveError, findRefPlaces } from "../data/entriesRepo";
import { readError } from "./useLedgerData";
import s from "./DeleteEntry.module.css";

export interface DeleteTarget {
  mode: DeleteMode;
  entry: LedgerEntry;
  supplierName: string;
  /** بيانات الحذف السابقة (للاسترجاع) */
  deletion: Deletion | null;
}

/**
 * نافذة الحذف الناعم والاسترجاع (الخيار أ المعتمد في proposals/2026-10-11-soft-delete.html):
 * للمالك وحده، بسبب إلزامي يُحفظ في التدقيق. وسطى على الحاسوب، ولوحة سفلية على الجوال.
 */
export function DeleteEntryDialog(p: {
  target: DeleteTarget | null;
  uid: string;
  lockedThrough: IsoDate | null;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const mode = p.target?.mode ?? "delete";
  return (
    <Dialog
      isOpen={p.target !== null}
      tone={mode === "delete" ? "warn" : "default"}
      title={mode === "delete" ? "حذف الحركة" : "استرجاع الحركة"}
      onDismiss={p.onClose}
    >
      {p.target ? (
        <DeleteBody
          key={`${p.target.mode}|${p.target.entry.id}`}
          target={p.target}
          uid={p.uid}
          lockedThrough={p.lockedThrough}
          onClose={p.onClose}
          onDone={p.onDone}
        />
      ) : null}
    </Dialog>
  );
}

function DeleteBody(p: {
  target: DeleteTarget;
  uid: string;
  lockedThrough: IsoDate | null;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { mode, entry, supplierName, deletion } = p.target;
  const [f, setF] = useState<DeleteForm>({ reason: "", dupOf: [], dupConfirmed: false, dupReason: "" });
  const [errors, setErrors] = useState<DeleteErrors>({});
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(mode === "restore" && Boolean(entry.refNo));
  const [failure, setFailure] = useState<string | null>(null);
  const k = kindLabel(entry);
  const amount = entry.debit || entry.credit;
  const effect = balanceEffect(mode, entry);
  const locked = Boolean(p.lockedThrough && entry.date <= p.lockedThrough);
  const verb = mode === "delete" ? "حذف" : "استرجاع";

  // الاسترجاع: هل استُعمل الرقم لحركة أخرى بعد الحذف؟
  useEffect(() => {
    if (mode !== "restore" || !entry.refNo || entry.kind === "note" || entry.kind === "untyped") return;
    let alive = true;
    findRefPlaces(entry.refNo)
      .then((places) => {
        if (!alive) return;
        setF((x) => ({
          ...x,
          dupOf: places.filter((pl) => pl.entryId !== entry.id).map((pl) => pl.supplierName),
        }));
      })
      .catch((e: unknown) => {
        if (alive) setFailure(readError(e, "فحص الرقم المرجعي"));
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [mode, entry.id, entry.refNo, entry.kind]);

  const set = <K extends keyof DeleteForm>(key: K, v: DeleteForm[K]) => {
    setF((x) => ({ ...x, [key]: v }));
    const ek = key === "reason" ? "reason" : "dup";
    setErrors((e) => (ek in e ? Object.fromEntries(Object.entries(e).filter(([x]) => x !== ek)) : e));
  };

  const submit = async () => {
    setFailure(null);
    const e = validateDeletion(mode, entry, f, p.lockedThrough);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const reason = f.reason.trim();
      if (mode === "delete") await softDeleteEntry(p.uid, entry, reason);
      else
        await restoreEntry(p.uid, entry, {
          supplierName,
          reason,
          dupReason: f.dupOf.length ? f.dupReason.trim() : null,
        });
      const name = entry.refNo || formatDate(entry.date);
      p.onDone(
        mode === "delete"
          ? `حُذفت حركة ${name} وخرجت من الرصيد، وسُجّل السبب في التدقيق.${entry.refNo ? " تحرر رقمها المرجعي." : ""}`
          : `استُرجعت حركة ${name} وعادت إلى الرصيد.`,
      );
    } catch (err) {
      setFailure(
        err instanceof EntrySaveError
          ? err.message
          : (err as { code?: string }).code === "permission-denied"
            ? `رفضت القواعد ال${verb}: قد تكون الحركة في فترة مقفلة، أو لا صلاحية لك (ال${verb} للمالك وحده).`
            : readError(err, `${verb} الحركة`),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={s.form}
      noValidate
      aria-label={`${verb} الحركة`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className={`${s.sum} ${mode === "restore" ? s.restore : ""}`}>
        <p>
          {supplierName} · {k.label}
          {k.tag ? ` (${k.tag})` : ""}
          {entry.refNo ? (
            <>
              {" "}
              <span className="num">{entry.refNo}</span>
            </>
          ) : null}{" "}
          · <span className="num">{formatDate(entry.date)}</span>
        </p>
        {entry.kind !== "note" ? (
          <p>
            المبلغ <b className="num">{formatMoney(amount)}</b>
            {effect ? (
              <>
                {" "}
                · رصيد المورد {effect > 0 ? "يزيد" : "ينقص"} بـ{" "}
                <b className="num">{formatMoney(Math.abs(effect))}</b>
              </>
            ) : null}
          </p>
        ) : (
          <p>ملاحظة لا تؤثر على الرصيد.</p>
        )}
        {mode === "restore" && deletion ? (
          <p>
            حُذفت
            {deletion.at ? (
              <>
                {" "}
                في <span className="num">{formatDate(isoOf(deletion.at))}</span>
              </>
            ) : null}
            : {deletion.reason}
          </p>
        ) : null}
      </div>

      {locked ? (
        <Banner tone="err">
          الحركة داخل الفترة المقفلة حتى {formatDate(p.lockedThrough ?? "")}؛ القواعد تمنع {verb}ها.{" "}
          <Link to="/lock">افتح القفل مؤقتاً من «قفل الفترات»</Link> ثم عد إليها.
        </Banner>
      ) : null}

      {mode === "restore" && f.dupOf.length ? (
        <div className={s.dup} role="group" aria-label="تحذير التكرار">
          <p>
            <b>تحذير صارم:</b> الرقم <span className="num">{entry.refNo}</span> استُعمل بعد الحذف لـ{" "}
            {[...new Set(f.dupOf)].join("، ")}.
          </p>
          <Checkbox checked={f.dupConfirmed} danger disabled={busy} onChange={(v) => set("dupConfirmed", v)}>
            أؤكد أنهما حركتان مختلفتان
          </Checkbox>
          {f.dupConfirmed ? (
            <TextAreaField
              label="سبب تسجيل رقم مكرر"
              required
              value={f.dupReason}
              onChange={(v) => set("dupReason", v)}
              maxLength={DELETE_REASON_MAX}
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

      {mode === "delete" ? (
        <div className={s.chips} role="group" aria-label="أسباب جاهزة">
          {DELETE_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              className={s.chip}
              aria-pressed={f.reason.trim() === r}
              disabled={busy || locked}
              onClick={() => set("reason", r)}
            >
              {r}
            </button>
          ))}
        </div>
      ) : null}
      <TextAreaField
        label={`سبب ال${verb} (يُحفظ في التدقيق)`}
        required
        value={f.reason}
        onChange={(v) => set("reason", v)}
        maxLength={DELETE_REASON_MAX}
        counter="near-limit"
        disabled={busy || locked}
        error={errors.reason}
      />
      <p className={d.sub}>
        {mode === "delete"
          ? "تبقى الحركة في النظام ويمكن استرجاعها من الكشف بخيار «إظهار المحذوف»."
          : "تعود الحركة كما كانت وتدخل في الرصيد والتقارير."}
      </p>

      {errors.form ? <Banner tone="err">{errors.form}</Banner> : null}
      {failure ? <Banner tone="err">{failure}</Banner> : null}

      <div className={d.actions}>
        <Button
          type="submit"
          variant={mode === "delete" ? "danger" : "primary"}
          busy={busy || checking}
          disabled={locked}
        >
          {verb}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={p.onClose}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

/** وقت الحذف إلى تاريخ الرياض */
function isoOf(ms: number): IsoDate {
  return new Date(ms + 3 * 3600 * 1000).toISOString().slice(0, 10);
}
