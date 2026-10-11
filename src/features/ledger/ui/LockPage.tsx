import { useMemo, useState } from "react";
import { DateField } from "../../../shared/fields/components/DateField";
import { TextAreaField } from "../../../shared/fields/components/TextAreaField";
import { formatDate, todayInRiyadh, type IsoDate } from "../../../shared/fields/core/date";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { useProfile } from "../../auth/session/SessionProvider";
import { watchUsers } from "../../users/data/usersRepo";
import type { UserProfile } from "../../users/core/users";
import {
  beforeMonth,
  describeLockChange,
  LOCK_REASON_MAX,
  monthsOf,
  planLock,
  type LockAction,
  type LockErrors,
  type LockState,
  type MonthCell,
} from "../core/lock";
import { countEntriesBetween, saveLock, watchLock, watchLockHistory } from "../data/lockRepo";
import { readError, useKeyedLoad, useKeyedWatch } from "./useLedgerData";
import s from "./Lock.module.css";

type Form = { kind: LockAction; date: IsoDate | null; reason: string };
type Outcome = { tone: "ok" | "err"; text: string };

const MONTH_STATE: Record<MonthCell["state"], string> = {
  locked: "مقفل",
  opened: "مفتوح مؤقتاً",
  open: "مفتوح",
  future: "قادم",
};

/** قفل الفترات (الخيار ب المعتمد): خط الأشهر، للمالك فقط. */
export function LockPage() {
  const profile = useProfile();
  const today = todayInRiyadh();
  const lock = useKeyedWatch<LockState>("lock", watchLock, "قراءة تاريخ الإقفال");
  const cur: LockState = lock.status === "ready" ? lock.data : { lockedThrough: null, tempFrom: null };
  const history = useKeyedWatch("lockHistory", watchLockHistory, "قراءة سجل الإقفال");
  const users = useKeyedWatch<UserProfile[]>("users", watchUsers, "قراءة المستخدمين");
  const nameOf = useMemo(
    () => new Map(users.status === "ready" ? users.data.map((u) => [u.uid, u.displayName] as const) : []),
    [users],
  );

  const [year, setYear] = useState(() => Number((cur.lockedThrough ?? today).slice(0, 4)));
  const [picked, setPicked] = useState<MonthCell | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<LockErrors>({});
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const months = monthsOf(year, cur, today);
  const lockedCount = useKeyedLoad(
    cur.lockedThrough ? `c:${cur.lockedThrough}` : null,
    () => countEntriesBetween(null, cur.lockedThrough ?? ""),
    "عدّ الحركات المقفلة",
  );
  // أثر التغيير قبل الحفظ: عدد الحركات التي ستُقفل أو تُفتح
  const impactRange =
    form && form.kind !== "lockRestore" && form.date && cur.lockedThrough && form.date !== cur.lockedThrough
      ? form.date < cur.lockedThrough
        ? { from: form.date, to: cur.lockedThrough, opening: true }
        : { from: cur.lockedThrough, to: form.date, opening: false }
      : null;
  const impact = useKeyedLoad(
    impactRange ? `i:${impactRange.from}:${impactRange.to}` : null,
    () => countEntriesBetween(impactRange?.from ?? null, impactRange?.to ?? ""),
    "عدّ الحركات المتأثرة",
  );

  const open = (kind: LockAction, date: IsoDate | null, reason = "") => {
    setOutcome(null);
    setErrors({});
    setPicked(null);
    setForm({ kind, date, reason });
  };
  const submit = async () => {
    if (!form) return;
    const { plan, errors: e } = planLock(form.kind, cur, form.date, form.reason, today);
    setErrors(e);
    if (!plan) return;
    setSaving(true);
    try {
      await saveLock(profile.uid, cur, plan, form.reason);
      setForm(null);
      setOutcome({
        tone: "ok",
        text:
          plan.action === "lockTempOpen"
            ? `فُتح القفل مؤقتاً إلى ${formatDate(plan.next.lockedThrough ?? "")}. أعده بعد انتهاء التصحيح.`
            : plan.action === "lockRestore"
              ? `أُعيد القفل حتى ${formatDate(plan.next.lockedThrough ?? "")}.`
              : `صار مقفلاً حتى ${formatDate(plan.next.lockedThrough ?? "")}.`,
      });
    } catch (err) {
      setOutcome({ tone: "err", text: `لم يُحفظ: ${readError(err, "حفظ تاريخ الإقفال")}` });
    } finally {
      setSaving(false);
    }
  };

  const title =
    form?.kind === "lockTempOpen"
      ? "فتح مؤقت لتصحيح حركات"
      : form?.kind === "lockRestore"
        ? "إعادة القفل"
        : "تغيير تاريخ الإقفال";

  return (
    <div className={s.page}>
      <main className={s.main} id="main">
        <div className={s.head}>
          <h1 className={s.h1}>قفل الفترات</h1>
          <p className={s.sub}>
            للمالك فقط. لا إضافة ولا تعديل لأي دور في حركة بتاريخ قبل «مقفل حتى» أو يساويه. كل تغيير بسبب
            مكتوب في التدقيق.
          </p>
        </div>

        {lock.status === "error" ? <Banner tone="err">{lock.message}</Banner> : null}

        <section className={s.card} aria-labelledby="lock-now">
          <div className={`${s.big} ${cur.tempFrom ? s.isOpen : ""}`}>
            <span className={s.ic} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d={cur.tempFrom ? "M8 11V8a4 4 0 0 1 7.5-2" : "M8 11V8a4 4 0 0 1 8 0v3"} />
              </svg>
            </span>
            <div>
              <h2 id="lock-now" className={s.lbl}>
                {cur.tempFrom ? "مفتوح مؤقتاً · مقفل الآن حتى" : "مقفل حتى"}
              </h2>
              <p className={`num ${s.val}`}>
                {lock.status !== "ready"
                  ? "…"
                  : cur.lockedThrough
                    ? formatDate(cur.lockedThrough)
                    : "غير مقفل"}
              </p>
            </div>
          </div>
          <p className={s.facts}>
            <span>
              الحركات المقفلة{" "}
              <b className="num">
                {lockedCount.status === "ready" ? lockedCount.data.toLocaleString("en-US") : "…"}
              </b>
            </span>
            {cur.tempFrom ? (
              <span>
                يُعاد إلى <b className="num">{formatDate(cur.tempFrom)}</b>
              </span>
            ) : null}
          </p>
          {lockedCount.status === "error" ? <Banner tone="err">{lockedCount.message}</Banner> : null}

          {cur.tempFrom && form?.kind !== "lockRestore" ? (
            <div className={s.temp} role="status">
              <p>
                <b>القفل مفتوح مؤقتاً.</b> أعده إلى <span className="num">{formatDate(cur.tempFrom)}</span>{" "}
                بعد انتهاء التصحيح.
              </p>
              <Button variant="primary" onClick={() => open("lockRestore", cur.tempFrom, "انتهى التصحيح")}>
                إعادة القفل إلى {formatDate(cur.tempFrom)}
              </Button>
            </div>
          ) : null}

          <div className={s.yearbar}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setYear((y) => y - 1)}
              aria-label="السنة السابقة"
            >
              ‹ <span className="num">{year - 1}</span>
            </Button>
            <b className="num" aria-live="polite">
              {year}
            </b>
            <Button
              size="sm"
              variant="ghost"
              disabled={year >= Number(today.slice(0, 4))}
              onClick={() => setYear((y) => y + 1)}
              aria-label="السنة التالية"
            >
              <span className="num">{year + 1}</span> ›
            </Button>
          </div>
          {/* لا تُعرض حالة الأشهر قبل وصول تاريخ الإقفال كي لا تظهر «مفتوحة» خطأً */}
          {lock.status === "ready" ? (
            <ul className={s.months} aria-label={`أشهر ${year}`}>
              {months.map((m) => (
                <li key={m.end}>
                  <button
                    type="button"
                    className={`${s.mo} ${s[m.state]} ${m.end === cur.lockedThrough ? s.edge : ""} ${
                      picked?.end === m.end ? s.sel : ""
                    }`}
                    aria-pressed={picked?.end === m.end}
                    aria-label={`${m.name} ${year}، ${MONTH_STATE[m.state]}`}
                    onClick={() => {
                      setForm(null);
                      setOutcome(null);
                      setPicked((p) => (p?.end === m.end ? null : m));
                    }}
                  >
                    <span>{m.name}</span>
                    <small>{MONTH_STATE[m.state]}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.sub}>جارٍ قراءة تاريخ الإقفال…</p>
          )}
          <p className={s.legend} aria-hidden="true">
            <span>
              <i className={s.l1} />
              مقفل
            </span>
            <span>
              <i className={s.l2} />
              مفتوح مؤقتاً
            </span>
            <span>
              <i className={s.l3} />
              مفتوح
            </span>
          </p>

          {picked ? (
            <div className={s.panel}>
              <h3 className={s.h3}>
                {picked.name} <span className="num">{year}</span>
              </h3>
              <p className={s.sub}>
                نهاية الشهر <span className="num">{formatDate(picked.end)}</span> ·{" "}
                {MONTH_STATE[picked.state]}
              </p>
              <div className={s.acts}>
                {picked.state === "open" || picked.state === "opened" ? (
                  <Button variant="primary" onClick={() => open("lockSet", picked.end)}>
                    قفل حتى نهايته
                  </Button>
                ) : null}
                {picked.state === "locked" && !cur.tempFrom ? (
                  <Button onClick={() => open("lockTempOpen", beforeMonth(year, picked.month))}>
                    فتح مؤقت من بدايته
                  </Button>
                ) : null}
                {picked.state === "future" ? (
                  <p className={s.sub}>الشهر لم ينتهِ بعد؛ لا إقفال لتاريخ بعد اليوم.</p>
                ) : null}
                <Button variant="ghost" onClick={() => setPicked(null)}>
                  إغلاق
                </Button>
              </div>
            </div>
          ) : null}

          {form ? (
            <form
              className={s.panel}
              aria-label={title}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <h3 className={s.h3}>{title}</h3>
              {form.kind === "lockRestore" ? (
                <p className={s.sub}>
                  يُقفل حتى <span className="num">{formatDate(cur.tempFrom ?? "")}</span> كما كان قبل الفتح
                  المؤقت.
                </p>
              ) : (
                <DateField
                  label={form.kind === "lockTempOpen" ? "افتح القفل إلى (أقدم من الحالي)" : "مقفل حتى"}
                  value={form.date}
                  onChange={(v) => {
                    setForm((f) => (f ? { ...f, date: v } : f));
                    setErrors((e) => ({ ...e, date: undefined }));
                  }}
                  today={today}
                  required
                  disabled={saving}
                  error={errors.date}
                />
              )}
              <TextAreaField
                label="السبب (يُحفظ في التدقيق)"
                required
                value={form.reason}
                onChange={(v) => {
                  setForm((f) => (f ? { ...f, reason: v } : f));
                  setErrors((e) => ({ ...e, reason: undefined }));
                }}
                maxLength={LOCK_REASON_MAX}
                counter="near-limit"
                disabled={saving}
                error={errors.reason}
              />
              {impactRange ? (
                <p className={`${s.impact} ${impactRange.opening ? s.opening : ""}`}>
                  {impactRange.opening ? "يُفتح للكتابة" : "يُقفل"} ما بعد{" "}
                  <span className="num">{formatDate(impactRange.from)}</span> حتى{" "}
                  <span className="num">{formatDate(impactRange.to)}</span>:{" "}
                  <b className="num">
                    {impact.status === "ready" ? impact.data.toLocaleString("en-US") : "…"}
                  </b>{" "}
                  حركة.
                </p>
              ) : null}
              {impact.status === "error" ? <Banner tone="err">{impact.message}</Banner> : null}
              {errors.form ? <Banner tone="err">{errors.form}</Banner> : null}
              <div className={s.acts}>
                <Button type="submit" variant="primary" busy={saving}>
                  {form.kind === "lockTempOpen"
                    ? "فتح مؤقت"
                    : form.kind === "lockRestore"
                      ? "إعادة القفل"
                      : "حفظ تاريخ الإقفال"}
                </Button>
                <Button variant="ghost" disabled={saving} onClick={() => setForm(null)}>
                  إلغاء
                </Button>
              </div>
            </form>
          ) : null}

          {!form && !picked ? (
            <div className={s.acts}>
              <Button variant="ghost" size="sm" onClick={() => open("lockSet", cur.lockedThrough)}>
                تاريخ مخصص
              </Button>
            </div>
          ) : null}

          {outcome ? <Banner tone={outcome.tone}>{outcome.text}</Banner> : null}
        </section>
      </main>

      <aside className={s.side} aria-label="سجل الإقفال">
        <h2 className={s.h2}>سجل الإقفال</h2>
        {history.status === "error" ? <Banner tone="err">{history.message}</Banner> : null}
        {history.status === "loading" ? <p className={s.sub}>جارٍ التحميل…</p> : null}
        {history.status === "ready" && !history.data.length ? <p className={s.sub}>لا تغييرات بعد.</p> : null}
        {history.status === "ready" ? (
          <ul className={s.hist}>
            {history.data.map((h) => (
              <li key={h.id}>
                <span className={s.what}>
                  {describeLockChange(h.action, h.after)}
                  <span className={`${s.tag} ${h.action === "lockTempOpen" ? s.tagOpen : s.tagClose}`}>
                    {h.action === "lockTempOpen"
                      ? "فتح مؤقت"
                      : h.action === "lockRestore"
                        ? "إعادة قفل"
                        : "قفل"}
                  </span>
                </span>
                {h.reason ? <span>{h.reason}</span> : null}
                <span className={s.who}>
                  {nameOf.get(h.actor) ??
                    (h.actor === "seed" || h.actor === "migration" ? "النظام" : "مستخدم")}
                  {h.at ? (
                    <>
                      {" · "}
                      <span className="num">
                        {formatDate(todayInRiyadh(h.at))}{" "}
                        {h.at.toLocaleTimeString("en-GB", {
                          timeZone: "Asia/Riyadh",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
    </div>
  );
}
