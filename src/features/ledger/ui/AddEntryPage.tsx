import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { Checkbox } from "../../../shared/fields/components/Checkbox";
import { DateField } from "../../../shared/fields/components/DateField";
import { DebitCreditBar } from "../../../shared/fields/components/DebitCreditBar";
import { RefField, RefNumberOutput } from "../../../shared/fields/components/RefField";
import { DocTypeSegment, type DocType } from "../../../shared/fields/components/Segment";
import { SupplierCombobox } from "../../../shared/fields/components/SupplierCombobox";
import { TextAreaField } from "../../../shared/fields/components/TextAreaField";
import { VoucherField } from "../../../shared/fields/components/VoucherField";
import { formatDate, todayInRiyadh } from "../../../shared/fields/core/date";
import { nextInSequence } from "../../../shared/fields/core/ref";
import { LIMITS } from "../../../shared/fields/core/text";
import { useEnterToNext } from "../../../shared/fields/useEnterToNext";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import { useProfile } from "../../auth/session/SessionProvider";
import {
  DUP_REASON_MAX,
  emptyForm,
  isDirty,
  refNoOf,
  validateEntryForm,
  type EntryForm,
  type FormErrors,
} from "../core/entryForm";
import { addEntry, EntrySaveError, findRefPlaces, supplierContext } from "../data/entriesRepo";
import { watchLockedThrough } from "../data/invoicesRepo";
import { SupplierIndex, useIndexCollapse } from "./SupplierIndex";
import { useKeyedLoad, useKeyedWatch, useVisibleSuppliers } from "./useLedgerData";
import l from "./Ledger.module.css";
import s from "./AddEntry.module.css";

const RECENT_KEY = "raseed.recentSuppliers";
const readRecent = (): string[] => {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
};
const pushRecent = (id: string) => {
  try {
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 5)),
    );
  } catch {
    // تفضيل عرض فقط
  }
};

const KIND_AR = { inv: "فاتورة", misc: "قيد", note: "ملاحظة" } as const;

/** أماكن التكرار مجمّعة بالمورد مع عدد الحركات (المورد نفسه قد يحمل الرقم أكثر من مرة). */
const groupNames = (names: string[]): [string, number][] => {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  return [...m.entries()];
};

/** إضافة حركة (direction-1/add-entry.html): فاتورة أو قيد أو ملاحظة لمورد، مع التحذير الصارم للتكرار. */
export function AddEntryPage() {
  const profile = useProfile();
  const { sid } = useParams();
  const navigate = useNavigate();
  const today = todayInRiyadh();
  const idx = useIndexCollapse();
  const suppliers = useVisibleSuppliers(profile);
  const list = useMemo(
    () => (suppliers.status === "ready" ? suppliers.data.filter((x) => !x.archived) : []),
    [suppliers],
  );
  const supplier = sid ? list.find((x) => x.id === sid) : undefined;

  const [form, setForm] = useState<EntryForm>(() => emptyForm(sid ?? null));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ text: string; sid: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [checkRef, setCheckRef] = useState<string | null>(null);
  const [dupBack, setDupBack] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // بعد «حفظ وجديد» يعود التركيز إلى التاريخ (المورد باقٍ)، لا إلى قائمة المورد التي تنفتح بالتركيز
  const firstField = useRef<HTMLDivElement>(null);
  useEnterToNext(formRef);

  const supplierId = supplier?.id ?? null;
  const kind = form.type === "note" ? null : form.type;
  const refNo = refNoOf(form, today);

  const lock = useKeyedWatch<string | null>("lock", watchLockedThrough, "قراءة تاريخ الإقفال");
  const lockedThrough = lock.status === "ready" ? lock.data : null;
  const ctx = useKeyedLoad(
    supplierId ? `${supplierId}|${savedCount}` : null,
    () => supplierContext(supplierId ?? ""),
    "قراءة آخر حركات المورد",
    supplierId,
  );
  const ctxData = ctx.status === "ready" ? ctx.data : null;
  const suggestion = kind && ctxData ? nextInSequence(ctxData.lastRef[kind] ?? "") : null;

  // فحص التكرار عند الخروج من المرجع (أو تغيّر الشهر في القيد)، لا مع كل حرف
  const dupLoad = useKeyedLoad(checkRef, () => findRefPlaces(checkRef ?? ""), "فحص تكرار الرقم المرجعي");
  const dupChecked = checkRef !== null && checkRef === refNo && dupLoad.status === "ready";
  const dupNames = dupChecked && dupLoad.status === "ready" ? dupLoad.data.map((p) => p.supplierName) : null;
  const dupOf = dupNames && dupNames.length ? dupNames : null;
  const fullForm: EntryForm = { ...form, supplierId, dupOf };

  // المورد من الرابط هو مصدر الحقيقة؛ تغيّره يبدأ نموذجاً جديداً بنوعه الحالي
  const [formFor, setFormFor] = useState(supplierId);
  if (formFor !== supplierId) {
    setFormFor(supplierId);
    setForm((f) => ({ ...emptyForm(supplierId, f.type), date: f.date }));
    setErrors({});
    setCheckRef(null);
  }
  // اقتراح التسلسل يملأ المرجع ما دام المستخدم لم يكتب غيره
  const [autoRef, setAutoRef] = useState(true);
  if (autoRef && kind && suggestion && form.ref !== suggestion) setForm((f) => ({ ...f, ref: suggestion }));

  const set = <K extends keyof EntryForm>(k: K, v: EntryForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(null);
    if (errors[k as keyof FormErrors]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const changeType = (t: DocType) => {
    setForm((f) => ({ ...f, type: t, reversed: false, ref: "", dupConfirmed: false, dupReason: "" }));
    setAutoRef(true);
    setCheckRef(null);
    setErrors({});
  };

  const dirty = isDirty(fullForm, suggestion);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !saving && currentLocation.pathname !== nextLocation.pathname,
  );

  const save = async (andNew: boolean) => {
    if (saving) return;
    setFailure(null);
    const errs = validateEntryForm(fullForm, lockedThrough);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    if (!supplier || !form.date) return;
    setSaving(true);
    try {
      if (form.type !== "note" && !dupChecked) {
        // لم يُفحص الرقم بعد (حفظ مباشر بلا خروج من الحقل): نفحصه أولاً ونُظهر التحذير إن كان مكرراً
        const places = await findRefPlaces(refNo);
        if (places.length) {
          setCheckRef(refNo);
          setErrors({ dup: "الرقم مكرر: راجع التحذير، وأكّد مع ذكر السبب أو عدّل المرجع." });
          return;
        }
      }
      await addEntry(
        profile.uid,
        form.type === "note"
          ? {
              kind: "note",
              supplierId: supplier.id,
              supplierName: supplier.name,
              date: form.date,
              note: form.note.trim(),
            }
          : {
              kind: form.type,
              supplierId: supplier.id,
              supplierName: supplier.name,
              date: form.date,
              mainRef: form.ref,
              refNo,
              voucher: form.voucher,
              details: form.details.trim(),
              amount: form.amount ?? 0,
              reversed: form.reversed,
              dupReason: dupOf ? form.dupReason.trim() : null,
            },
      );
      pushRecent(supplier.id);
      const what = form.type === "note" ? "الملاحظة" : `${KIND_AR[form.type]} ${refNo}`;
      setSavedCount((n) => n + 1);
      setCheckRef(null);
      setErrors({});
      if (andNew) {
        // حفظ وجديد: يبقى المورد والنوع والتاريخ، ويُقترح المرجع التالي
        setForm((f) => ({ ...emptyForm(supplier.id, f.type), date: f.date }));
        setAutoRef(true);
        setSaved({ text: `حُفظت ${what} للمورد ${supplier.name} وسُجّلت في التدقيق.`, sid: supplier.id });
        firstField.current?.querySelector<HTMLElement>("input")?.focus();
      } else {
        setForm((f) => ({ ...emptyForm(supplier.id, f.type), date: f.date }));
        navigate(`/statement/${supplier.id}`);
      }
    } catch (e) {
      console.error("تعذّر حفظ الحركة", e);
      const code = (e as { code?: string }).code ?? "";
      setFailure(
        e instanceof EntrySaveError
          ? e.message
          : code === "permission-denied"
            ? "رفض الخادم الحفظ: تحقق أن الفترة غير مقفلة وأن المورد مسند إليك، ثم أعد المحاولة."
            : code === "unavailable"
              ? "لا اتصال بالخادم. لم تُحفظ الحركة؛ تحقق من الإنترنت ثم أعد المحاولة."
              : `تعذّر الحفظ (${code || "خطأ غير معروف"}). لم تُحفظ الحركة؛ أعد المحاولة، وإن تكرر فأبلغ المالك.`,
      );
    } finally {
      setSaving(false);
    }
  };

  // الاختصارات (CHOSEN §3.4): Ctrl+S حفظ، Ctrl+Enter حفظ وجديد، Esc إلغاء. Alt+1/2/3 في مقطّع النوع.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void saveRef.current(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void saveRef.current(true);
      } else if (e.key === "Escape" && !(e.target as HTMLElement).closest('[aria-expanded="true"]')) {
        setForm((f) => ({ ...emptyForm(f.supplierId, f.type), date: f.date }));
        setAutoRef(true);
        setErrors({});
        setCheckRef(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const takeover = Boolean(dupOf) && dupBack !== refNo;
  const disabled = !supplier || saving;

  return (
    <div
      className={`${l.sheet} ${s.sheet} ${idx.collapsed ? l.collapsed : ""} ${takeover ? s.takeover : ""}`}
    >
      <SupplierIndex collapsed={idx.collapsed} onToggle={idx.toggle}>
        <ul className={l.ixList}>
          {list.map((x) => (
            <li key={x.id}>
              <Link to={`/add/${x.id}`} className={l.ixItem} aria-current={x.id === sid ? "page" : undefined}>
                <span>{x.name}</span>
              </Link>
            </li>
          ))}
        </ul>
        {profile.role === "entry" ? <p className={l.ixNote}>تظهر هنا الموردون المسندون إليك فقط.</p> : null}
      </SupplierIndex>

      <main className={`${l.main} ${s.main}`} id="main">
        <div className={l.pageHead}>
          <div>
            <h1 className={l.h1}>إضافة حركة</h1>
            <p className={l.sub}>فاتورة أو قيد أو ملاحظة في دفتر المورد</p>
          </div>
          <Link className={`${l.linkBtn} ${s.quickLink}`} to={sid ? `/quick/${sid}` : "/quick"}>
            الإدخال السريع (دفعة)
          </Link>
        </div>

        {saved ? (
          <div className={s.msg}>
            <Banner tone="ok">
              {saved.text} <Link to={`/statement/${saved.sid}`}>عرض كشف المورد</Link>
            </Banner>
          </div>
        ) : null}
        {failure ? (
          <div className={s.msg}>
            <Banner tone="err">{failure}</Banner>
          </div>
        ) : null}
        {suppliers.status === "error" ? <Banner tone="err">{suppliers.message}</Banner> : null}
        {ctx.status === "error" ? <Banner tone="err">{ctx.message}</Banner> : null}
        {sid && suppliers.status === "ready" && !supplier ? (
          <Banner tone="err">هذا المورد غير موجود أو مؤرشف أو غير مسند إليك. اختر مورداً من القائمة.</Banner>
        ) : null}

        <form
          ref={formRef}
          className={s.voucher}
          noValidate
          aria-label="حركة جديدة"
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
        >
          <div className={s.grid}>
            <div className={s.fSup}>
              {suppliers.status === "ready" ? (
                <SupplierCombobox
                  key={sid ?? "none"}
                  suppliers={list}
                  recentIds={readRecent()}
                  value={supplierId}
                  required
                  error={errors.supplier}
                  onChange={(id) => {
                    if (id && id !== sid) navigate(`/add/${id}`);
                  }}
                />
              ) : (
                <p className={s.loading}>جارٍ تحميل الموردين…</p>
              )}
            </div>
            <div className={s.fType}>
              <DocTypeSegment value={form.type} onChange={changeType} disabled={disabled} />
            </div>
            <div className={s.fDate} ref={firstField}>
              <DateField
                value={form.date}
                onChange={(v) => {
                  set("date", v);
                  // القيد: الشهر جزء من الرقم المرجعي، فيُعاد فحص التكرار
                  if (v && form.type === "misc" && form.ref)
                    setCheckRef(refNoOf({ ...form, date: v }, today));
                }}
                today={today}
                base={ctxData?.lastDate ?? undefined}
                lockedThrough={lockedThrough}
                required
                disabled={disabled}
                error={errors.date}
              />
            </div>
            {kind ? (
              <>
                <div className={s.fRef}>
                  <RefField
                    kind={kind}
                    value={form.ref}
                    onChange={(v, o) => {
                      setAutoRef(o.fromSuggestion);
                      set("ref", v);
                    }}
                    suggestion={suggestion}
                    duplicateOf={
                      dupOf
                        ? groupNames(dupOf)
                            .map(([n]) => n)
                            .join("، ")
                        : null
                    }
                    onBlurCheck={(v) => {
                      if (v) setCheckRef(refNoOf({ ...form, ref: v }, today));
                    }}
                    required
                    disabled={disabled}
                    error={errors.ref}
                  />
                </div>
                <div className={s.fRefno}>
                  <RefNumberOutput value={refNo} duplicate={Boolean(dupOf)} />
                </div>
                <div className={s.fV}>
                  <VoucherField
                    value={form.voucher}
                    onChange={(v) => set("voucher", v)}
                    disabled={disabled}
                    error={errors.voucher}
                  />
                </div>
                <div className={s.fDesc}>
                  <TextAreaField
                    label="التفاصيل"
                    optional
                    value={form.details}
                    onChange={(v) => set("details", v)}
                    maxLength={LIMITS.details}
                    counter="always"
                    suggestions={ctxData?.topDetails}
                    suggestionsLabel="الأكثر استخداماً لهذا المورد:"
                    disabled={disabled}
                    error={errors.details}
                  />
                </div>
                <div className={s.fAmt}>
                  <DebitCreditBar
                    kind={kind}
                    reversed={form.reversed}
                    onReversedChange={(r) => set("reversed", r)}
                    value={form.amount}
                    onChange={(v) => set("amount", v)}
                    disabled={disabled}
                    error={errors.amount}
                  />
                </div>
              </>
            ) : (
              <div className={s.fDesc}>
                <TextAreaField
                  label="نص الملاحظة"
                  required
                  value={form.note}
                  onChange={(v) => set("note", v)}
                  maxLength={LIMITS.note}
                  counter="near-limit"
                  disabled={disabled}
                  error={errors.note}
                />
                <p className={s.hint}>الملاحظة بند بتاريخ بلا مبلغ، تظهر في الكشف ولا تؤثر على الرصيد.</p>
              </div>
            )}
          </div>
          <div className={s.actions}>
            <Button type="submit" variant="primary" busy={saving} disabled={!supplier}>
              حفظ<kbd className={s.kbd}>Ctrl+S</kbd>
            </Button>
            <Button busy={saving} disabled={!supplier} onClick={() => void save(true)}>
              حفظ وجديد<kbd className={s.kbd}>Ctrl+Enter</kbd>
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setForm((f) => ({ ...emptyForm(f.supplierId, f.type), date: f.date }));
                setAutoRef(true);
                setErrors({});
                setCheckRef(null);
              }}
            >
              إلغاء<kbd className={s.kbd}>Esc</kbd>
            </Button>
            {Object.values(errors).some(Boolean) ? (
              <p className={s.errSum} role="alert">
                لم تُحفظ الحركة: صحّح الحقول المعلَّمة بالأحمر.
              </p>
            ) : null}
          </div>
        </form>
      </main>

      <aside className={`${l.side} ${s.side}`} aria-label="التحقق من التكرار">
        {kind ? (
          <section className={`${s.dup} ${dupOf ? "" : s.ok}`} aria-labelledby="dup-h" aria-live="polite">
            {dupOf ? (
              <>
                <h2 id="dup-h">تحذير صارم: الرقم المرجعي مكرّر</h2>
                <p className={s.mine}>
                  حركتك: {KIND_AR[kind]}{" "}
                  {form.date ? (
                    <>
                      بتاريخ <span className="num">{formatDate(form.date)}</span>
                    </>
                  ) : null}
                </p>
                <p>
                  الرقم <span className="num">{refNo}</span> مسجّل مسبقاً. الحفظ متوقف حتى تعدّل المرجع، أو
                  تؤكد أنها حركة مختلفة مع ذكر السبب.
                </p>
                <dl className={s.dupRec}>
                  {groupNames(dupOf).map(([n, c]) => (
                    <div key={n}>
                      <dt>المورد</dt>
                      <dd>
                        {n}
                        {c > 1 ? (
                          <span className={s.dupCount}>
                            {" "}
                            · <span className="num">{c}</span> حركات
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
                <Checkbox
                  checked={form.dupConfirmed}
                  danger
                  invalid={Boolean(errors.dup) && !form.dupConfirmed}
                  onChange={(v) => set("dupConfirmed", v)}
                >
                  أؤكد أنها حركة مختلفة
                </Checkbox>
                {form.dupConfirmed ? (
                  <div className={s.reason}>
                    <TextAreaField
                      label="سبب تسجيل رقم مكرر"
                      required
                      value={form.dupReason}
                      onChange={(v) => set("dupReason", v)}
                      maxLength={DUP_REASON_MAX}
                      counter="near-limit"
                      error={errors.dup && form.dupConfirmed ? errors.dup : null}
                    />
                  </div>
                ) : null}
                {errors.dup && !form.dupConfirmed ? (
                  <p className={s.dupErr} role="alert">
                    {errors.dup}
                  </p>
                ) : null}
                <div className={s.backWrap}>
                  <Button variant="primary" wide onClick={() => setDupBack(refNo)}>
                    رجوع للتعديل
                  </Button>
                </div>
              </>
            ) : dupChecked ? (
              <>
                <h2 id="dup-h">الرقم المرجعي غير مكرّر</h2>
                <p>
                  لا توجد حركة أخرى بالرقم <span className="num">{refNo}</span>. يمكنك الحفظ.
                </p>
              </>
            ) : (
              <>
                <h2 id="dup-h">فحص التكرار</h2>
                <p>
                  {checkRef && dupLoad.status === "loading"
                    ? "جارٍ فحص الرقم المرجعي…"
                    : "يُفحص الرقم المرجعي في كل الموردين عند الخروج من حقل المرجع، وقبل الحفظ."}
                </p>
                {dupLoad.status === "error" ? <Banner tone="err">{dupLoad.message}</Banner> : null}
              </>
            )}
          </section>
        ) : null}
        <section className={s.kbdHelp} aria-labelledby="kb-h">
          <h2 id="kb-h">اختصارات لوحة المفاتيح</h2>
          <dl>
            <dt>
              <kbd className={s.kbdOn}>Ctrl+S</kbd>
            </dt>
            <dd>حفظ والانتقال إلى كشف المورد</dd>
            <dt>
              <kbd className={s.kbdOn}>Ctrl+Enter</kbd>
            </dt>
            <dd>حفظ وبدء حركة جديدة</dd>
            <dt>
              <kbd className={s.kbdOn}>Esc</kbd>
            </dt>
            <dd>إلغاء (تفريغ النموذج)</dd>
            <dt>
              <kbd className={s.kbdOn}>Alt+1 / 2 / 3</kbd>
            </dt>
            <dd>النوع: فاتورة / قيد / ملاحظة</dd>
            <dt>
              <kbd className={s.kbdOn}>Enter</kbd>
            </dt>
            <dd>الحقل التالي (Shift+Enter سطر جديد في التفاصيل)</dd>
          </dl>
        </section>
      </aside>

      <Dialog
        isOpen={blocker.state === "blocked"}
        tone="warn"
        title="لديك حركة لم تُحفظ"
        onDismiss={() => blocker.reset?.()}
      >
        <p className={d.sub}>البيانات المكتوبة في النموذج تضيع إن انتقلت الآن.</p>
        <div className={d.actions}>
          <Button variant="primary" onClick={() => blocker.reset?.()}>
            البقاء والحفظ
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            انتقل دون حفظ
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
