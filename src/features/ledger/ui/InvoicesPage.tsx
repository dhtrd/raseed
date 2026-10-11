import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Checkbox } from "../../../shared/fields/components/Checkbox";
import { PeriodFilter, type Period } from "../../../shared/fields/components/PeriodFilter";
import { ReasonDialog } from "../../../shared/fields/components/ReasonDialog";
import { Segment } from "../../../shared/fields/components/Segment";
import { SupplierCombobox } from "../../../shared/fields/components/SupplierCombobox";
import { formatDate, todayInRiyadh } from "../../../shared/fields/core/date";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { RIYAL_PATH } from "../../../shared/ui/Icon";
import { useProfile } from "../../auth/session/SessionProvider";
import { isManager } from "../../users/core/users";
import { riyadhStamp, safeFileName } from "../core/exportModel";
import {
  filterByOdoo,
  invoiceAmount,
  invoiceCounts,
  isEntered,
  planOdooChange,
  type InvoiceRow,
  type OdooFilter,
} from "../core/invoices";
import { currentQuarter, kindLabel, type LedgerEntry } from "../core/ledger";
import { sortRows, type SortState } from "../core/sort";
import { setOdooStatus, watchInvoices, watchLockedThrough, type OdooChange } from "../data/invoicesRepo";
import { downloadNotEnteredXlsx } from "../export/invoicesXlsx";
import { Amount, HeadSar } from "./Amount";
import { MobileSort, SortTh } from "./Sorting";
import { SupplierIndex, useIndexCollapse } from "./SupplierIndex";
import { useKeyedWatch, useVisibleSuppliers } from "./useLedgerData";
import l from "./Ledger.module.css";
import s from "./Invoices.module.css";

type Scope = "all" | "period";
type Col = "date" | "ref" | "amount";
type Outcome = { tone: "ok" | "err" | "info"; lines: string[] };

const LONG_PRESS_MS = 500;
const REPORT_PREVIEW = 12;

/** فهرس الفواتير وحالة Odoo (direction-1/invoices.html، SPEC «تتبع Odoo»). */
export function InvoicesPage() {
  const profile = useProfile();
  const manager = isManager(profile.role);
  const { sid } = useParams();
  const navigate = useNavigate();
  const today = todayInRiyadh();
  const idx = useIndexCollapse();
  const suppliers = useVisibleSuppliers(profile);

  const [scope, setScope] = useState<Scope>("period");
  const [period, setPeriod] = useState<Period>(() => currentQuarter(today));
  const [status, setStatus] = useState<OdooFilter>("all");
  const [sort, setSort] = useState<SortState<Col>>({ key: "date", dir: "desc" });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  // الزر السريع أمام كل فاتورة (طلب المستخدم 2026-10-11): تُكتب وحدها بتدقيقها كالتحديد الجماعي
  const [marking, setMarking] = useState<Set<string>>(new Set());
  const markOne = async (r: InvoiceRow) => {
    setMarking((m) => new Set(m).add(r.id));
    const res = await setOdooStatus(profile.uid, [r], { entered: true });
    setMarking((m) => {
      const n = new Set(m);
      n.delete(r.id);
      return n;
    });
    const f = res.failed[0];
    setOutcome(
      f
        ? { tone: "err", lines: [`تعذّر تغيير ${f.refNo}: ${f.message}`] }
        : { tone: "ok", lines: [`حُددت ${r.refNo} كـ«دخلت» وسُجّل التغيير في التدقيق.`] },
    );
  };
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [xlsxBusy, setXlsxBusy] = useState(false);

  const list = useMemo(() => (suppliers.status === "ready" ? suppliers.data : []), [suppliers]);
  const supplier = sid ? list.find((x) => x.id === sid) : undefined;
  const names = useMemo(() => new Map(list.map((x) => [x.id, x.name])), [list]);
  const range = scope === "period" ? period : null;

  // المالك والإدارة: كل الموردين أو المورد المختار؛ مدخل البيانات: موردوه المسندون دائماً (القواعد)
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
  const invoices = useKeyedWatch<LedgerEntry[]>(
    watchKey,
    (ok, err) => watchInvoices(ids, range, ok, err),
    "قراءة الفواتير",
  );
  const lock = useKeyedWatch<string | null>("lock", watchLockedThrough, "قراءة تاريخ الإقفال");
  const lockedThrough = lock.status === "ready" ? lock.data : null;

  const all: InvoiceRow[] = useMemo(
    () =>
      invoices.status === "ready"
        ? invoices.data.map((e) => ({ ...e, supplierName: names.get(e.supplierId) ?? e.supplierId }))
        : [],
    [invoices, names],
  );
  const counts = useMemo(() => invoiceCounts(all), [all]);
  const rows = useMemo(() => {
    const pos = new Map(all.map((r, i) => [r.id, i]));
    return sortRows(filterByOdoo(all, status), sort, (r, k) =>
      k === "date" ? (pos.get(r.id) ?? 0) : k === "ref" ? r.refNo : invoiceAmount(r),
    );
  }, [all, status, sort]);
  const notEntered = useMemo(() => all.filter((r) => !isEntered(r)), [all]);

  // التحديد مرتبط بالفلتر: تغيّر الفترة أو المورد أو الحالة يمسحه، فلا تُغيَّر فاتورة غير ظاهرة
  const selKey = `${watchKey}|${status}`;
  const [selState, setSelState] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  const selected = selState.key === selKey ? selState.ids : new Set<string>();
  const setSelected = (fn: (s: Set<string>) => Set<string>) =>
    setSelState((cur) => ({ key: selKey, ids: fn(cur.key === selKey ? cur.ids : new Set()) }));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const visibleSelected = rows.filter((r) => selected.has(r.id));
  const allChecked: boolean | "mixed" =
    rows.length > 0 && visibleSelected.length === rows.length
      ? true
      : visibleSelected.length
        ? "mixed"
        : false;

  const scopeLabel = `${supplier ? supplier.name : manager ? "كل الموردين" : "موردوك المسندون"} · ${
    range ? `من ${formatDate(range.from)} إلى ${formatDate(range.to)}` : "كل الفترات"
  }`;

  const run = async (change: OdooChange) => {
    const plan = planOdooChange(visibleSelected, change.entered, lockedThrough);
    const lines: string[] = [];
    if (plan.unchanged.length)
      lines.push(
        `${plan.unchanged.length} فاتورة حالتها «${change.entered ? "دخلت" : "لم تدخل"}» أصلاً فلم تتغير.`,
      );
    if (plan.locked.length)
      lines.push(
        `${plan.locked.length} فاتورة في فترة مقفلة (حتى ${formatDate(lockedThrough ?? "")}) لم تتغير: ${plan.locked
          .map((r) => r.refNo)
          .join("، ")}.`,
      );
    if (!plan.change.length) {
      setOutcome({ tone: "info", lines: lines.length ? lines : ["لا شيء لتغييره."] });
      return;
    }
    setOutcome(null);
    setProgress({ done: 0, of: plan.change.length });
    const res = await setOdooStatus(profile.uid, plan.change, change, (done) =>
      setProgress({ done, of: plan.change.length }),
    );
    setProgress(null);
    if (res.done.length)
      lines.unshift(
        `${change.entered ? "حُددت" : "أُرجعت"} ${res.done.length} فاتورة ${
          change.entered ? "كـ«دخلت»" : "إلى «لم تدخل»"
        } وسُجّل كل تغيير في التدقيق.`,
      );
    for (const f of res.failed) lines.push(`تعذّر تغيير ${f.refNo}: ${f.message}`);
    setOutcome({ tone: res.failed.length ? "err" : "ok", lines });
    setSelected((cur) => {
      const n = new Set(cur);
      res.done.forEach((id) => n.delete(id));
      return n;
    });
  };

  const exportReport = async () => {
    setXlsxBusy(true);
    try {
      await downloadNotEnteredXlsx(
        notEntered,
        {
          scopeLabel,
          printedAt: riyadhStamp(new Date(), today),
          fileBase: safeFileName(`لم-تدخل-Odoo-${supplier?.name ?? "الكل"}-${today}`),
        },
        RIYAL_PATH,
      );
    } catch (e) {
      console.error("تعذّر إنشاء تقرير Excel", e);
      setOutcome({ tone: "err", lines: ["تعذّر إنشاء تقرير Excel. أعد المحاولة، وإن تكرر فأبلغ المالك."] });
    } finally {
      setXlsxBusy(false);
    }
  };

  const busy = progress !== null;
  const error =
    suppliers.status === "error" ? suppliers.message : invoices.status === "error" ? invoices.message : null;
  const loading = !error && invoices.status === "loading";
  const actions = (
    <>
      <Button
        variant="primary"
        disabled={!visibleSelected.length}
        busy={busy}
        onClick={() => void run({ entered: true })}
      >
        تحديد كـدخلت
      </Button>
      <Button variant="ghost" disabled={!visibleSelected.length || busy} onClick={() => setReverting(true)}>
        إرجاع إلى «لم تدخل»
      </Button>
    </>
  );
  const selText = visibleSelected.length ? `${visibleSelected.length} فاتورة محددة` : "لا فواتير محددة";

  return (
    <div className={`${l.sheet} ${idx.collapsed ? l.collapsed : ""} ${selectMode ? s.selecting : ""}`}>
      <SupplierIndex collapsed={idx.collapsed} onToggle={idx.toggle}>
        <ul className={l.ixList}>
          <li>
            <Link to="/invoices" className={l.ixItem} aria-current={!sid ? "page" : undefined}>
              <span>{manager ? "كل الموردين" : "كل موردِيك"}</span>
            </Link>
          </li>
          {list.map((x) => (
            <li key={x.id}>
              <Link
                to={`/invoices/${x.id}`}
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
            <h1 className={l.h1}>فهرس الفواتير</h1>
            <p className={l.sub}>حالة إدخال كل فاتورة في Odoo · {scopeLabel}</p>
          </div>
          <dl className={s.counters}>
            <div>
              <dt>إجمالي الفواتير</dt>
              <dd className="num">{counts.total.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>دخلت</dt>
              <dd className="num">{counts.entered.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>لم تدخل Odoo</dt>
              <dd className={`num ${l.neg}`}>{counts.notEntered.toLocaleString("en-US")}</dd>
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
                  if (id && id !== sid) navigate(`/invoices/${id}`);
                  if (!id && sid) navigate("/invoices");
                }}
              />
            ) : null}
            {sid ? (
              <Link to="/invoices" className={s.clear}>
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
            label="حالة Odoo"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "الكل" },
              { value: "in", label: "دخلت" },
              { value: "out", label: "لم تدخل" },
            ]}
          />
        </div>

        {manager ? (
          <div className={s.bulk}>
            <span className={s.desktopOnly}>
              <Checkbox
                checked={allChecked}
                disabled={!rows.length}
                onChange={(on) => setSelected(() => (on ? new Set(rows.map((r) => r.id)) : new Set()))}
              >
                تحديد الكل الظاهر
              </Checkbox>
            </span>
            <span className={s.selCount} aria-live="polite">
              {selText}
            </span>
            <span className={s.desktopOnly}>{actions}</span>
            <span className={s.mobileOnly}>
              <Button variant="ghost" onClick={() => setSelectMode(true)} disabled={selectMode}>
                تحديد فواتير
              </Button>
            </span>
          </div>
        ) : null}

        <p className={l.status} role="status" aria-live="polite">
          {loading
            ? "جارٍ تحميل الفواتير…"
            : progress
              ? `جارٍ التحديث: ${progress.done} من ${progress.of}…`
              : ""}
        </p>
        {outcome ? (
          <div className={s.outcome}>
            <Banner tone={outcome.tone}>
              {outcome.lines.map((t) => (
                <span key={t} className={s.line}>
                  {t}
                </span>
              ))}
            </Banner>
          </div>
        ) : null}
        {error ? <Banner tone="err">{error}</Banner> : null}
        {lock.status === "error" ? (
          <Banner tone="err">
            تعذّر قراءة تاريخ الإقفال؛ القواعد ستمنع أي تغيير في فترة مقفلة على أي حال.
          </Banner>
        ) : null}
        {sid && suppliers.status === "ready" && !supplier ? (
          <Banner tone="err">هذا المورد غير موجود أو غير مسند إليك.</Banner>
        ) : null}

        {invoices.status === "ready" ? (
          <>
            {manager ? (
              <p className={`${s.hint} ${s.mobileOnly}`}>
                اضغط مطوّلاً على فاتورة لبدء التحديد، ثم انقر لتحديد غيرها.
              </p>
            ) : null}
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
              <table className={`${l.ledger} ${s.inv}`}>
                <caption className="sr-only">الفواتير وحالتها في Odoo · {scopeLabel}</caption>
                <thead>
                  <tr>
                    {manager ? (
                      <th scope="col" className={s.cPick}>
                        <span className="sr-only">تحديد</span>
                      </th>
                    ) : null}
                    <SortTh k="ref" sort={sort} onSort={setSort} firstDir="asc">
                      الرقم المرجعي
                    </SortTh>
                    <SortTh k="date" sort={sort} onSort={setSort} className={l.hideTp}>
                      التاريخ
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
                    <th scope="col">حالة Odoo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className={l.more}>
                      <td colSpan={8}>لا فواتير بهذا الفلتر.</td>
                    </tr>
                  ) : null}
                  {rows.map((r) => (
                    <InvoiceLine
                      key={r.id}
                      r={r}
                      manager={manager}
                      locked={Boolean(lockedThrough && r.date <= lockedThrough)}
                      marking={marking.has(r.id)}
                      onMarkEntered={() => void markOne(r)}
                      selected={selected.has(r.id)}
                      selectMode={selectMode}
                      open={open.has(r.id)}
                      onToggleSel={() => toggle(r.id)}
                      onLongPress={() => {
                        setSelectMode(true);
                        setSelected((cur) => new Set(cur).add(r.id));
                      }}
                      onToggleOpen={() =>
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
              </table>
            </div>
          </>
        ) : null}
      </main>

      <aside className={l.side} aria-label="تقرير الفواتير التي لم تدخل">
        <section aria-labelledby="rep-h">
          <h2 id="rep-h">تقرير الفواتير التي لم تدخل</h2>
          <p>
            <span className="num">{counts.notEntered.toLocaleString("en-US")}</span> فاتورة بمجموع{" "}
            <Amount h={counts.notEnteredAmount} /> · {scopeLabel}
          </p>
          {notEntered.length ? (
            <ol className={s.repList}>
              {notEntered.slice(0, REPORT_PREVIEW).map((r) => (
                <li key={r.id}>
                  <span className="num">{r.refNo}</span>
                  <Amount h={invoiceAmount(r)} />
                </li>
              ))}
            </ol>
          ) : (
            <p className={s.repEmpty}>لا فواتير «لم تدخل» بهذا الفلتر.</p>
          )}
          {notEntered.length > REPORT_PREVIEW ? (
            <p>
              و<span className="num">{notEntered.length - REPORT_PREVIEW}</span> فاتورة أخرى في الملف.
            </p>
          ) : null}
          <div className={s.repBtn}>
            <Button
              variant="ghost"
              busy={xlsxBusy}
              disabled={!notEntered.length}
              onClick={() => void exportReport()}
            >
              تصدير التقرير Excel
            </Button>
          </div>
        </section>
        <section aria-labelledby="hw-h">
          <h2 id="hw-h">التحديد الجماعي</h2>
          {manager ? (
            <p>
              حدّد الفواتير ثم «تحديد كـدخلت»، أو «إرجاع إلى لم تدخل» بسبب إلزامي. كل تغيير يُسجَّل في
              التدقيق، والفواتير في الفترة المقفلة لا تتغير.
            </p>
          ) : (
            <p>صلاحية مدخل البيانات للاطلاع فقط؛ تحديث الحالة للمالك والإدارة.</p>
          )}
        </section>
      </aside>

      {manager && selectMode ? (
        <div className={s.selbar} role="region" aria-label="إجراءات التحديد">
          <span className={s.selCount}>{selText}</span>
          {actions}
          <Button
            variant="ghost"
            onClick={() => {
              setSelectMode(false);
              setSelected(() => new Set());
            }}
          >
            إلغاء
          </Button>
        </div>
      ) : null}

      <ReasonDialog
        isOpen={reverting}
        count={visibleSelected.length}
        onCancel={() => setReverting(false)}
        onConfirm={(r) => {
          setReverting(false);
          void run({ entered: false, reason: r.reason, text: r.text });
        }}
      />
    </div>
  );
}

function Stamp({ entered }: { entered: boolean }) {
  return <span className={`${s.stamp} ${entered ? s.in : s.out}`}>{entered ? "دخلت" : "لم تدخل"}</span>;
}

function InvoiceLine(p: {
  r: InvoiceRow;
  manager: boolean;
  /** في الفترة المقفلة: الزر السريع معطّل */
  locked: boolean;
  marking: boolean;
  onMarkEntered: () => void;
  selected: boolean;
  selectMode: boolean;
  open: boolean;
  onToggleSel: () => void;
  onLongPress: () => void;
  onToggleOpen: () => void;
}) {
  const { r } = p;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const tag = kindLabel(r).tag;
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  // الجوال: ضغط مطوّل يبدأ وضع التحديد، وفي وضع التحديد النقر يبدّل الفاتورة
  const touch = p.manager
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType !== "touch") return;
          fired.current = false;
          timer.current = setTimeout(() => {
            fired.current = true;
            p.onLongPress();
          }, LONG_PRESS_MS);
        },
        onPointerUp: cancel,
        onPointerLeave: cancel,
        onPointerCancel: cancel,
        onClick: (e: React.MouseEvent) => {
          if (fired.current) {
            fired.current = false;
            return;
          }
          if (p.selectMode && !(e.target as HTMLElement).closest("button, a")) p.onToggleSel();
        },
      }
    : {};
  return (
    <>
      <tr
        className={`${s.row} ${p.selected ? s.isSel : ""}`}
        aria-selected={p.manager ? p.selected : undefined}
        {...touch}
      >
        {p.manager ? (
          <td className={s.cPick}>
            <Checkbox checked={p.selected} onChange={p.onToggleSel}>
              <span className="sr-only">تحديد الفاتورة {r.refNo}</span>
            </Checkbox>
          </td>
        ) : null}
        <th scope="row" className={s.cRefno}>
          <span className={l.cellIn}>
            <button
              type="button"
              className={l.xp}
              aria-expanded={p.open}
              aria-label={`تفاصيل ${r.refNo}`}
              onClick={p.onToggleOpen}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={l.ic}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <span className="num">{r.refNo}</span>
          </span>
        </th>
        <td className={`${s.cDate} ${l.hideTp}`}>
          <span className="num">{formatDate(r.date)}</span>
        </td>
        <td className={`${s.cV} ${l.hideTl}`}>
          <span className="num">{r.voucher}</span>
        </td>
        <td className={`${s.cSup} ${l.hideTl}`}>{r.supplierName}</td>
        <td className={`${s.cDesc} ${l.hideTl}`}>{r.details}</td>
        <td className={`${l.amt} ${s.cAmt}`}>
          <Amount h={invoiceAmount(r)} />
          {tag ? <span className={s.flag}>{tag}</span> : null}
        </td>
        <td className={s.cSt}>
          <span className={s.stWrap}>
            <Stamp entered={isEntered(r)} />
            {p.manager && !isEntered(r) && !p.selectMode ? (
              <Button
                size="sm"
                busy={p.marking}
                disabled={p.locked}
                title={p.locked ? "في فترة مقفلة: لا تتغير حالتها" : undefined}
                aria-label={`تحديد ${r.refNo} كـدخلت${p.locked ? " (فترة مقفلة)" : ""}`}
                onClick={p.onMarkEntered}
              >
                دخلت ✓
              </Button>
            ) : null}
          </span>
        </td>
      </tr>
      {p.open ? (
        <tr className={l.rowDetail}>
          <td colSpan={8}>
            <dl className={l.dlInline}>
              <div>
                <dt>التاريخ</dt>
                <dd className="num">{formatDate(r.date)}</dd>
              </div>
              <div>
                <dt>السند</dt>
                <dd>{r.voucher ? <span className="num">{r.voucher}</span> : "بلا سند"}</dd>
              </div>
              <div>
                <dt>المورد</dt>
                <dd>{r.supplierName}</dd>
              </div>
              <div>
                <dt>البيان</dt>
                <dd>{r.details || "—"}</dd>
              </div>
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  );
}
