import { useState, type ReactNode } from "react";
import { Checkbox } from "../../../shared/fields/components/Checkbox";
import { Segment } from "../../../shared/fields/components/Segment";
import { DAY_NAMES, formatDate, weekday } from "../../../shared/fields/core/date";
import { normalizeDigits } from "../../../shared/fields/core/digits";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import { Riyal } from "../../../shared/ui/Icon";
import {
  cleanTypedAmount,
  FIELD_ORDER,
  isBlank,
  type BatchField,
  type BatchKind,
  type BatchRow,
  type RowCheck,
} from "../core/batch";
import m from "./QuickEntryMobile.module.css";

type CellField = Exclude<BatchField, "dup">;
type Outcome = { tone: "ok" | "err" | "info"; text: string };

export interface QuickMobileProps {
  view: BatchRow[];
  checks: RowCheck[];
  /** أرقام فُحصت مقابل المحفوظ */
  saved: Map<string, string[]>;
  lastRef: Record<BatchKind, string | null>;
  disabled: boolean;
  progress: { done: number; of: number } | null;
  outcome: Outcome | null;
  shown: (key: string, f: string) => boolean;
  update: (key: string, patch: Partial<BatchRow>) => void;
  touch: (key: string, f: string) => void;
  commitDate: (i: number) => void;
  commitAmount: (i: number) => void;
  /** يضيف صفاً بعد الصف المحدد يرث تاريخه ونوعه، ويعيد مفتاحه */
  addRow: (afterIndex: number) => string;
  removeRow: (key: string) => void;
  register: (id: string, el: HTMLElement | null) => void;
  focus: (id: string) => void;
  save: () => Promise<boolean>;
  paste: {
    text: string;
    setText: (t: string) => void;
    preview: BatchRow[] | null;
    previewChecks: RowCheck[];
    parse: (t: string) => void;
    accept: () => void;
    cancel: () => void;
  };
}

type RowState = "ready" | "bad" | "dup" | "checking" | "blank";

function rowState(r: BatchRow, c: RowCheck | undefined, saved: Map<string, string[]>): RowState {
  if (isBlank(r) || !c) return "blank";
  if (Object.keys(c.errors).some((k) => k !== "dup")) return "bad";
  if (c.errors.dup) return "dup";
  if (c.refNo && !saved.has(c.refNo)) return "checking";
  return "ready";
}

const STATE_TEXT: Record<RowState, string> = {
  ready: "✓ جاهز",
  bad: "✗ فيه أخطاء",
  dup: "⚠ مكرر ينتظر تأكيداً",
  checking: "… يُفحص",
  blank: "— فارغ",
};

/**
 * الإدخال السريع على الجوال (الخيار ج المعتمد في proposals/2026-10-11-quick-entry-mobile.html):
 * صف واحد بملء الشاشة بحقول كبيرة، «التالي» يفتح الصف التالي، ومراجعة الدفعة كلها قبل الحفظ.
 * الحالة والتحقق والحفظ من الصفحة نفسها، فالقواعد واحدة مع الجدول.
 */
export function QuickEntryMobile(p: QuickMobileProps) {
  const { view, checks } = p;
  const [curKey, setCurKey] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  const found = view.findIndex((r) => r.key === curKey);
  const i = found >= 0 ? found : view.length - 1;
  const r = view[i];
  const c = checks[i];
  const states = view.map((x, k) => rowState(x, checks[k], p.saved));
  const filled = states.filter((x) => x !== "blank").length;
  const ready = states.filter((x) => x === "ready").length;

  const touchAll = (key: string) => FIELD_ORDER.forEach((f) => p.touch(key, f));
  const goTo = (k: number) => {
    const row = view[k];
    if (row) setCurKey(row.key);
    setReview(false);
  };
  const next = () => {
    if (!r) return;
    touchAll(r.key);
    const after = view[i + 1];
    const key = after ? after.key : p.addRow(i);
    setCurKey(key);
    p.focus(`${key}:amount`);
  };
  const save = async () => {
    if (await p.save()) {
      setReview(false);
      setCurKey(null);
    }
  };

  const top = (title: ReactNode) => (
    <div className={m.top}>
      <h2 className={m.title}>{title}</h2>
      <Button size="sm" variant="ghost" disabled={p.disabled} onClick={() => setPasteOpen(true)}>
        لصق من الإكسل
      </Button>
    </div>
  );
  const bars = (
    <div className={m.prog} aria-hidden="true">
      {states.map((st, k) => (
        <i
          key={view[k]?.key}
          className={`${m[st]} ${k === i && !review ? m.cur : ""}`}
          title={`الصف ${k + 1}`}
        />
      ))}
    </div>
  );
  const outcome = p.outcome ? (
    <div className={m.outcome}>
      <Banner tone={p.outcome.tone}>{p.outcome.text}</Banner>
    </div>
  ) : null;

  const pasteDialog = (
    <Dialog
      isOpen={pasteOpen}
      title="اللصق من الإكسل"
      onDismiss={() => {
        setPasteOpen(false);
        p.paste.cancel();
      }}
    >
      <p className={d.sub}>
        انسخ 5 أعمدة بالترتيب: التاريخ، المرجع، المبلغ، البيان، النوع (فاتورة/قيد/ف/ق)، ثم الصقها هنا.
      </p>
      <textarea
        className={m.pz}
        rows={4}
        aria-label="الصق الأعمدة هنا"
        value={p.paste.text}
        onChange={(e) => p.paste.setText(e.target.value)}
        onPaste={(e) => {
          e.preventDefault();
          const t = e.clipboardData.getData("text");
          p.paste.setText(t);
          p.paste.parse(t);
        }}
        onBlur={() => {
          if (p.paste.text.trim() && !p.paste.preview) p.paste.parse(p.paste.text);
        }}
      />
      {p.paste.preview ? (
        <ol className={m.list} aria-label="معاينة اللصق">
          {p.paste.preview.map((x, k) => {
            const pc = p.paste.previewChecks[k];
            const st = rowState(x, pc, p.saved);
            const err = Object.entries(pc?.errors ?? {}).find(([f]) => f !== "dup")?.[1];
            return (
              <li key={x.key} className={m.line}>
                <span className={m.lineMain}>
                  <b className="num">{pc?.refNo || x.ref || "—"}</b>
                  <span className={m.d}>{x.details || "—"}</span>
                </span>
                <span className={m.lineEnd}>
                  <span className="num">{x.amountRaw}</span>
                  <span className={`${m.st} ${m[`t_${st}`]}`}>{err ? `✗ ${err}` : STATE_TEXT[st]}</span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className={d.actions}>
        <Button
          variant="primary"
          disabled={!p.paste.preview}
          onClick={() => {
            p.paste.accept();
            setPasteOpen(false);
            setReview(true);
          }}
        >
          نقل إلى الدفعة ({p.paste.preview?.length ?? 0})
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setPasteOpen(false);
            p.paste.cancel();
          }}
        >
          إلغاء
        </Button>
      </div>
    </Dialog>
  );

  if (review || !r || !c) {
    const rows = view.map((x, k) => ({ x, k })).filter(({ k }) => states[k] !== "blank");
    return (
      <section className={m.wrap} aria-label="الإدخال السريع على الجوال">
        {top("مراجعة الدفعة")}
        {bars}
        {outcome}
        {rows.length ? (
          <ol className={m.list} aria-label="صفوف الدفعة للمراجعة">
            {rows.map(({ x, k }) => {
              const ck = checks[k];
              const st = states[k] ?? "blank";
              return (
                <li key={x.key}>
                  <button
                    type="button"
                    className={`${m.line} ${m.lineBtn}`}
                    onClick={() => goTo(k)}
                    aria-label={`الصف ${k + 1}: ${ck?.refNo || "بلا مرجع"}، ${STATE_TEXT[st]}، اضغط للتعديل`}
                  >
                    <span className={m.lineMain}>
                      <b className="num">{ck?.refNo || "—"}</b>
                      <span className={m.d}>
                        <span className="num">{ck?.date ? formatDate(ck.date) : x.dateRaw}</span> ·{" "}
                        {x.details || "—"}
                      </span>
                    </span>
                    <span className={m.lineEnd}>
                      <span className="num">{x.amountRaw || "—"}</span>
                      <span className={`${m.st} ${m[`t_${st}`]}`}>{STATE_TEXT[st]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={m.empty}>الدفعة فارغة: ارجع واكتب صفاً واحداً على الأقل.</p>
        )}
        <Button wide variant="ghost" onClick={() => goTo(i)}>
          رجوع للتعديل
        </Button>
        <div className={m.bar}>
          <span className={m.cnt}>
            <b className="num">{ready}</b> جاهز من <b className="num">{filled}</b>
          </span>
          <Button
            variant="primary"
            busy={p.progress !== null}
            disabled={p.disabled && !p.progress}
            onClick={() => void save()}
          >
            حفظ الدفعة ({filled})
          </Button>
          <span className={m.status} role="status">
            {p.progress ? `جارٍ الحفظ: ${p.progress.done} من ${p.progress.of}…` : ""}
          </span>
        </div>
        {pasteDialog}
      </section>
    );
  }

  const n = i + 1;
  const credit = (r.type === "inv") !== r.reversed;
  const err = (f: BatchField) => (p.shown(r.key, f) ? c.errors[f] : undefined);
  const input = (
    f: CellField,
    value: string,
    label: string,
    opts: { num?: boolean; big?: boolean; im?: "decimal" | "numeric" | "text"; hint?: ReactNode },
  ) => {
    const e = err(f);
    const id = `qm-${r.key}-${f}`;
    return (
      <div className={m.field}>
        <label className={m.fl} htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          ref={(el) => p.register(`${r.key}:${f}`, el)}
          className={`${m.in} ${opts.num ? "num" : ""} ${opts.big ? m.big : ""} ${e ? m.badIn : ""}`}
          value={value}
          inputMode={opts.im}
          enterKeyHint={f === "details" ? "next" : undefined}
          disabled={p.disabled}
          aria-label={`${label} الصف ${n}`}
          aria-invalid={e ? true : undefined}
          aria-describedby={e ? `${id}-e` : undefined}
          onChange={(ev) => {
            const v = ev.target.value;
            if (f === "date") p.update(r.key, { dateRaw: v });
            else if (f === "ref") p.update(r.key, { ref: v, refAuto: false });
            else if (f === "voucher")
              p.update(r.key, { voucher: normalizeDigits(v).replace(/\D/g, "").slice(0, 12) });
            else if (f === "amount") p.update(r.key, { amountRaw: cleanTypedAmount(v) });
            else p.update(r.key, { details: v.slice(0, 200) });
          }}
          onBlur={() =>
            f === "date" ? p.commitDate(i) : f === "amount" ? p.commitAmount(i) : p.touch(r.key, f)
          }
        />
        {e ? (
          <span className={m.err} id={`${id}-e`}>
            {e}
          </span>
        ) : opts.hint ? (
          <span className={m.hint}>{opts.hint}</span>
        ) : null}
      </div>
    );
  };

  return (
    <section className={m.wrap} aria-label="الإدخال السريع على الجوال">
      {top(
        <>
          الصف <span className="num">{n}</span> من <span className="num">{view.length}</span>
        </>,
      )}
      {bars}
      {outcome}
      <div className={m.step}>
        <Segment
          label="النوع"
          value={r.type}
          disabled={p.disabled}
          onChange={(t) => p.update(r.key, { type: t, reversed: false, refAuto: true })}
          options={[
            { value: "inv", label: "فاتورة" },
            { value: "misc", label: "قيد" },
          ]}
        />
        <Checkbox
          checked={r.reversed}
          disabled={p.disabled}
          onChange={(v) => p.update(r.key, { reversed: v })}
        >
          عكس الاتجاه ({r.type === "inv" ? "مرتجع" : "استرداد"})
        </Checkbox>
        {input("date", r.dateRaw, "التاريخ", {
          num: true,
          big: true,
          im: "decimal",
          hint: c.date ? (
            <>
              {DAY_NAMES[weekday(c.date)]} <span className="num">{formatDate(c.date)}</span>
            </>
          ) : (
            "يوماً ثم شهراً: 15 أو 1508 أو +1"
          ),
        })}
        {c.warning ? <p className={m.warn}>تنبيه: {c.warning}</p> : null}
        {input("ref", r.ref, "المرجع", {
          num: true,
          big: true,
          im: "numeric",
          hint: (
            <>
              {r.refAuto && r.ref ? "مقترح · " : ""}الرقم المرجعي <b className="num">{c.refNo || "—"}</b>
              {!r.ref ? (
                <>
                  {" "}
                  · آخر {r.type === "inv" ? "فاتورة" : "قيد"}{" "}
                  <span className="num">{p.lastRef[r.type] ?? "—"}</span>
                </>
              ) : null}
            </>
          ),
        })}
        {c.dupOf ? (
          <div className={m.dupbox}>
            <p>
              <b>تحذير صارم:</b> الرقم <span className="num">{c.refNo}</span> مسجّل مسبقاً لـ{" "}
              {[...new Set(c.dupOf)].join("، ")}.
            </p>
            <Checkbox
              checked={r.dupConfirmed}
              danger
              disabled={p.disabled}
              onChange={(v) => p.update(r.key, { dupConfirmed: v })}
            >
              أؤكد أنها حركة مختلفة
            </Checkbox>
            <input
              className={`${m.in} ${err("dup") ? m.badIn : ""}`}
              value={r.dupReason}
              maxLength={300}
              disabled={p.disabled || !r.dupConfirmed}
              placeholder="السبب (إلزامي)"
              aria-label={`سبب تأكيد التكرار الصف ${n}`}
              onChange={(e) => p.update(r.key, { dupReason: e.target.value })}
            />
            {err("dup") ? <span className={m.err}>{c.errors.dup}</span> : null}
          </div>
        ) : null}
        {input("amount", r.amountRaw, credit ? "دائن" : "مدين", {
          num: true,
          big: true,
          im: "decimal",
          hint: (
            <>
              بالريال <Riyal className={m.sar} />
            </>
          ),
        })}
        {input("voucher", r.voucher, "السند (اختياري)", { num: true, im: "numeric" })}
        {input("details", r.details, "التفاصيل", {})}

        <div className={m.nav}>
          <Button disabled={i === 0} onClick={() => goTo(i - 1)}>
            السابق
          </Button>
          <Button variant="primary" disabled={p.disabled} onClick={next}>
            {view[i + 1] ? "التالي" : "التالي (صف جديد)"}
          </Button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={p.disabled}
          onClick={() => {
            const stay = view[i + 1] ?? view[i - 1];
            setCurKey(stay?.key ?? null);
            p.removeRow(r.key);
          }}
        >
          حذف هذا الصف
        </Button>
      </div>
      <div className={m.bar}>
        <span className={m.cnt}>
          <b className="num">{ready}</b> جاهز من <b className="num">{filled}</b>
        </span>
        <Button
          onClick={() => {
            touchAll(r.key);
            setReview(true);
          }}
        >
          مراجعة وحفظ
        </Button>
      </div>
      {pasteDialog}
    </section>
  );
}
