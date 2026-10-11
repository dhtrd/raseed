import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { Checkbox } from "../../../shared/fields/components/Checkbox";
import { Segment } from "../../../shared/fields/components/Segment";
import { SupplierCombobox } from "../../../shared/fields/components/SupplierCombobox";
import { formatHalalas, parseAmount } from "../../../shared/fields/core/amount";
import { formatDate, todayInRiyadh, weekday, DAY_NAMES } from "../../../shared/fields/core/date";
import { normalizeDigits } from "../../../shared/fields/core/digits";
import { normalizeRef } from "../../../shared/fields/core/ref";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import { useProfile } from "../../auth/session/SessionProvider";
import {
  batchSummary,
  blankRow,
  checkRows,
  fillSequence,
  FIELD_ORDER,
  isBlank,
  parsePasted,
  suggestRefs,
  type BatchField,
  type BatchRow,
  type RowCheck,
} from "../core/batch";
import {
  addEntriesChunked,
  BATCH_CHUNK,
  findRefPlaces,
  supplierContext,
  type NewEntry,
} from "../data/entriesRepo";
import { watchLockedThrough } from "../data/invoicesRepo";
import { useKeyedLoad, useKeyedWatch, useVisibleSuppliers } from "./useLedgerData";
import l from "./Ledger.module.css";
import s from "./QuickEntry.module.css";

type Mode = "seq" | "fill" | "paste";
type Outcome = { tone: "ok" | "err" | "info"; text: string };
type CellField = Exclude<BatchField, "dup">;

const LABEL: Record<CellField, string> = {
  date: "التاريخ",
  ref: "المرجع",
  voucher: "السند",
  details: "التفاصيل",
  amount: "المبلغ",
};

/** الإدخال السريع (لسان 4 المعتمد): دفعة لمورد واحد بالطرق الثلاث على جدول واحد، للحاسوب واللوحي. */
export function QuickEntryPage() {
  const profile = useProfile();
  const { sid } = useParams();
  const navigate = useNavigate();
  const today = todayInRiyadh();
  const suppliers = useVisibleSuppliers(profile);
  const list = useMemo(
    () => (suppliers.status === "ready" ? suppliers.data.filter((x) => !x.archived) : []),
    [suppliers],
  );
  const supplier = sid ? list.find((x) => x.id === sid) : undefined;
  const supplierId = supplier?.id ?? null;

  const [rows, setRows] = useState<BatchRow[]>(() => [blankRow()]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<Mode>("seq");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [fillStart, setFillStart] = useState("");
  const [fillMsg, setFillMsg] = useState<Outcome | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<BatchRow[] | null>(null);
  const [saved, setSaved] = useState<Map<string, string[]>>(new Map());
  const [savedCount, setSavedCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const cells = useRef(new Map<string, HTMLElement>());
  const pending = useRef(new Set<string>());

  // المورد من الرابط مصدر الحقيقة؛ تغيّره يبدأ دفعة جديدة
  const [batchFor, setBatchFor] = useState(supplierId);
  if (batchFor !== supplierId) {
    setBatchFor(supplierId);
    setRows([blankRow()]);
    setTouched(new Set());
    setShowAll(false);
    setPicked(new Set());
    setPreview(null);
    setOutcome(null);
  }

  const lock = useKeyedWatch<string | null>("lock", watchLockedThrough, "قراءة تاريخ الإقفال");
  const lockedThrough = lock.status === "ready" ? lock.data : null;
  const ctx = useKeyedLoad(
    supplierId ? `${supplierId}|${savedCount}` : null,
    () => supplierContext(supplierId ?? ""),
    "قراءة آخر حركات المورد",
    supplierId,
  );
  const ctxData = ctx.status === "ready" ? ctx.data : null;
  const lastRef = useMemo(() => ctxData?.lastRef ?? { inv: null, misc: null }, [ctxData]);

  const view = useMemo(() => suggestRefs(rows, lastRef), [rows, lastRef]);
  const checkCtx = { today, lockedThrough, lastDate: ctxData?.lastDate ?? null, saved };
  const checks = checkRows(view, checkCtx);
  const summary = batchSummary(view, checks);

  // فحص التكرار مقابل المحفوظ: قراءة واحدة لكل رقم جديد صالح، تُحفظ نتيجتها
  const previewChecks = preview
    ? checkRows([...view.filter((r) => !isBlank(r)), ...preview], checkCtx).slice(-preview.length)
    : [];
  const wanted = [...checks, ...previewChecks].map((c) => c.refNo).filter((r) => r && !saved.has(r));
  const wantedKey = [...new Set(wanted)].join("|");
  useEffect(() => {
    if (!wantedKey) return;
    for (const refNo of wantedKey.split("|")) {
      if (pending.current.has(refNo)) continue;
      pending.current.add(refNo);
      findRefPlaces(refNo)
        .then((places) =>
          setSaved((m) =>
            new Map(m).set(
              refNo,
              places.map((p) => p.supplierName),
            ),
          ),
        )
        .catch((e: unknown) => {
          console.error("تعذّر فحص تكرار الرقم", refNo, e);
          setOutcome({
            tone: "err",
            text: `تعذّر فحص تكرار ${refNo}. تحقق من الاتصال؛ سيُعاد الفحص قبل الحفظ.`,
          });
        })
        .finally(() => pending.current.delete(refNo));
    }
  }, [wantedKey]);

  // التركيز بعد الرسم: الصف الجديد لا يوجد قبل أن يُرسم، فيُحاول لبضعة إطارات
  const setFocusNext = useCallback((id: string) => {
    let tries = 0;
    const go = () => {
      const el = cells.current.get(id);
      if (el) {
        el.focus();
        if (el instanceof HTMLInputElement) el.select();
      } else if (tries++ < 5) requestAnimationFrame(go);
    };
    requestAnimationFrame(go);
  }, []);
  const registerCell = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cells.current.set(id, el);
    else cells.current.delete(id);
  }, []);

  const dirty = view.some((r) => !isBlank(r));
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && progress === null && currentLocation.pathname !== nextLocation.pathname,
  );

  const update = (key: string, patch: Partial<BatchRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const touch = (key: string, f: string) =>
    setTouched((t) => (t.has(`${key}:${f}`) ? t : new Set(t).add(`${key}:${f}`)));
  const shown = (key: string, f: string) => showAll || touched.has(`${key}:${f}`);

  const addRow = (afterIndex = rows.length - 1): string => {
    const prev = view[afterIndex];
    const c = checks[afterIndex];
    const row = blankRow(
      prev ? { dateRaw: c?.date ? formatDate(c.date) : prev.dateRaw, type: prev.type } : undefined,
    );
    setRows((rs) => [...rs.slice(0, afterIndex + 1), row, ...rs.slice(afterIndex + 1)]);
    return row.key;
  };

  const onCellKey = (e: KeyboardEvent<HTMLElement>, i: number, f: CellField) => {
    const r = view[i];
    if (!r) return;
    if (e.altKey && (e.code === "Digit1" || e.code === "Digit2")) {
      e.preventDefault();
      update(r.key, { type: e.code === "Digit1" ? "inv" : "misc", reversed: false, refAuto: true });
      return;
    }
    if (e.altKey && e.code === "KeyR") {
      e.preventDefault();
      update(r.key, { reversed: !r.reversed });
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    touch(r.key, f);
    const k = FIELD_ORDER.indexOf(f);
    const nextField = FIELD_ORDER[k + 1];
    if (nextField) return setFocusNext(`${r.key}:${nextField}`);
    // آخر خانة: صف جديد يرث التاريخ والنوع ويقترح المرجع التالي
    FIELD_ORDER.forEach((x) => touch(r.key, x));
    const next = view[i + 1];
    setFocusNext(`${next ? next.key : addRow(i)}:date`);
  };

  const commitDate = (i: number) => {
    const r = view[i];
    const c = checks[i];
    if (r && c?.date) update(r.key, { dateRaw: formatDate(c.date) });
    if (r) touch(r.key, "date");
  };
  const commitAmount = (i: number) => {
    const r = view[i];
    if (!r) return;
    const a = parseAmount(r.amountRaw);
    if (a.ok === true) update(r.key, { amountRaw: formatHalalas(a.halalas) });
    touch(r.key, "amount");
  };

  const save = async () => {
    if (!supplier || progress) return;
    setShowAll(true);
    setOutcome(null);
    const idx = view.map((r, i) => (isBlank(r) ? -1 : i)).filter((i) => i >= 0);
    if (!idx.length) return setOutcome({ tone: "info", text: "الدفعة فارغة: أضف صفاً واحداً على الأقل." });
    // كل رقم يُفحص مقابل المحفوظ قبل الحفظ، ولو لم يكتمل فحصه بعد
    const missing = [...new Set(idx.map((i) => checks[i]?.refNo ?? "").filter((r) => r && !saved.has(r)))];
    let savedNow = saved;
    if (missing.length) {
      try {
        const got = await Promise.all(missing.map((r) => findRefPlaces(r).then((p) => [r, p] as const)));
        savedNow = new Map(saved);
        for (const [r, p] of got)
          savedNow.set(
            r,
            p.map((x) => x.supplierName),
          );
        setSaved(savedNow);
      } catch (e) {
        console.error("تعذّر فحص التكرار قبل الحفظ", e);
        return setOutcome({
          tone: "err",
          text: "لم يُحفظ شيء: تعذّر فحص التكرار. تحقق من الاتصال ثم أعد المحاولة.",
        });
      }
    }
    const final = checkRows(view, { ...checkCtx, saved: savedNow });
    const bad = idx.filter((i) => Object.keys(final[i]?.errors ?? {}).some((k) => k !== "dup"));
    const dups = idx.filter((i) => final[i]?.errors.dup);
    if (bad.length || dups.length) {
      const first = view[bad[0] ?? dups[0] ?? 0];
      const firstErr = Object.keys(final[bad[0] ?? dups[0] ?? 0]?.errors ?? {})[0];
      if (first && firstErr && firstErr !== "dup") setFocusNext(`${first.key}:${firstErr}`);
      return setOutcome({
        tone: "err",
        text: `لم يُحفظ شيء. ${bad.length ? `${bad.length} صف فيه أخطاء. ` : ""}${
          dups.length ? `${dups.length} صف مكرر يحتاج تأكيداً وسبباً.` : ""
        }`,
      });
    }
    const entries: NewEntry[] = idx.map((i) => {
      const r = view[i] as BatchRow;
      const c = final[i] as RowCheck;
      return {
        kind: r.type,
        supplierId: supplier.id,
        supplierName: supplier.name,
        date: c.date ?? today,
        mainRef: normalizeRef(r.ref),
        refNo: c.refNo,
        voucher: normalizeDigits(r.voucher).trim(),
        details: r.details.trim(),
        amount: c.amount ?? 0,
        reversed: r.reversed,
        dupReason: c.dupOf ? r.dupReason.trim() : null,
      };
    });
    setProgress({ done: 0, of: entries.length });
    const res = await addEntriesChunked(profile.uid, entries, (done) =>
      setProgress({ done, of: entries.length }),
    );
    setProgress(null);
    const savedKeys = new Set(idx.slice(0, res.saved).map((i) => view[i]?.key));
    const lastSaved = res.saved ? idx[res.saved - 1] : undefined;
    if (res.saved) {
      setSavedCount((n) => n + 1);
      setSaved(new Map()); // الفهرس تغيّر: يُعاد الفحص
    }
    if (!res.error) {
      const prev = lastSaved !== undefined ? view[lastSaved] : undefined;
      const c = lastSaved !== undefined ? final[lastSaved] : undefined;
      const fresh = blankRow(
        prev ? { dateRaw: c?.date ? formatDate(c.date) : prev.dateRaw, type: prev.type } : undefined,
      );
      setRows([fresh]);
      setTouched(new Set());
      setShowAll(false);
      setPicked(new Set());
      setFocusNext(`${fresh.key}:date`);
      return setOutcome({
        tone: "ok",
        text: `حُفظت ${res.saved} حركة للمورد ${supplier.name}، وسُجّلت كلها في التدقيق.`,
      });
    }
    setRows((rs) => rs.filter((r) => !savedKeys.has(r.key)));
    const why =
      res.error.message ||
      (res.error.code === "unavailable"
        ? "انقطع الاتصال بالخادم"
        : res.error.code === "permission-denied"
          ? "رفضت القواعد الحفظ (فترة مقفلة أو مورد غير مسند)"
          : `خطأ غير متوقع (${res.error.code || "غير معروف"})`);
    setOutcome({
      tone: "err",
      text: `حُفظت ${res.saved} من ${entries.length} وأُزيلت من الجدول. توقف الحفظ: ${why}. الصفوف الباقية لم تُحفظ؛ صحّحها أو أعد المحاولة.`,
    });
  };

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void saveRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const doFill = () => {
    const indices = view.map((r, i) => (picked.has(r.key) ? i : -1)).filter((i) => i >= 0);
    const res = fillSequence(view, indices, fillStart);
    if (res.error) return setFillMsg({ tone: "err", text: res.error });
    setRows(res.rows);
    setFillMsg({
      tone: "info",
      text: `عُبّئت ${indices.length} صفوف حتى ${res.last}. عدّل أي رقم وستكمل الصفوف المقترحة بعده من رقمك.`,
    });
  };

  const acceptPaste = () => {
    if (!preview) return;
    setRows((rs) => [...rs.filter((r) => !isBlank(r)), ...preview]);
    preview.forEach((r) => FIELD_ORDER.forEach((f) => touch(r.key, f)));
    setPreview(null);
    setPasteText("");
    setOutcome({ tone: "info", text: "نُقلت الصفوف إلى الدفعة. صحّح ما فيه ✗ وأكّد ما فيه ⚠ ثم احفظ." });
  };

  const disabled = !supplier || progress !== null;
  const howto: Record<Mode, string[]> = {
    seq: [
      "اكتب التاريخ ثم Enter، فالمرجع (مقترح تلقائياً)، فالسند، فالتفاصيل، فالمبلغ.",
      "Enter في المبلغ يفتح صفاً جديداً يرث التاريخ والنوع ويقترح المرجع التالي.",
      "Alt+1 فاتورة، Alt+2 قيد، Alt+R عكس الاتجاه (مرتجع/استرداد)، Ctrl+S حفظ الدفعة.",
    ],
    fill: [
      "حدّد صفوفاً من عمود التحديد (Shift للمدى).",
      "اكتب رقم البداية ثم «تعبئة المراجع»، فيتسلسل المرجع حتى آخر صف محدد.",
      "عدّل أي رقم بعدها وستكمل الصفوف المقترحة من رقمك.",
    ],
    paste: [
      "انسخ من الإكسل 5 أعمدة بالترتيب: التاريخ، المرجع، المبلغ، البيان، النوع (فاتورة/قيد/ف/ق).",
      "الصق في المربع: تظهر معاينة تفحص كل صف، ثم «نقل إلى الدفعة» للمراجعة والتصحيح.",
    ],
  };

  return (
    <div className={`${l.sheet} ${s.sheet}`}>
      <main className={`${l.main} ${s.main}`} id="main">
        <div className={l.pageHead}>
          <div>
            <h1 className={l.h1}>الإدخال السريع</h1>
            <p className={l.sub}>دفعة حركات لمورد واحد، تُراجع ثم تُحفظ مرة واحدة.</p>
          </div>
          <Link className={l.linkBtn} to={supplierId ? `/add/${supplierId}` : "/add"}>
            حركة واحدة بالنموذج
          </Link>
        </div>

        <p className={s.mobileNote}>
          الإدخال السريع للحاسوب واللوحي. تصميم بطاقته على الجوال بانتظار الاعتماد؛ استخدم «حركة واحدة
          بالنموذج».
        </p>

        <div className={s.desk}>
          <div className={s.qsup}>
            <div className={s.pick}>
              {suppliers.status === "ready" ? (
                <SupplierCombobox
                  key={sid ?? "none"}
                  suppliers={list}
                  value={supplierId}
                  required
                  onChange={(id) => {
                    if (id && id !== sid) navigate(`/quick/${id}`);
                  }}
                />
              ) : (
                <p className={s.muted}>جارٍ تحميل الموردين…</p>
              )}
            </div>
            {supplier ? (
              <p className={s.qlast}>
                <span>
                  آخر فاتورة <b className="num">{lastRef.inv ?? "—"}</b>
                </span>
                <span>
                  آخر قيد <b className="num">{lastRef.misc ?? "—"}</b>
                </span>
                <span>
                  آخر حركة <b className="num">{ctxData?.lastDate ? formatDate(ctxData.lastDate) : "—"}</b>
                </span>
                <span>
                  مقفل حتى <b className="num">{lockedThrough ? formatDate(lockedThrough) : "—"}</b>
                </span>
              </p>
            ) : null}
          </div>
          {sid && suppliers.status === "ready" && !supplier ? (
            <Banner tone="err">هذا المورد غير موجود أو مؤرشف أو غير مسند إليك.</Banner>
          ) : null}
          {ctx.status === "error" ? <Banner tone="err">{ctx.message}</Banner> : null}

          <div className={s.modes}>
            <Segment
              label="طريقة الإدخال"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setFillMsg(null);
              }}
              options={[
                { value: "seq", label: "1. المتتابع" },
                { value: "fill", label: "2. التعبئة التسلسلية" },
                { value: "paste", label: "3. اللصق من الإكسل" },
              ]}
            />
            <ol className={s.howto}>
              {howto[mode].map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </div>

          {mode === "fill" ? (
            <div className={s.tool}>
              <label className={s.fillField}>
                <span className={s.fl}>ابدأ التسلسل من</span>
                <input
                  className={`${s.cell} num`}
                  inputMode="numeric"
                  value={fillStart}
                  onChange={(e) => setFillStart(normalizeDigits(e.target.value).replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      doFill();
                    }
                  }}
                />
              </label>
              <Button onClick={doFill} disabled={disabled}>
                تعبئة المراجع للصفوف المحددة ({picked.size})
              </Button>
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  setRows((rs) => {
                    const last = rs[rs.length - 1];
                    const add = Array.from({ length: 5 }, () =>
                      blankRow(last ? { dateRaw: last.dateRaw, type: last.type } : undefined),
                    );
                    return [...rs, ...add];
                  })
                }
              >
                إضافة 5 صفوف فارغة
              </Button>
              {fillMsg ? (
                <p className={fillMsg.tone === "err" ? s.msgErr : s.msgInfo} role="status">
                  {fillMsg.text}
                </p>
              ) : null}
            </div>
          ) : null}

          {mode === "paste" ? (
            <div className={`${s.tool} ${s.col}`}>
              <label className={s.fl} htmlFor="pasteZone">
                انسخ الأعمدة من الإكسل والصقها هنا (Ctrl+V)
              </label>
              <textarea
                id="pasteZone"
                className={s.pz}
                rows={3}
                value={pasteText}
                disabled={disabled}
                onChange={(e) => setPasteText(e.target.value)}
                onPaste={(e) => {
                  e.preventDefault();
                  const t = e.clipboardData.getData("text");
                  setPasteText(t);
                  setPreview(parsePasted(t));
                }}
                onBlur={() => {
                  if (pasteText.trim() && !preview) setPreview(parsePasted(pasteText));
                }}
              />
              {preview ? (
                <div className={s.preview}>
                  <h2 className={s.h2}>معاينة قبل النقل إلى الدفعة</h2>
                  <div className={s.gridWrap}>
                    <table className={s.pv}>
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">التاريخ</th>
                          <th scope="col">النوع</th>
                          <th scope="col">المرجع</th>
                          <th scope="col">الرقم المرجعي</th>
                          <th scope="col" className={s.amt}>
                            المبلغ
                          </th>
                          <th scope="col">البيان</th>
                          <th scope="col">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((r, n) => {
                          const c = previewChecks[n];
                          const errs = Object.entries(c?.errors ?? {}).filter(([k]) => k !== "dup");
                          return (
                            <tr key={r.key}>
                              <td className="num">{n + 1}</td>
                              <td className="num">{c?.date ? formatDate(c.date) : r.dateRaw}</td>
                              <td>{r.type === "inv" ? "فاتورة" : "قيد"}</td>
                              <td className="num">{r.ref}</td>
                              <td className="num">{c?.refNo}</td>
                              <td className={`${s.amt} num`}>{r.amountRaw}</td>
                              <td>{r.details}</td>
                              <td>
                                {errs.length ? (
                                  <span className={`${s.qs} ${s.bad}`}>✗ {errs[0]?.[1]}</span>
                                ) : c?.refNo && !saved.has(c.refNo) ? (
                                  <span className={s.qs}>… جارٍ فحص التكرار</span>
                                ) : c?.dupOf ? (
                                  <span className={`${s.qs} ${s.dupS}`}>⚠ مسجّل لـ {c.dupOf.join("، ")}</span>
                                ) : (
                                  <span className={`${s.qs} ${s.good}`}>✓ صالح</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className={s.row}>
                    <Button variant="primary" onClick={acceptPaste}>
                      نقل إلى الدفعة للمراجعة ({preview.length})
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setPreview(null);
                        setPasteText("");
                      }}
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {outcome ? (
            <div className={s.outcome}>
              <Banner tone={outcome.tone}>{outcome.text}</Banner>
            </div>
          ) : null}

          <div className={s.gridWrap}>
            <table className={`${s.qg} ${mode === "fill" ? s.fillmode : ""}`} aria-label="صفوف الدفعة">
              <thead>
                <tr>
                  {mode === "fill" ? (
                    <th scope="col" className={s.cs}>
                      <span className="sr-only">تحديد</span>
                    </th>
                  ) : null}
                  <th scope="col">#</th>
                  <th scope="col">التاريخ</th>
                  <th scope="col">النوع</th>
                  <th scope="col">المرجع</th>
                  <th scope="col">الرقم المرجعي</th>
                  <th scope="col">السند</th>
                  <th scope="col">التفاصيل</th>
                  <th scope="col" className={s.amt}>
                    مدين
                  </th>
                  <th scope="col" className={s.amt}>
                    دائن
                  </th>
                  <th scope="col">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r, i) => (
                  <Row
                    key={r.key}
                    r={r}
                    i={i}
                    c={checks[i] as RowCheck}
                    blank={isBlank(r)}
                    checking={Boolean(checks[i]?.refNo) && !saved.has(checks[i]?.refNo ?? "")}
                    fill={mode === "fill"}
                    picked={picked.has(r.key)}
                    disabled={disabled}
                    shown={shown}
                    register={registerCell}
                    onPick={(shift) => {
                      setPicked((p) => {
                        const n = new Set(p);
                        if (shift && anchor !== null) {
                          const [a, z] = [Math.min(anchor, i), Math.max(anchor, i)];
                          for (let k = a; k <= z; k++) {
                            const key = view[k]?.key;
                            if (key) n.add(key);
                          }
                        } else if (n.has(r.key)) n.delete(r.key);
                        else n.add(r.key);
                        return n;
                      });
                      setAnchor(i);
                    }}
                    onChange={(patch) => update(r.key, patch)}
                    onKey={(e, f) => onCellKey(e, i, f)}
                    onBlur={(f) =>
                      f === "date" ? commitDate(i) : f === "amount" ? commitAmount(i) : touch(r.key, f)
                    }
                    onRemove={() => {
                      setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blankRow()]));
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.qfoot}>
            <span className={s.muted} aria-live="polite">
              <b className="num">{summary.total}</b> صف في الدفعة · <b className="num">{summary.bad}</b> بها
              أخطاء · <b className="num">{summary.dups}</b> مكررة تنتظر تأكيداً
            </span>
            <Button variant="ghost" disabled={disabled} onClick={() => setFocusNext(`${addRow()}:date`)}>
              صف جديد
            </Button>
            <Button
              variant="primary"
              busy={progress !== null}
              disabled={!supplier}
              onClick={() => void save()}
            >
              حفظ الدفعة ({summary.total})<kbd className={s.kbd}>Ctrl+S</kbd>
            </Button>
            <span className={s.status} role="status">
              {progress ? `جارٍ الحفظ: ${progress.done} من ${progress.of}…` : ""}
            </span>
          </div>
          <p className={s.note}>
            الحفظ بعد فحص كل الصفوف، على أجزاء من <span className="num">{BATCH_CHUNK}</span> حركات (كل جزء
            يُحفظ كله أو لا شيء). إن تعثّر جزء يتوقف الحفظ، ويُزال المحفوظ من الجدول ويبقى غيره لإعادة
            المحاولة.
          </p>
        </div>
      </main>

      <Dialog
        isOpen={blocker.state === "blocked"}
        tone="warn"
        title="لديك دفعة لم تُحفظ"
        onDismiss={() => blocker.reset?.()}
      >
        <p className={d.sub}>الصفوف المكتوبة في الدفعة تضيع إن انتقلت الآن.</p>
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

function Row(p: {
  r: BatchRow;
  i: number;
  c: RowCheck;
  blank: boolean;
  /** الرقم لم يُفحص بعد مقابل المحفوظ */
  checking: boolean;
  fill: boolean;
  picked: boolean;
  disabled: boolean;
  shown: (key: string, f: string) => boolean;
  register: (id: string, el: HTMLElement | null) => void;
  onPick: (shift: boolean) => void;
  onChange: (patch: Partial<BatchRow>) => void;
  onKey: (e: KeyboardEvent<HTMLElement>, f: CellField) => void;
  onBlur: (f: CellField) => void;
  onRemove: () => void;
}) {
  const { r, i, c } = p;
  const n = i + 1;
  const credit = (r.type === "inv") !== r.reversed;
  const err = (f: BatchField) => (p.shown(r.key, f) ? c.errors[f] : undefined);
  const reg = (f: CellField) => (el: HTMLElement | null) => p.register(`${r.key}:${f}`, el);
  const cell = (
    f: CellField,
    value: string,
    extra: { num?: boolean; im?: "decimal" | "numeric" | "text" },
  ) => (
    <input
      ref={reg(f)}
      className={`${s.cell} ${extra.num ? "num" : ""} ${err(f) ? s.badCell : ""}`}
      value={value}
      inputMode={extra.im}
      disabled={p.disabled}
      aria-label={`${f === "amount" ? (credit ? "دائن" : "مدين") : LABEL[f]} الصف ${n}`}
      aria-invalid={err(f) ? true : undefined}
      onChange={(e) => {
        const v = e.target.value;
        if (f === "date") p.onChange({ dateRaw: v });
        else if (f === "ref") p.onChange({ ref: v, refAuto: false });
        else if (f === "voucher") p.onChange({ voucher: normalizeDigits(v).replace(/\D/g, "").slice(0, 12) });
        else if (f === "amount") p.onChange({ amountRaw: cleanTyped(v) });
        else p.onChange({ details: v.slice(0, 200) });
      }}
      onKeyDown={(e) => p.onKey(e, f)}
      onBlur={() => p.onBlur(f)}
    />
  );
  const errs = Object.entries(c.errors)
    .filter(([k]) => k !== "dup" && p.shown(r.key, k))
    .map(([, v]) => v);
  const nErr = Object.keys(c.errors).filter((k) => k !== "dup").length;
  const tag = r.reversed ? (r.type === "inv" ? "مرتجع" : "استرداد") : null;
  const lock = (
    <span className={s.lockc} aria-hidden="true">
      —
    </span>
  );
  const amount = cell("amount", r.amountRaw, { num: true, im: "decimal" });
  return (
    <>
      <tr className={p.picked ? s.picked : undefined} data-row={n}>
        {p.fill ? (
          <td className={s.cs}>
            <span
              onClickCapture={(e) => {
                if (e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  p.onPick(true);
                }
              }}
            >
              <Checkbox checked={p.picked} onChange={() => p.onPick(false)}>
                <span className="sr-only">تحديد الصف {n}</span>
              </Checkbox>
            </span>
          </td>
        ) : null}
        <td className={`num ${s.rn}`}>{n}</td>
        <td className={s.wDate}>
          {cell("date", r.dateRaw, { num: true, im: "decimal" })}
          {c.date ? <small className={s.dn}>{DAY_NAMES[weekday(c.date)]}</small> : null}
        </td>
        <td className={s.tc}>
          <button
            type="button"
            className={s.tbtn}
            disabled={p.disabled}
            aria-label={`النوع: ${r.type === "inv" ? "فاتورة" : "قيد"} الصف ${n}، اضغط للتبديل`}
            onClick={() =>
              p.onChange({ type: r.type === "inv" ? "misc" : "inv", reversed: false, refAuto: true })
            }
          >
            {r.type === "inv" ? "فاتورة" : "قيد"}
          </button>
          <button
            type="button"
            className={s.rbtn}
            disabled={p.disabled}
            aria-pressed={r.reversed}
            aria-label={`عكس الاتجاه الصف ${n} (Alt+R)`}
            title="عكس الاتجاه (Alt+R)"
            onClick={() => p.onChange({ reversed: !r.reversed })}
          >
            ↺
          </button>
          {tag ? <span className={s.tagret}>{tag}</span> : null}
        </td>
        <td className={s.wRef}>
          {cell("ref", r.ref, { num: true, im: "text" })}
          {r.refAuto && r.ref ? <small className={s.dn}>مقترح</small> : null}
        </td>
        <td className={`num ${s.refc} ${c.dupOf ? s.dupc : ""}`}>{c.refNo}</td>
        <td className={s.wV}>{cell("voucher", r.voucher, { num: true, im: "numeric" })}</td>
        <td className={s.wDesc}>{cell("details", r.details, {})}</td>
        <td className={`${s.amt} ${s.wAmt}`}>{credit ? lock : amount}</td>
        <td className={`${s.amt} ${s.wAmt}`}>{credit ? amount : lock}</td>
        <td className={s.st}>
          {p.blank ? (
            <span className={s.qs}>—</span>
          ) : nErr ? (
            <span className={`${s.qs} ${s.bad}`}>
              ✗ {nErr} {nErr === 1 ? "خطأ" : "أخطاء"}
            </span>
          ) : c.errors.dup ? (
            <span className={`${s.qs} ${s.dupS}`}>⚠ مكرر</span>
          ) : p.checking ? (
            <span className={s.qs}>… يُفحص</span>
          ) : (
            <span className={`${s.qs} ${s.good}`}>✓ جاهز</span>
          )}
          <button
            type="button"
            className={s.rm}
            disabled={p.disabled}
            aria-label={`حذف الصف ${n}`}
            onClick={p.onRemove}
          >
            ×
          </button>
        </td>
      </tr>
      {(errs.length || c.warning || c.dupOf) && !p.blank ? (
        <tr className={s.mrow}>
          <td colSpan={p.fill ? 11 : 10}>
            {errs.length ? <span className={s.msgErr}>{errs.join(" · ")}</span> : null}
            {c.warning ? <span className={s.msgWarn}>تنبيه: {c.warning}</span> : null}
            {c.dupOf ? (
              <div className={s.dupbox}>
                <b>تحذير صارم:</b> الرقم <span className="num">{c.refNo}</span> مسجّل مسبقاً لـ{" "}
                {[...new Set(c.dupOf)].join("، ")}.
                <Checkbox
                  checked={r.dupConfirmed}
                  danger
                  disabled={p.disabled}
                  onChange={(v) => p.onChange({ dupConfirmed: v })}
                >
                  أؤكد أنها حركة مختلفة
                </Checkbox>
                <input
                  className={`${s.cell} ${s.reason} ${c.errors.dup && p.shown(r.key, "dup") ? s.badCell : ""}`}
                  value={r.dupReason}
                  maxLength={300}
                  disabled={p.disabled || !r.dupConfirmed}
                  placeholder="السبب (إلزامي)"
                  aria-label={`سبب تأكيد التكرار الصف ${n}`}
                  onChange={(e) => p.onChange({ dupReason: e.target.value })}
                />
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** المبلغ أثناء الكتابة: أرقام وفاصلة عشرية واحدة ومنزلتان، وفواصل آلاف (FIELDS «المبلغ»). */
function cleanTyped(v: string): string {
  const raw = normalizeDigits(v).replace(/[،٫]/g, ".");
  const s = raw.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const [int = "", ...rest] = s.split(".");
  const dec = rest.length ? "." + rest.join("").slice(0, 2) : "";
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + dec;
}
