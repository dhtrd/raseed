import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { PeriodFilter, type Period } from "../../../shared/fields/components/PeriodFilter";
import { Segment } from "../../../shared/fields/components/Segment";
import { SupplierCombobox } from "../../../shared/fields/components/SupplierCombobox";
import { formatDate, todayInRiyadh } from "../../../shared/fields/core/date";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Icon, RIYAL_PATH } from "../../../shared/ui/Icon";
import { useProfile } from "../../auth/session/SessionProvider";
import { isManager } from "../../users/core/users";
import { riyadhStamp, safeFileName } from "../core/exportModel";
import {
  filterJournals,
  isRefund,
  journalAmount,
  journalCounts,
  type JournalRow,
  type JournalTag,
} from "../core/journals";
import { currentQuarter, type LedgerEntry } from "../core/ledger";
import { sortRows, type SortState } from "../core/sort";
import { watchJournals, watchLockedThrough } from "../data/invoicesRepo";
import { downloadJournalsXlsx } from "../export/journalsXlsx";
import { Amount, HeadSar, Money } from "./Amount";
import { DeleteEntryDialog, type DeleteTarget } from "./DeleteEntryDialog";
import { EditEntryDialog, type EditTarget } from "./EditEntryDialog";
import { MobileSort, SortTh } from "./Sorting";
import { SupplierIndex, useIndexCollapse } from "./SupplierIndex";
import { useKeyedWatch, useVisibleSuppliers } from "./useLedgerData";
import l from "./Ledger.module.css";
import s from "./Journals.module.css";

type Scope = "all" | "period";
type Col = "date" | "ref" | "amount";

/**
 * فهرس القيود (الخيار أ المعتمد في proposals/2026-10-11-journals.html): جدول واحد بنمط فهرس الفواتير،
 * بفلترة المورد والفترة والوسم (سداد/استرداد)، وعدّادات وإجمالي، وتصدير Excel، والتعديل بالقلم للمالك والإدارة.
 */
export function JournalsPage() {
  const profile = useProfile();
  const manager = isManager(profile.role);
  const { sid } = useParams();
  const navigate = useNavigate();
  const today = todayInRiyadh();
  const idx = useIndexCollapse();
  const suppliers = useVisibleSuppliers(profile);

  const [scope, setScope] = useState<Scope>("period");
  const [period, setPeriod] = useState<Period>(() => currentQuarter(today));
  const [tag, setTag] = useState<JournalTag>("all");
  const [sort, setSort] = useState<SortState<Col>>({ key: "date", dir: "desc" });
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const list = useMemo(() => (suppliers.status === "ready" ? suppliers.data : []), [suppliers]);
  const supplier = sid ? list.find((x) => x.id === sid) : undefined;
  const names = useMemo(() => new Map(list.map((x) => [x.id, x.name])), [list]);
  const range = scope === "period" ? period : null;

  // المالك والإدارة: كل الموردين أو المختار؛ مدخل البيانات: موردوه المسندون دائماً (القواعد)
  const ids: string[] | null =
    suppliers.status !== "ready" || (sid && !supplier)
      ? []
      : supplier
        ? [supplier.id]
        : manager
          ? null
          : list.map((x) => x.id);
  const watchKey =
    suppliers.status === "ready"
      ? `${ids === null ? "*" : ids.join(",")}|${range?.from ?? ""}|${range?.to ?? ""}`
      : null;
  const journals = useKeyedWatch<LedgerEntry[]>(
    watchKey,
    (ok, err) => watchJournals(ids, range, ok, err),
    "قراءة القيود",
  );
  const lock = useKeyedWatch<string | null>(
    manager ? "lock" : null,
    watchLockedThrough,
    "قراءة تاريخ الإقفال",
  );

  const all: JournalRow[] = useMemo(
    () =>
      journals.status === "ready"
        ? journals.data.map((e) => ({ ...e, supplierName: names.get(e.supplierId) ?? e.supplierId }))
        : [],
    [journals, names],
  );
  const shown = useMemo(() => filterJournals(all, tag), [all, tag]);
  const counts = useMemo(() => journalCounts(shown), [shown]);
  const rows = useMemo(() => {
    const pos = new Map(shown.map((r, i) => [r.id, i]));
    return sortRows(shown, sort, (r, k) =>
      k === "date" ? (pos.get(r.id) ?? 0) : k === "ref" ? r.refNo : journalAmount(r),
    );
  }, [shown, sort]);

  const scopeLabel = `${supplier ? supplier.name : manager ? "كل الموردين" : "موردوك المسندون"} · ${
    range ? `من ${formatDate(range.from)} إلى ${formatDate(range.to)}` : "كل الفترات"
  }${tag === "pay" ? " · سداد" : tag === "refund" ? " · استرداد" : ""}`;

  const exportXlsx = async () => {
    setXlsxBusy(true);
    setExportError(null);
    try {
      // الملف بالترتيب الزمني من الأقدم أياً كان ترتيب الشاشة
      await downloadJournalsXlsx(
        shown,
        {
          scopeLabel,
          printedAt: riyadhStamp(new Date(), today),
          fileBase: safeFileName(`القيود-${supplier?.name ?? "الكل"}-${today}`),
        },
        RIYAL_PATH,
      );
    } catch (e) {
      console.error("تعذّر إنشاء ملف Excel للقيود", e);
      setExportError("تعذّر إنشاء ملف Excel. أعد المحاولة، وإن تكرر فأبلغ المالك.");
    } finally {
      setXlsxBusy(false);
    }
  };

  const error =
    suppliers.status === "error" ? suppliers.message : journals.status === "error" ? journals.message : null;
  const loading = !error && journals.status === "loading";
  const cols = manager ? 7 : 6;

  return (
    <div className={`${l.sheet} ${idx.collapsed ? l.collapsed : ""}`}>
      <SupplierIndex collapsed={idx.collapsed} onToggle={idx.toggle}>
        <ul className={l.ixList}>
          <li>
            <Link to="/journals" className={l.ixItem} aria-current={!sid ? "page" : undefined}>
              <span>{manager ? "كل الموردين" : "كل موردِيك"}</span>
            </Link>
          </li>
          {list.map((x) => (
            <li key={x.id}>
              <Link
                to={`/journals/${x.id}`}
                className={l.ixItem}
                aria-current={x.id === sid ? "page" : undefined}
              >
                <span>{x.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SupplierIndex>

      <main className={l.main} id="main">
        <div className={l.pageHead}>
          <div>
            <h1 className={l.h1}>فهرس القيود</h1>
            <p className={l.sub}>السداد والاسترداد · {scopeLabel}</p>
          </div>
          <dl className={s.counters}>
            <div>
              <dt>القيود</dt>
              <dd className="num">{counts.count.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>السداد</dt>
              <dd aria-label="مجموع السداد">
                <Money h={counts.debit} />
              </dd>
            </div>
            <div>
              <dt>الاسترداد</dt>
              <dd aria-label="مجموع الاسترداد">
                <Money h={counts.credit} />
              </dd>
            </div>
            <div>
              <dt>الصافي</dt>
              <dd aria-label="الصافي">
                <Money h={counts.net} />
              </dd>
            </div>
          </dl>
        </div>

        <div className={s.filters}>
          <div className={s.pickSup}>
            {suppliers.status === "ready" ? (
              <SupplierCombobox
                key={sid ?? "all"}
                suppliers={list}
                value={supplier?.id ?? null}
                onChange={(id) => {
                  if (id && id !== sid) navigate(`/journals/${id}`);
                  if (!id && sid) navigate("/journals");
                }}
              />
            ) : null}
            {sid ? (
              <Link to="/journals" className={s.clear}>
                عرض كل الموردين
              </Link>
            ) : null}
          </div>
          <Segment
            label="النطاق"
            value={scope}
            onChange={setScope}
            options={[
              { value: "period", label: "فترة" },
              { value: "all", label: "كل الفترات" },
            ]}
          />
          {scope === "period" ? <PeriodFilter value={period} onChange={setPeriod} today={today} /> : null}
          <Segment
            label="الوسم"
            value={tag}
            onChange={setTag}
            options={[
              { value: "all", label: "الكل" },
              { value: "pay", label: "سداد" },
              { value: "refund", label: "استرداد" },
            ]}
          />
        </div>

        <p className={l.status} role="status" aria-live="polite">
          {loading ? "جارٍ تحميل القيود…" : ""}
        </p>
        {error ? <Banner tone="err">{error}</Banner> : null}
        {exportError ? <Banner tone="err">{exportError}</Banner> : null}
        {saved ? (
          <div className={s.banner}>
            <Banner tone="ok">{saved}</Banner>
          </div>
        ) : null}
        {sid && suppliers.status === "ready" && !supplier ? (
          <Banner tone="err">هذا المورد غير موجود أو غير مسند إليك.</Banner>
        ) : null}

        {journals.status === "ready" ? (
          <>
            <MobileSort
              sort={sort}
              onSort={setSort}
              options={[
                { key: "date", label: "التاريخ" },
                { key: "amount", label: "المبلغ" },
                { key: "ref", label: "الرقم المرجعي", firstDir: "asc" },
              ]}
            />
            <div className={l.tableWrap}>
              <table className={`${l.ledger} ${s.jr}`}>
                <caption className="sr-only">القيود · {scopeLabel}</caption>
                <thead>
                  <tr>
                    <SortTh k="date" sort={sort} onSort={setSort}>
                      التاريخ
                    </SortTh>
                    <SortTh k="ref" sort={sort} onSort={setSort} firstDir="asc">
                      الرقم المرجعي
                    </SortTh>
                    <th scope="col" className={l.hideTl}>
                      السند
                    </th>
                    <th scope="col" className={l.hideTl}>
                      المورد
                    </th>
                    <th scope="col" className={l.hideTl}>
                      البيان
                    </th>
                    <SortTh k="amount" sort={sort} onSort={setSort} className={l.amt}>
                      المبلغ
                      <HeadSar />
                    </SortTh>
                    {manager ? (
                      <th scope="col" className={s.cEdit}>
                        <span className="sr-only">تعديل</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className={l.more}>
                      <td colSpan={cols}>لا قيود بهذا الفلتر.</td>
                    </tr>
                  ) : null}
                  {rows.map((r) => (
                    <tr key={r.id} className={`${s.row} ${manager ? s.withEdit : ""}`} data-entry={r.id}>
                      <th scope="row" className={s.cDate}>
                        <span className="num">{formatDate(r.date)}</span>
                      </th>
                      <td className={s.cRef}>
                        <span className="num">{r.refNo}</span>
                        {isRefund(r) ? <span className={s.flag}>استرداد</span> : null}
                        {r.needsManualFix ? <span className={`${s.flag} ${s.review}`}>للمراجعة</span> : null}
                      </td>
                      <td className={`${s.cV} ${l.hideTl}`}>
                        {r.voucher ? (
                          <>
                            <span className={s.mInline}>سند </span>
                            <span className="num">{r.voucher}</span>
                          </>
                        ) : null}
                      </td>
                      <td className={`${s.cSup} ${l.hideTl}`}>{r.supplierName}</td>
                      <td className={`${s.cDesc} ${l.hideTl}`}>{r.details}</td>
                      <td className={`${l.amt} ${s.cAmt}`}>
                        <Amount h={journalAmount(r)} />
                      </td>
                      {manager ? (
                        <td className={s.cEdit}>
                          <button
                            type="button"
                            className={s.pen}
                            aria-label={`تعديل الحركة ${r.refNo || formatDate(r.date)}`}
                            title="تعديل القيد"
                            onClick={() => {
                              setSaved(null);
                              setEditing({
                                entry: r,
                                supplierName: r.supplierName,
                                issueId: null,
                                sheetRow: null,
                                reasons: [],
                                suggestedDate: null,
                              });
                            }}
                          >
                            <Icon name="edit" />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={l.total}>
                    <th scope="row">الصافي</th>
                    <td />
                    <td className={l.hideTl} />
                    <td className={l.hideTl} />
                    <td className={l.hideTl} />
                    <td className={`${l.amt} ${s.net}`}>
                      <Amount h={counts.net} />
                    </td>
                    {manager ? <td className={s.cEdit} /> : null}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className={l.legend}>
              الصافي = السداد (المدين) − الاسترداد (الدائن). الاسترداد بإشارة سالبة وبوسم «استرداد».
            </p>
          </>
        ) : null}
      </main>

      <aside className={l.side} aria-label="تصدير القيود">
        <section aria-labelledby="jx-h">
          <h2 id="jx-h">تصدير القيود</h2>
          <p>
            ملف Excel بالقيود المعروضة (<span className="num">{counts.count.toLocaleString("en-US")}</span>)
            من الأقدم إلى الأحدث، بعمودي المدين والدائن وإجماليهما والصافي · {scopeLabel}
          </p>
          <div className={s.repBtn}>
            <Button
              variant="ghost"
              busy={xlsxBusy}
              disabled={!shown.length}
              onClick={() => void exportXlsx()}
            >
              تصدير Excel
            </Button>
          </div>
        </section>
      </aside>

      <EditEntryDialog
        target={editing}
        uid={profile.uid}
        lockedThrough={lock.status === "ready" ? lock.data : null}
        canUnlock={profile.role === "owner"}
        onDelete={
          profile.role === "owner"
            ? (t) => {
                setEditing(null);
                setDeleting({ mode: "delete", entry: t.entry, supplierName: t.supplierName, deletion: null });
              }
            : undefined
        }
        onClose={() => setEditing(null)}
        onSaved={(text) => {
          setEditing(null);
          setSaved(text);
        }}
      />
      <DeleteEntryDialog
        target={deleting}
        uid={profile.uid}
        lockedThrough={lock.status === "ready" ? lock.data : null}
        onClose={() => setDeleting(null)}
        onDone={(text) => {
          setDeleting(null);
          setSaved(text);
        }}
      />
    </div>
  );
}
