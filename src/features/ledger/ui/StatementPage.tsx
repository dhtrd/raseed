import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { asPeriod, PeriodFilter, type Period } from "../../../shared/fields/components/PeriodFilter";
import { Segment } from "../../../shared/fields/components/Segment";
import { SupplierCombobox } from "../../../shared/fields/components/SupplierCombobox";
import { formatDate, todayInRiyadh } from "../../../shared/fields/core/date";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Icon, RIYAL_PATH } from "../../../shared/ui/Icon";
import { useProfile } from "../../auth/session/SessionProvider";
import { isManager } from "../../users/core/users";
import {
  balanceState,
  buildStatement,
  currentQuarter,
  kindLabel,
  type LedgerEntry,
  type StatementRow,
} from "../core/ledger";
import { sortRows, type SortState } from "../core/sort";
import { watchLockedThrough } from "../data/invoicesRepo";
import { openingBalance, watchStatement } from "../data/ledgerRepo";
import { buildStatementExport } from "../core/exportModel";
import { StatementPrint } from "../export/StatementPrint";
import { downloadStatementXlsx } from "../export/statementXlsx";
import { Amount, HeadSar, Money } from "./Amount";
import { EditEntryDialog, type EditTarget } from "./EditEntryDialog";
import { MobileSort, SortTh } from "./Sorting";
import { SupplierIndex, useIndexCollapse } from "./SupplierIndex";
import { useKeyedLoad, useKeyedWatch, useLedgerVersion, useVisibleSuppliers } from "./useLedgerData";
import l from "./Ledger.module.css";
import s from "./Statement.module.css";

type Scope = "all" | "period";
type Col = "date" | "ref" | "debit" | "credit" | "balance";

/** كشف حساب مورد (direction-1/statement.html): رصيد افتتاحي ورصيد جارٍ، والأحدث أولاً افتراضياً (SPEC). */
export function StatementPage() {
  const profile = useProfile();
  const { sid } = useParams();
  const navigate = useNavigate();
  const today = todayInRiyadh();
  const idx = useIndexCollapse();
  const suppliers = useVisibleSuppliers(profile);

  // القادم من لوحة الأرصدة يفتح بفترتها نفسها، و«كل الحركات» يزيل الفلترة
  const location = useLocation();
  const [fromDashboard] = useState(() => asPeriod((location.state as { period?: unknown } | null)?.period));
  // القادم من البحث العام: إبراز الحركة، وفتح «كل الحركات» كي تظهر أياً كانت الفترة
  const nav = location.state as { highlight?: unknown; deleted?: unknown } | null;
  const highlightId = typeof nav?.highlight === "string" ? nav.highlight : null;
  const highlightDeleted = nav?.deleted === true;
  const [navKey, setNavKey] = useState(location.key);
  const [scope, setScope] = useState<Scope>(fromDashboard ? "period" : "all");
  const [period, setPeriod] = useState<Period>(() => fromDashboard ?? currentQuarter(today));
  const [sort, setSort] = useState<SortState<Col>>({ key: "date", dir: "desc" });
  if (navKey !== location.key) {
    setNavKey(location.key);
    if (highlightId) setScope("all");
  }
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [retry, setRetry] = useState(0);
  // التعديل من الكشف (DECISIONS 2026-10-11، الخيار ب): للمالك والإدارة فقط، والقواعد تفرض ذلك
  const canEdit = isManager(profile.role);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const lock = useKeyedWatch<string | null>(
    canEdit ? "lock" : null,
    watchLockedThrough,
    "قراءة تاريخ الإقفال",
  );
  const cols = canEdit ? 10 : 9;

  const list = suppliers.status === "ready" ? suppliers.data : [];
  const supplier = sid ? list.find((x) => x.id === sid) : undefined;
  const range = scope === "period" ? period : null;

  const watchKey = supplier ? `${supplier.id}|${range?.from ?? ""}|${range?.to ?? ""}|${retry}` : null;
  const entries = useKeyedWatch<LedgerEntry[]>(
    watchKey,
    (onData, onError) => watchStatement(supplier?.id ?? "", range, onData, onError),
    "قراءة حركات المورد",
  );
  // الحركات مباشرة؛ والرصيد الافتتاحي (للفترة فقط) يُعاد حسابه تلقائياً بعد أي تغيير لحركات المورد
  const live = useLedgerVersion(supplier && range ? [supplier.id] : null);
  const opening = useKeyedLoad(
    supplier ? `${supplier.id}|${range?.from ?? ""}|${retry}.${live.version}` : null,
    () => openingBalance(supplier?.id ?? "", range?.from ?? null),
    "حساب الرصيد الافتتاحي",
    supplier ? `${supplier.id}|${range?.from ?? ""}` : null,
  );

  const st = useMemo(
    () =>
      entries.status === "ready" && opening.status === "ready"
        ? buildStatement(opening.data, entries.data)
        : null,
    [entries, opening],
  );
  const rows = useMemo(() => {
    if (!st) return [];
    const pos = new Map(st.rows.map((r, i) => [r.id, i]));
    return sortRows(st.rows, sort, (r, k) =>
      k === "date" ? (pos.get(r.id) ?? 0) : k === "ref" ? r.mainRef : k === "balance" ? r.balance : r[k],
    );
  }, [st, sort]);

  const error =
    suppliers.status === "error"
      ? suppliers.message
      : entries.status === "error"
        ? entries.message
        : opening.status === "error"
          ? opening.message
          : null;
  const loading = !error && Boolean(supplier) && !st;
  const closingLabel = range ? "الرصيد الختامي للفترة" : "الرصيد الكلي";

  // وقت الطباعة يُحدَّث لحظة فتح نافذة الطباعة (زرّنا أو Ctrl+P)
  const [printNow, setPrintNow] = useState(() => new Date());
  useEffect(() => {
    const before = () => flushSync(() => setPrintNow(new Date()));
    window.addEventListener("beforeprint", before);
    return () => window.removeEventListener("beforeprint", before);
  }, []);
  const exportModel = useMemo(
    () =>
      st && supplier
        ? buildStatementExport({ supplierName: supplier.name, statement: st, range, today, now: printNow })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- حدود الفترة تكفي
    [st, supplier?.name, range?.from, range?.to, today, printNow],
  );
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportXlsx = async () => {
    if (!st || !supplier) return;
    setXlsxBusy(true);
    setExportError(null);
    try {
      const model = buildStatementExport({
        supplierName: supplier.name,
        statement: st,
        range,
        today,
        now: new Date(),
      });
      await downloadStatementXlsx(model, RIYAL_PATH);
    } catch (e) {
      console.error("تعذّر إنشاء ملف Excel", e);
      setExportError("تعذّر إنشاء ملف Excel. أعد المحاولة، وإن تكرر فأبلغ المالك.");
    } finally {
      setXlsxBusy(false);
    }
  };

  return (
    <div className={`${l.sheet} ${idx.collapsed ? l.collapsed : ""}`}>
      <SupplierIndex collapsed={idx.collapsed} onToggle={idx.toggle}>
        <ul className={l.ixList}>
          {list.map((x) => (
            <li key={x.id}>
              <Link
                to={`/statement/${x.id}`}
                className={l.ixItem}
                aria-current={x.id === sid ? "page" : undefined}
              >
                <span>{x.name}</span>
                {x.id === sid && st ? <Amount h={st.closing} /> : null}
              </Link>
            </li>
          ))}
        </ul>
        {suppliers.status === "loading" ? <p className={l.ixNote}>جارٍ التحميل…</p> : null}
      </SupplierIndex>

      <main className={l.main} id="main">
        <div className={l.pageHead}>
          <div>
            <h1 className={l.h1}>{supplier ? supplier.name : "كشف الحساب"}</h1>
            <p className={l.sub}>
              {!supplier
                ? "اختر مورداً لعرض كشف حسابه."
                : range
                  ? `الحركات من ${formatDate(range.from)} إلى ${formatDate(range.to)}`
                  : "كشف حساب مورد بكل الحركات المسجّلة"}
            </p>
          </div>
          {st ? (
            <div className={s.balanceBox}>
              <p className={s.bbL}>{closingLabel}</p>
              <p className={s.bbN}>
                <Money h={st.closing} />
              </p>
              <p className={`${s.bbS} ${st.closing < 0 ? l.neg : ""}`}>{balanceState(st.closing).label}</p>
            </div>
          ) : null}
        </div>

        <div className={s.toolbar}>
          <div className={s.pickSup}>
            {suppliers.status === "ready" ? (
              <SupplierCombobox
                key={sid ?? "none"}
                suppliers={list}
                value={supplier?.id ?? null}
                onChange={(id) => {
                  if (id && id !== sid) navigate(`/statement/${id}`);
                }}
              />
            ) : null}
          </div>
          {supplier ? (
            <div className={s.range}>
              <Segment
                label="النطاق"
                value={scope}
                onChange={setScope}
                options={[
                  { value: "all", label: "كل الحركات" },
                  { value: "period", label: "فترة" },
                ]}
              />
              {scope === "period" ? <PeriodFilter value={period} onChange={setPeriod} today={today} /> : null}
            </div>
          ) : null}
          {exportModel ? (
            <div className={s.exports}>
              <Button variant="ghost" busy={xlsxBusy} onClick={() => void exportXlsx()}>
                تصدير Excel
              </Button>
              <Button variant="ghost" onClick={() => window.print()}>
                طباعة / PDF
              </Button>
            </div>
          ) : null}
        </div>
        {exportError ? (
          <div className={s.err}>
            <Banner tone="err">{exportError}</Banner>
          </div>
        ) : null}
        {highlightId && highlightDeleted ? (
          <div className={s.err}>
            <Banner tone="info">الحركة المطلوبة محذوفة، فلا تظهر في الكشف.</Banner>
          </div>
        ) : null}
        {saved ? (
          <div className={s.err}>
            <Banner tone="ok">{saved}</Banner>
          </div>
        ) : null}

        <p className={l.status} role="status" aria-live="polite">
          {loading ? "جارٍ تحميل الكشف…" : ""}
        </p>
        {error ? (
          <div className={s.err}>
            <Banner tone="err">{error}</Banner>
            <Button size="sm" onClick={() => setRetry((n) => n + 1)}>
              إعادة المحاولة
            </Button>
          </div>
        ) : null}
        {sid && suppliers.status === "ready" && !supplier ? (
          <Banner tone="err">هذا المورد غير موجود أو غير مسند إليك. اختر مورداً من القائمة.</Banner>
        ) : null}

        {st && supplier ? (
          <>
            {range ? (
              <p className={s.opening}>
                الرصيد الافتتاحي قبل <span className="num">{formatDate(range.from)}</span>:{" "}
                <Amount h={st.opening} />
              </p>
            ) : null}
            <MobileSort
              sort={sort}
              onSort={setSort}
              options={[
                { key: "date", label: "التاريخ" },
                { key: "debit", label: "مدين" },
                { key: "credit", label: "دائن" },
                { key: "balance", label: "الرصيد" },
                { key: "ref", label: "المرجع", firstDir: "asc" },
              ]}
            />
            <div className={l.tableWrap}>
              <table className={`${l.ledger} ${s.stmt}`}>
                <caption className="sr-only">حركات كشف حساب {supplier.name}</caption>
                <thead>
                  <tr>
                    <SortTh k="date" sort={sort} onSort={setSort}>
                      التاريخ
                    </SortTh>
                    <th scope="col" className={l.hideTl}>
                      النوع
                    </th>
                    <SortTh k="ref" sort={sort} onSort={setSort} firstDir="asc" className={l.hideTl}>
                      المرجع
                    </SortTh>
                    <th scope="col" className={l.hideTp}>
                      الرقم المرجعي
                    </th>
                    <th scope="col" className={l.hideTl}>
                      السند
                    </th>
                    <th scope="col" className={`${l.hideTl} ${s.cDesc}`}>
                      البيان
                    </th>
                    <SortTh k="debit" sort={sort} onSort={setSort} className={l.amt}>
                      مدين
                      <HeadSar />
                    </SortTh>
                    <SortTh k="credit" sort={sort} onSort={setSort} className={l.amt}>
                      دائن
                      <HeadSar />
                    </SortTh>
                    <SortTh k="balance" sort={sort} onSort={setSort} className={l.amt}>
                      الرصيد
                      <HeadSar />
                    </SortTh>
                    {canEdit ? (
                      <th scope="col" className={s.cEdit}>
                        <span className="sr-only">تعديل</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className={l.more}>
                      <td colSpan={cols}>
                        {range ? "لا حركات في هذه الفترة." : "لا حركات لهذا المورد بعد."}
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((r) => (
                    <EntryRow
                      key={r.id}
                      r={r}
                      cols={cols}
                      highlighted={r.id === highlightId}
                      onEdit={
                        canEdit
                          ? () => {
                              setSaved(null);
                              setEditing({
                                entry: r,
                                supplierName: supplier.name,
                                issueId: null,
                                sheetRow: null,
                                reasons: [],
                                suggestedDate: null,
                              });
                            }
                          : undefined
                      }
                      open={open.has(r.id)}
                      onToggle={() =>
                        setOpen((o) => {
                          const n = new Set(o);
                          if (n.has(r.id)) n.delete(r.id);
                          else n.add(r.id);
                          return n;
                        })
                      }
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className={l.total}>
                    <th scope="row">{closingLabel}</th>
                    <td className={l.hideTl} />
                    <td className={l.hideTl} />
                    <td className={l.hideTp} />
                    <td className={l.hideTl} />
                    <td className={l.hideTl} />
                    <td className={l.amt} />
                    <td className={l.amt} />
                    <td className={`${l.amt} ${s.bal}`}>
                      <Amount h={st.closing} />
                    </td>
                    {canEdit ? <td className={s.cEdit} /> : null}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className={l.legend}>
              الرصيد تراكمي: يُضاف المدين ويُطرح الدائن بعد كل حركة بترتيبها الزمني، أياً كان ترتيب العرض.{" "}
              <b>السالب</b> مستحق للمورد. الملاحظة لا تؤثر على الرصيد.
            </p>
          </>
        ) : null}
      </main>

      <EditEntryDialog
        target={editing}
        uid={profile.uid}
        lockedThrough={lock.status === "ready" ? lock.data : null}
        canUnlock={profile.role === "owner"}
        onClose={() => setEditing(null)}
        onSaved={(text) => {
          setEditing(null);
          setSaved(text);
        }}
      />

      <aside className={l.side} aria-label="ملخص الكشف">
        <section aria-labelledby="sm-h">
          <h2 id="sm-h">ملخص الكشف</h2>
          {st ? (
            <dl className={s.stats}>
              {range ? (
                <div>
                  <dt>الرصيد الافتتاحي</dt>
                  <dd>
                    <Amount h={st.opening} />
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>مجموع المدين</dt>
                <dd>
                  <Amount h={st.debit} />
                </dd>
              </div>
              <div>
                <dt>مجموع الدائن</dt>
                <dd>
                  <Amount h={st.credit} />
                </dd>
              </div>
              <div>
                <dt>{closingLabel}</dt>
                <dd>
                  <Amount h={st.closing} />
                </dd>
              </div>
              <div>
                <dt>الحركات</dt>
                <dd className="num">{st.financialCount.toLocaleString("en-US")}</dd>
              </div>
              {st.noteCount ? (
                <div>
                  <dt>ملاحظات</dt>
                  <dd className="num">{st.noteCount}</dd>
                </div>
              ) : null}
              {st.reviewCount ? (
                <div>
                  <dt>للمراجعة</dt>
                  <dd className={`num ${l.neg}`}>{st.reviewCount}</dd>
                </div>
              ) : null}
              <div>
                <dt>آخر حركة</dt>
                <dd className="num">{st.lastDate ? formatDate(st.lastDate) : "—"}</dd>
              </div>
            </dl>
          ) : (
            <p>{supplier ? "جارٍ التحميل…" : "اختر مورداً."}</p>
          )}
        </section>
        <section aria-labelledby="sx-h">
          <h2 id="sx-h">التصدير والطباعة</h2>
          <p>
            الطباعة والتصدير بالنطاق المعروض، من الأقدم إلى الأحدث أياً كان ترتيب الشاشة. ملف PDF يُحفظ من
            نافذة الطباعة باختيار «حفظ بتنسيق PDF». وسم «للمراجعة» داخلي لا يظهر فيهما.
          </p>
        </section>
      </aside>
      {exportModel ? <StatementPrint x={exportModel} /> : null}
    </div>
  );
}

function EntryRow(p: {
  r: StatementRow;
  cols: number;
  /** الحركة المطلوبة من البحث العام */
  highlighted: boolean;
  open: boolean;
  onToggle: () => void;
  /** للمالك والإدارة فقط */
  onEdit?: () => void;
}) {
  const { r } = p;
  const k = kindLabel(r);
  const desc = r.kind === "note" ? r.note : r.details;
  const tags = (
    <>
      <span className={`${s.typeTag} ${s[r.kind]}`}>{k.label}</span>
      {k.tag ? <span className={s.flag}>{k.tag}</span> : null}
      {r.needsManualFix ? <span className={`${s.flag} ${s.review}`}>للمراجعة</span> : null}
    </>
  );
  return (
    <>
      <tr
        className={`${r.kind === "note" ? s.noteRow : ""} ${p.onEdit ? s.withEdit : ""} ${
          p.highlighted ? s.hl : ""
        }`}
        data-entry={r.id}
        ref={(el) => {
          if (el && p.highlighted) el.scrollIntoView({ block: "center" });
        }}
      >
        <th scope="row" className={s.cDate}>
          <span className={l.cellIn}>
            <button
              type="button"
              className={l.xp}
              aria-expanded={p.open}
              aria-label={`تفاصيل حركة ${r.refNo || formatDate(r.date)}`}
              onClick={p.onToggle}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={l.ic}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <span className="num">{formatDate(r.date)}</span>
          </span>
        </th>
        <td className={`${s.cType} ${l.hideTl}`}>
          <span className={s.tags}>{tags}</span>
        </td>
        <td className={`${s.cRef} ${l.hideTl}`}>
          <span className="num">{r.mainRef}</span>
        </td>
        <td className={`${s.cRefno} ${l.hideTp}`}>
          <span className="num">{r.refNo}</span>
        </td>
        <td className={`${s.cV} ${l.hideTl}`}>
          {r.voucher ? (
            <>
              <span className={s.mInline}>سند </span>
              <span className="num">{r.voucher}</span>
            </>
          ) : null}
        </td>
        <td className={`${s.cDesc} ${l.hideTl}`}>{desc}</td>
        <td className={`${l.amt} ${s.cDr}`} data-l={r.debit ? "مدين" : undefined}>
          {r.debit ? <Amount h={r.debit} /> : null}
        </td>
        <td className={`${l.amt} ${s.cCr}`} data-l={r.credit ? "دائن" : undefined}>
          {r.credit ? <Amount h={r.credit} /> : null}
        </td>
        <td className={`${l.amt} ${s.bal}`} data-l="الرصيد">
          <Amount h={r.balance} />
        </td>
        {p.onEdit ? (
          <td className={s.cEdit}>
            <button
              type="button"
              className={s.pen}
              aria-label={`تعديل الحركة ${r.refNo || formatDate(r.date)}`}
              title="تعديل الحركة"
              onClick={p.onEdit}
            >
              <Icon name="edit" />
            </button>
          </td>
        ) : null}
      </tr>
      {p.open ? (
        <tr className={l.rowDetail}>
          <td colSpan={p.cols}>
            <dl className={l.dlInline}>
              <div>
                <dt>النوع</dt>
                <dd className={s.tags}>{tags}</dd>
              </div>
              <div>
                <dt>المرجع</dt>
                <dd className="num">{r.mainRef || "—"}</dd>
              </div>
              <div>
                <dt>الرقم المرجعي</dt>
                <dd className="num">{r.refNo || "—"}</dd>
              </div>
              <div>
                <dt>السند</dt>
                <dd>{r.voucher ? <span className="num">{r.voucher}</span> : "بلا سند"}</dd>
              </div>
              <div>
                <dt>{r.kind === "note" ? "الملاحظة" : "البيان"}</dt>
                <dd>{desc || "—"}</dd>
              </div>
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  );
}
