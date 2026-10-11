import { useState } from "react";
import { MONTH_NAMES, splitIso, toIso, type IsoDate } from "../core";
import { Icon } from "../../ui/Icon";
import { DateField } from "./DateField";
import { Segment } from "./Segment";
import f from "./Field.module.css";
import s from "./PeriodFilter.module.css";

export type PeriodKind = "year" | "quarter" | "month" | "custom";
export type Period = { kind: PeriodKind; from: IsoDate; to: IsoDate };

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** فترة قادمة من خارج المكوّن (مثل حالة التنقل): تُقبل فقط إن كانت سليمة الشكل، وإلا null. */
export function asPeriod(x: unknown): Period | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const kinds: PeriodKind[] = ["year", "quarter", "month", "custom"];
  if (!kinds.includes(o.kind as PeriodKind)) return null;
  if (typeof o.from !== "string" || typeof o.to !== "string") return null;
  if (!ISO.test(o.from) || !ISO.test(o.to) || o.from > o.to) return null;
  return { kind: o.kind as PeriodKind, from: o.from, to: o.to };
}

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function periodFor(kind: Exclude<PeriodKind, "custom">, y: number, n: number): Period {
  if (kind === "year") return { kind, from: toIso(y, 1, 1), to: toIso(y, 12, 31) };
  if (kind === "quarter") {
    const m1 = (n - 1) * 3 + 1;
    return { kind, from: toIso(y, m1, 1), to: toIso(y, m1 + 2, lastDay(y, m1 + 2)) };
  }
  return { kind, from: toIso(y, n, 1), to: toIso(y, n, lastDay(y, n)) };
}

/** فلتر الفترة الموحّد (SPEC «الفلترة»): سنة / ربع / شهر / من–إلى. «إلى» قبل «من» مرفوض. */
export function PeriodFilter(p: { value: Period; onChange: (v: Period) => void; today: IsoDate }) {
  const { y: fy, m: fm } = splitIso(p.value.from);
  const [from, setFrom] = useState<IsoDate | null>(p.value.from);
  const [to, setTo] = useState<IsoDate | null>(p.value.to);
  const [err, setErr] = useState<string | null>(null);
  const q = Math.floor((fm - 1) / 3) + 1;

  const switchKind = (k: PeriodKind) => {
    if (k === "custom") return p.onChange({ ...p.value, kind: "custom" });
    p.onChange(periodFor(k, fy, k === "quarter" ? q : fm));
  };
  const step = (dir: 1 | -1) => {
    const k = p.value.kind;
    if (k === "year") p.onChange(periodFor("year", fy + dir, 1));
    else if (k === "quarter") {
      const n = q + dir;
      p.onChange(periodFor("quarter", n < 1 ? fy - 1 : n > 4 ? fy + 1 : fy, n < 1 ? 4 : n > 4 ? 1 : n));
    } else if (k === "month") {
      const n = fm + dir;
      p.onChange(periodFor("month", n < 1 ? fy - 1 : n > 12 ? fy + 1 : fy, n < 1 ? 12 : n > 12 ? 1 : n));
    }
  };
  const label =
    p.value.kind === "year"
      ? String(fy)
      : p.value.kind === "quarter"
        ? `الربع ${q} · ${fy}`
        : `${MONTH_NAMES[fm - 1]} ${fy}`;
  const applyRange = (a: IsoDate | null, b: IsoDate | null) => {
    if (a && b && b < a) return setErr("«إلى» قبل «من». صحّح أحد التاريخين.");
    setErr(null);
    if (a && b) p.onChange({ kind: "custom", from: a, to: b });
  };

  return (
    <div className={s.wrap}>
      <Segment
        label="الفترة"
        value={p.value.kind}
        onChange={switchKind}
        options={[
          { value: "year", label: "سنة" },
          { value: "quarter", label: "ربع" },
          { value: "month", label: "شهر" },
          { value: "custom", label: "مخصص" },
        ]}
      />
      {p.value.kind !== "custom" ? (
        <div className={f.field}>
          <span className={f.label}>الاختيار</span>
          <div className={s.stepper} role="group" aria-label="تغيير الفترة">
            <button type="button" aria-label="الفترة السابقة" onClick={() => step(-1)}>
              <Icon name="prev" />
            </button>
            <span className={s.value} aria-live="polite">
              {label}
            </span>
            <button type="button" aria-label="الفترة التالية" onClick={() => step(1)}>
              <Icon name="next" />
            </button>
          </div>
        </div>
      ) : (
        <div className={s.range}>
          <DateField
            label="من"
            value={from}
            today={p.today}
            onChange={(v) => (setFrom(v), applyRange(v, to))}
          />
          <DateField
            label="إلى"
            value={to}
            today={p.today}
            onChange={(v) => (setTo(v), applyRange(from, v))}
            error={err}
          />
        </div>
      )}
    </div>
  );
}
