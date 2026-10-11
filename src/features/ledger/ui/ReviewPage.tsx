import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { formatDate } from "../../../shared/fields/core/date";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import { useProfile } from "../../auth/session/SessionProvider";
import { formatMoney, type LedgerEntry } from "../core/ledger";
import {
  buildReview,
  IGNORE_NOTE_MAX,
  reviewCountsOf,
  SECTION_ORDER,
  SECTION_TITLE,
  type ReviewRow,
  type ReviewSection,
} from "../core/review";
import { setResolution, watchEntriesByIds, watchOpenIssues } from "../data/reviewRepo";
import { HeadSar } from "./Amount";
import { SupplierIndex, useIndexCollapse } from "./SupplierIndex";
import { readError, useKeyedWatch } from "./useLedgerData";
import l from "./Ledger.module.css";
import s from "./Review.module.css";

type Filter = ReviewSection | "all";
type Outcome = { tone: "ok" | "err"; text: string; undo?: boolean };

const SECTION_HEAD: Record<ReviewSection, { unit: string; about: string }> = {
  dates: {
    unit: "قيداً بتواريخ معطوبة",
    about:
      "التاريخ المسجّل خارج المنطق (مقلوب يوماً وشهراً أو مستقبلي). المرجّح يظهر للحالات المعروفة؛ الحالي مشطوب والمرجّح بجانبه.",
  },
  dups: {
    unit: "أرقاماً مرجعية مكررة",
    about: "رقم مرجعي أو سند مسجّل لأكثر من حركة. افتح الحركة للتأكد أنها مختلفة، أو تجاهل التنبيه.",
  },
  untyped: {
    unit: "سجلاً بلا نوع",
    about: "حركات لم يُحدَّد أنها فاتورة أو قيد، فلا يُعرف في أي عمود تُسجَّل.",
  },
  other: {
    unit: "سجلاً بأسباب أخرى",
    about:
      "مرجع بطول مخالف أو لا يطابق رقمه، سند نصي، حركة بلا مبلغ، قيد مُعلَّم أصفر، وما شابه. السبب مكتوب في كل سجل.",
  },
};

const CHIP: Record<ReviewSection, string> = {
  dates: "تواريخ",
  dups: "مكرر",
  untyped: "بلا نوع",
  other: "أخرى",
};

/** مركز المراجعة (النموذج المعتمد review.html + قسم «أخرى»): للمالك والإدارة فقط. */
export function ReviewPage() {
  const profile = useProfile();
  const idx = useIndexCollapse();
  const [only, setOnly] = useState<Filter>("all");
  const [ignoring, setIgnoring] = useState<ReviewRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [undoRow, setUndoRow] = useState<ReviewRow | null>(null);

  const issues = useKeyedWatch("open", watchOpenIssues, "قراءة سجلات المراجعة");
  const ids = issues.status === "ready" ? [...new Set(issues.data.map((x) => x.entryId))].sort() : [];
  const idsKey = issues.status === "ready" ? `e:${ids.join(",")}` : null;
  const entries = useKeyedWatch<Map<string, LedgerEntry>>(
    idsKey,
    (onData, onError) => watchEntriesByIds(ids, onData, onError),
    "قراءة حركات المراجعة",
  );
  // تبقى الحركات السابقة ظاهرة أثناء إعادة الاشتراك بعد إغلاق سجل (لا وميض «…» في كل الجدول)
  const [entryMap, setEntryMap] = useState<Map<string, LedgerEntry>>(() => new Map());
  if (entries.status === "ready" && entries.data !== entryMap) setEntryMap(entries.data);
  const sections = useMemo(
    () => buildReview(issues.status === "ready" ? issues.data : [], entryMap),
    [issues, entryMap],
  );
  const counts = reviewCountsOf(sections);
  const loading =
    issues.status === "loading" || (entries.status === "loading" && !entryMap.size && ids.length > 0);
  const shown = SECTION_ORDER.filter((k) => only === "all" || only === k);

  const resolve = async (row: ReviewRow, how: "ignored" | "reopened", text = "") => {
    setBusy(true);
    try {
      await setResolution(profile.uid, row.issue.id, how, text);
      setUndoRow(how === "ignored" ? row : null);
      setOutcome(
        how === "ignored"
          ? {
              tone: "ok",
              text: `تجاهلتَ تنبيه ${row.issue.supplierName} الصف ${row.issue.row}، وسُجّل في التدقيق.`,
              undo: true,
            }
          : { tone: "ok", text: `أُعيد فتح سجل ${row.issue.supplierName} الصف ${row.issue.row}.` },
      );
      setIgnoring(null);
      setNote("");
    } catch (e) {
      setOutcome({ tone: "err", text: `لم يُحفظ: ${readError(e, "تعديل سجل المراجعة")}` });
    } finally {
      setBusy(false);
    }
  };
  const filterButtons = (cls: string | undefined, content: (k: Filter, n: number) => ReactNode) =>
    (["all", ...SECTION_ORDER] as Filter[]).map((k) => (
      <li key={k}>
        <button type="button" className={cls} aria-pressed={only === k} onClick={() => setOnly(k)}>
          {content(k, k === "all" ? counts.total : counts[k])}
        </button>
      </li>
    ));

  return (
    <div className={`${l.sheet} ${idx.collapsed ? l.collapsed : ""}`}>
      <SupplierIndex collapsed={idx.collapsed} onToggle={idx.toggle} title="أقسام المراجعة">
        <ul className={l.ixList}>
          {filterButtons(l.ixItem, (k, n) => (
            <>
              <span>{k === "all" ? "كل الأقسام" : SECTION_TITLE[k]}</span>
              <span className={`num ${n && k !== "all" ? l.neg : ""}`}>{n}</span>
            </>
          ))}
        </ul>
      </SupplierIndex>

      <main className={l.main} id="main">
        <div className={l.pageHead}>
          <div>
            <h1 className={l.h1}>مركز المراجعة</h1>
            <p className={l.sub}>سجلات منقولة تحتاج قراراً قبل اعتماد الأرصدة</p>
          </div>
        </div>

        <ul className={s.chips} aria-label="عرض قسم">
          {filterButtons(s.chip, (k, n) => (
            <>
              {k === "all" ? "الكل" : CHIP[k]} <span className="num">{n}</span>
            </>
          ))}
        </ul>

        <p className={l.status} role="status" aria-live="polite">
          {loading ? "جارٍ تحميل سجلات المراجعة…" : busy ? "جارٍ الحفظ…" : ""}
        </p>
        {issues.status === "error" ? <Banner tone="err">{issues.message}</Banner> : null}
        {entries.status === "error" ? <Banner tone="err">{entries.message}</Banner> : null}
        {outcome ? (
          <div className={s.outcome}>
            <Banner tone={outcome.tone}>
              {outcome.text}
              {outcome.undo && undoRow ? (
                <button
                  type="button"
                  className={s.undo}
                  disabled={busy}
                  onClick={() => void resolve(undoRow, "reopened")}
                >
                  تراجع
                </button>
              ) : null}
            </Banner>
          </div>
        ) : null}

        {issues.status === "ready" && !counts.total ? (
          <p className={s.empty}>لا سجلات تنتظر المراجعة. كل ما نُقل من الإكسل عولج أو تُجوهل.</p>
        ) : null}

        {issues.status === "ready"
          ? shown.map((k) =>
              sections[k].length || only === k ? (
                <Section
                  key={k}
                  k={k}
                  rows={sections[k]}
                  entriesReady={entries.status === "ready"}
                  busy={busy}
                  onIgnore={(r) => {
                    setOutcome(null);
                    setNote("");
                    setIgnoring(r);
                  }}
                />
              ) : null,
            )
          : null}
      </main>

      <aside className={l.side} aria-label="ملخص المراجعة">
        <section aria-labelledby="rv-tally" className={s.dOnly}>
          <h2 id="rv-tally">المطلوب مراجعته</h2>
          <ul className={s.tally}>
            {filterButtons(s.tallyBtn, (k, n) => (
              <>
                <span className="num">{n}</span>
                <span>{k === "all" ? "سجلاً في كل الأقسام" : SECTION_HEAD[k].unit}</span>
              </>
            ))}
          </ul>
          <p>
            الإجمالي <span className="num">{counts.total}</span> سجلاً، وقد يجمع السجل أكثر من سبب فيظهر في
            أكثر من قسم.
          </p>
        </section>
        <section aria-labelledby="rv-rules">
          <h2 id="rv-rules">قبل أن تقرر</h2>
          <p>
            «تجاهل» يبقي الحركة كما هي ويغلق التنبيه، ويُسجَّل في التدقيق مع سببك إن كتبته. يمكن التراجع
            فوراً.
          </p>
          <p>
            تصحيح الحركة نفسها من نافذة «تعديل الحركة»، وهي بانتظار اعتماد نموذجها؛ إلى حينها افتح الحركة في
            كشف المورد.
          </p>
        </section>
      </aside>

      <Dialog
        isOpen={ignoring !== null}
        title="تجاهل التنبيه"
        onDismiss={busy ? undefined : () => setIgnoring(null)}
      >
        {ignoring ? (
          <>
            <p className={d.sub}>
              {ignoring.issue.supplierName} · الصف <span className="num">{ignoring.issue.row}</span>:{" "}
              {ignoring.reasons.map((x) => x.text).join("؛ ")}
            </p>
            <p className={d.sub}>تبقى الحركة كما هي، ويُغلق هذا السجل في كل أقسامه.</p>
            <label className={s.noteField}>
              <span className={s.fl}>السبب (اختياري، يُحفظ في التدقيق)</span>
              <input
                className={s.in}
                value={note}
                maxLength={IGNORE_NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثال: الحركتان مختلفتان، تأكدت من الفاتورة الأصلية"
              />
            </label>
            <div className={d.actions}>
              <Button variant="primary" busy={busy} onClick={() => void resolve(ignoring, "ignored", note)}>
                تجاهل التنبيه
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setIgnoring(null)}>
                إلغاء
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}

function Section(p: {
  k: ReviewSection;
  rows: ReviewRow[];
  entriesReady: boolean;
  busy: boolean;
  onIgnore: (r: ReviewRow) => void;
}) {
  const head = SECTION_HEAD[p.k];
  const id = `rv-${p.k}`;
  return (
    <section className={s.rv} id={p.k} aria-labelledby={id}>
      <header className={s.rvHead}>
        <h2 id={id}>
          <span className={`num ${s.rvN}`}>{p.rows.length}</span>
          {head.unit}
        </h2>
        <p>{head.about}</p>
      </header>
      {!p.rows.length ? (
        <p className={s.empty}>لا سجلات في هذا القسم.</p>
      ) : (
        <div className={l.tableWrap}>
          <table className={`${l.ledger} ${s.rvt}`}>
            <caption className="sr-only">
              {SECTION_TITLE[p.k]}: {p.rows.length}
            </caption>
            <thead>
              <tr>
                <th scope="col">المورد والصف</th>
                {p.k === "dates" ? (
                  <>
                    <th scope="col">التاريخ الحالي</th>
                    <th scope="col">المرجّح</th>
                  </>
                ) : (
                  <>
                    <th scope="col">الرقم المرجعي</th>
                    <th scope="col">التاريخ</th>
                  </>
                )}
                <th scope="col" className={`${l.amt} ${l.hideTp}`}>
                  المبلغ
                  <HeadSar />
                </th>
                <th scope="col">السبب</th>
                <th scope="col">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <Row
                  key={r.issue.id}
                  r={r}
                  k={p.k}
                  entriesReady={p.entriesReady}
                  busy={p.busy}
                  onIgnore={p.onIgnore}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row(p: {
  r: ReviewRow;
  k: ReviewSection;
  entriesReady: boolean;
  busy: boolean;
  onIgnore: (r: ReviewRow) => void;
}) {
  const { r } = p;
  const e = r.entry;
  const missing = p.entriesReady && !e ? "الحركة غير موجودة" : "…";
  const date = e?.date ? formatDate(e.date) : "—";
  const amount = e
    ? e.credit
      ? { h: e.credit, side: "دائن" }
      : e.debit
        ? { h: e.debit, side: "مدين" }
        : null
    : null;
  return (
    <tr>
      <th scope="row" data-l="المورد" className={s.sup}>
        {r.issue.supplierName || r.issue.supplierId}
        <small className={s.sheet}>
          الصف <span className="num">{r.issue.row}</span> في الإكسل
          {r.issue.sheet && r.issue.sheet !== r.issue.supplierName ? ` · ورقة ${r.issue.sheet}` : ""}
        </small>
      </th>
      {p.k === "dates" ? (
        <>
          <td data-l="التاريخ الحالي">
            {e ? (
              <s className={s.cur}>
                <span className="num">{date}</span>
              </s>
            ) : (
              missing
            )}
          </td>
          <td data-l="المرجّح">
            {r.suggestedDate ? (
              <ins className={s.sug}>
                <span className="num">{formatDate(r.suggestedDate)}</span>
              </ins>
            ) : (
              <span className={s.none}>بلا ترجيح</span>
            )}
          </td>
        </>
      ) : (
        <>
          <td data-l="الرقم المرجعي">{e ? <span className="num">{e.refNo || "—"}</span> : missing}</td>
          <td data-l="التاريخ">
            <span className="num">{e ? date : ""}</span>
          </td>
        </>
      )}
      <td data-l="المبلغ" className={`${l.amt} ${l.hideTp}`}>
        {amount ? (
          <>
            <span className="num">{formatMoney(amount.h)}</span>{" "}
            <small className={s.side}>{amount.side}</small>
          </>
        ) : (
          <span className={s.none}>{e ? "بلا مبلغ" : ""}</span>
        )}
      </td>
      <td data-l="السبب" className={s.why}>
        {r.reasons.map((x) => (
          <span key={x.code + x.text} className={s.reason}>
            <ReasonText text={x.text || x.code} />
          </span>
        ))}
      </td>
      <td data-l="الإجراء" className={s.act}>
        <div className={s.acts}>
          <Link className={s.open} to={`/statement/${r.issue.supplierId}`}>
            فتح في الكشف
          </Link>
          <Button size="sm" variant="ghost" disabled={p.busy} onClick={() => p.onIgnore(r)}>
            تجاهل
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** نص السبب كما كتبه سكربت النقل، بتواريخه يوماً/شهراً/سنة كبقية النظام وبلا كسر داخل التاريخ. */
function ReasonText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d{4}-\d{2}-\d{2})/).map((part, i) =>
        i % 2 ? (
          <span key={i} className="num">
            {formatDate(part)}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
