import { useMemo, useState } from "react";
import { Link } from "react-router";
import { PeriodFilter, type Period } from "../../../shared/fields/components/PeriodFilter";
import { formatDate, todayInRiyadh } from "../../../shared/fields/core/date";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { useProfile } from "../../auth/session/SessionProvider";
import { isManager } from "../../users/core/users";
import { balanceState, currentQuarter, sumBalances, type SupplierBalance } from "../core/ledger";
import { sortRows, type SortState } from "../core/sort";
import {
  balancesFor,
  ledgerStats,
  reviewCounts,
  type LedgerStats,
  type ReviewCounts,
} from "../data/ledgerRepo";
import { Amount, HeadSar, Money } from "./Amount";
import { MobileSort, SortTh } from "./Sorting";
import { SupplierIndex, useIndexCollapse } from "./SupplierIndex";
import { useKeyedLoad, useLedgerVersion, useVisibleSuppliers, type Loadable } from "./useLedgerData";
import l from "./Ledger.module.css";
import s from "./Dashboard.module.css";

type Col = "name" | "prev" | "debit" | "credit" | "final";
const value = (b: SupplierBalance, k: Col) => (k === "name" ? b.name : b[k]);
const TOTAL = "__total";

const periodCaption = (p: Period) => `من ${formatDate(p.from)} إلى ${formatDate(p.to)}`;

/** لوحة الأرصدة (direction-1/dashboard.html): السابق، مدين، دائن، النهائي لكل مورد مع الإجمالي. */
export function DashboardPage() {
  const profile = useProfile();
  const manager = isManager(profile.role);
  const today = todayInRiyadh();
  const [period, setPeriod] = useState<Period>(() => currentQuarter(today));
  const [reload, setReload] = useState(0);
  const [sort, setSort] = useState<SortState<Col>>({ key: "name", dir: "asc" });
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const idx = useIndexCollapse();

  const suppliers = useVisibleSuppliers(profile, reload);
  const watchIds = suppliers.status === "ready" ? suppliers.data.map((x) => x.id) : null;
  // الأرصدة التلقائية: المالك والإدارة يراقبون كل الحركات، ومدخل البيانات موردِيه المسندين فقط (القواعد)
  const live = useLedgerVersion(watchIds === null ? null : manager ? "all" : watchIds);
  const mgr = useManagerData(manager, `${reload}.${live.version}`);
  const balKey =
    suppliers.status === "ready"
      ? `${suppliers.data.map((x) => x.id).join(",")}|${period.from}|${period.to}|${reload}.${live.version}`
      : null;
  const loaded = useKeyedLoad(
    balKey,
    async () => {
      if (suppliers.status !== "ready") return { data: [], at: new Date() };
      return { data: await balancesFor(suppliers.data, period), at: new Date() };
    },
    "حساب الأرصدة",
    suppliers.status === "ready"
      ? `${suppliers.data.map((x) => x.id).join(",")}|${period.from}|${period.to}`
      : null,
  );
  const refreshing = loaded.status === "ready" && loaded.stale === true;
  const balances: Loadable<SupplierBalance[]> =
    loaded.status === "ready" ? { status: "ready", data: loaded.data.data } : loaded;
  const updatedAt = loaded.status === "ready" ? loaded.data.at : null;

  const rows = useMemo(
    () => (loaded.status === "ready" ? sortRows(loaded.data.data, sort, value) : []),
    [loaded, sort],
  );
  const total = useMemo(() => sumBalances(rows), [rows]);
  const count = rows.length;

  const supError = suppliers.status === "error" ? suppliers.message : null;
  const balError = balances.status === "error" ? balances.message : null;
  const loading = !supError && (suppliers.status === "loading" || balances.status === "loading");

  const selected = picked === TOTAL ? null : (rows.find((r) => r.id === picked) ?? rows[0] ?? null);
  const folio = picked === TOTAL || !selected ? { name: `الإجمالي (${count} مورداً)`, ...total } : selected;

  const pick = (id: string) => {
    setPicked(id);
    // لوحي عمودي: الفهرس يقفز إلى صف المورد في الجدول ويومضه
    if (id !== TOTAL && window.matchMedia("(min-width: 601px) and (max-width: 1024px)").matches) {
      document.getElementById(`sup-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlash(id);
    }
  };

  return (
    <div className={`${l.sheet} ${idx.collapsed ? l.collapsed : ""}`}>
      <SupplierIndex collapsed={idx.collapsed} onToggle={idx.toggle}>
        {balances.status === "ready" ? (
          <>
            <ol className={l.ixList}>
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={l.ixItem}
                    aria-pressed={selected?.id === r.id && picked !== TOTAL}
                    onClick={() => pick(r.id)}
                  >
                    <span>{r.name}</span>
                    <Amount h={r.final} />
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className={`${l.ixItem} ${l.ixTotal}`}
              aria-pressed={picked === TOTAL}
              onClick={() => pick(TOTAL)}
            >
              <span>
                الإجمالي (<span className="num">{count}</span> مورداً)
              </span>
              <Amount h={total.final} />
            </button>
          </>
        ) : (
          <p className={l.ixNote}>{loading ? "جارٍ التحميل…" : "لا بيانات."}</p>
        )}
      </SupplierIndex>

      <main className={`${l.main} ${s.main}`} id="main">
        <div className={`${l.pageHead} ${s.head}`}>
          <div className={s.title}>
            <h1 className={l.h1}>أرصدة الموردين</h1>
            <p className={`${l.sub} ${s.cap}`}>{periodCaption(period)}</p>
          </div>
          <div className={s.period}>
            <PeriodFilter value={period} onChange={setPeriod} today={today} />
            <Button size="sm" variant="ghost" busy={loading} onClick={() => setReload((n) => n + 1)}>
              تحديث
            </Button>
          </div>
        </div>
        <p className={l.status} role="status" aria-live="polite">
          {loading
            ? "جارٍ حساب الأرصدة…"
            : updatedAt && balances.status === "ready"
              ? refreshing
                ? "وصل تغيير جديد؛ جارٍ تحديث الأرصدة…"
                : `تتحدث تلقائياً · آخر تحديث ${updatedAt.toLocaleTimeString("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" })}`
              : ""}
        </p>
        {live.error ? (
          <div className={s.err}>
            <Banner tone="info">التحديث التلقائي متوقف مؤقتاً: {live.error} استعمل زر «تحديث».</Banner>
          </div>
        ) : null}
        {supError || balError ? (
          <div className={s.err}>
            <Banner tone="err">{supError ?? balError}</Banner>
            <Button size="sm" onClick={() => setReload((n) => n + 1)}>
              إعادة المحاولة
            </Button>
          </div>
        ) : null}

        {balances.status === "ready" ? (
          <>
            <section className={`${s.hero} ${l.mOnly}`} aria-labelledby="hero-h">
              <h2 id="hero-h" className={s.heroLabel}>
                صافي أرصدة الموردين الـ<span className="num">{count}</span>
              </h2>
              <p className={s.heroNum}>
                <Money h={total.final} />
              </p>
              <p className={s.heroNote}>الرصيد = مدين − دائن. الرقم السالب بالأحمر مستحق للمورد علينا.</p>
              {manager ? <StatsList stats={mgr.stats} className={s.heroStats} suppliers={count} /> : null}
            </section>
            {manager ? <MobileAlerts review={mgr.review} /> : null}

            <section className={`${s.folio} ${l.tlOnly}`} aria-live="polite" aria-labelledby="folio-name">
              <h2 id="folio-name" className={s.folioName}>
                {folio.name}
              </h2>
              <p className={s.folioSub}>
                {selected && picked !== TOTAL ? "حساب المورد " : "كل الموردين "}
                {periodCaption(period)}
              </p>
              <div className={s.taccount}>
                <div className={s.tSide}>
                  <h3>
                    مدين <HeadSar />
                  </h3>
                  <p>
                    <Amount h={folio.debit} />
                  </p>
                </div>
                <div className={s.tSide}>
                  <h3>
                    دائن <HeadSar />
                  </h3>
                  <p>
                    <Amount h={folio.credit} />
                  </p>
                </div>
              </div>
              <dl className={s.recon}>
                <div>
                  <dt>الرصيد السابق</dt>
                  <dd>
                    <Amount h={folio.prev} />
                  </dd>
                </div>
                <div className={s.res}>
                  <dt>الرصيد النهائي</dt>
                  <dd>
                    <Amount h={folio.final} className={l.dbl} />
                  </dd>
                </div>
              </dl>
              <p className={`${s.folioState} ${folio.final < 0 ? l.neg : ""}`}>
                {balanceState(folio.final).label}
              </p>
              {selected && picked !== TOTAL ? (
                <Link className={l.linkBtn} to={`/statement/${selected.id}`}>
                  فتح كشف الحساب
                </Link>
              ) : null}
            </section>

            <MobileSort
              sort={sort}
              onSort={setSort}
              options={[
                { key: "name", label: "المورد", firstDir: "asc" },
                { key: "final", label: "النهائي" },
                { key: "prev", label: "السابق" },
                { key: "debit", label: "مدين" },
                { key: "credit", label: "دائن" },
              ]}
            />

            <div className={`${l.tableWrap} ${s.dashWrap}`}>
              <table className={`${l.ledger} ${s.dash}`}>
                <caption className="sr-only">أرصدة الموردين {periodCaption(period)}</caption>
                <thead>
                  <tr>
                    <SortTh k="name" sort={sort} onSort={setSort} firstDir="asc">
                      المورد
                    </SortTh>
                    <SortTh k="prev" sort={sort} onSort={setSort} className={`${l.amt} ${l.hideTp}`}>
                      الرصيد السابق
                      <HeadSar />
                    </SortTh>
                    <SortTh k="debit" sort={sort} onSort={setSort} className={l.amt}>
                      مدين
                      <HeadSar />
                    </SortTh>
                    <SortTh k="credit" sort={sort} onSort={setSort} className={l.amt}>
                      دائن
                      <HeadSar />
                    </SortTh>
                    <SortTh k="final" sort={sort} onSort={setSort} className={l.amt}>
                      الرصيد النهائي
                      <HeadSar />
                    </SortTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className={l.more}>
                      <td colSpan={5}>
                        {manager
                          ? "لا موردين في النظام بعد."
                          : "لم يُسنَد إليك أي مورد بعد. اطلب الإسناد من الإدارة."}
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((r) => (
                    <BalanceRow
                      key={r.id}
                      r={r}
                      open={open.has(r.id)}
                      flash={flash === r.id}
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
                    <th scope="row">
                      الإجمالي (<span className="num">{count}</span> مورداً)
                    </th>
                    <td className={`${l.amt} ${s.cPrev} ${l.hideTp}`} data-l="السابق">
                      <Amount h={total.prev} />
                    </td>
                    <td className={`${l.amt} ${s.cDr}`} data-l="مدين">
                      <Amount h={total.debit} />
                    </td>
                    <td className={`${l.amt} ${s.cCr}`} data-l="دائن">
                      <Amount h={total.credit} />
                    </td>
                    <td className={`${l.amt} ${s.fin}`}>
                      <Amount h={total.final} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className={`${l.legend} ${s.legend}`}>
              الرصيد النهائي = السابق + مدين − دائن. <b>الرقم السالب</b> مستحق للمورد علينا، والموجب رصيد مدين
              لنا لديه.
            </p>
          </>
        ) : null}
      </main>

      <aside className={`${l.side} ${s.side}`} aria-label="ملخص الدفتر">
        {manager ? <SideAlerts review={mgr.review} /> : null}
        {manager ? (
          <section aria-labelledby="st-h">
            <h2 id="st-h">محتوى الدفتر</h2>
            <StatsList
              stats={mgr.stats}
              suppliers={suppliers.status === "ready" ? suppliers.data.length : null}
              side
            />
          </section>
        ) : null}
        <section className={s.howto} aria-labelledby="how-h">
          <h2 id="how-h">قراءة الأرصدة</h2>
          <p>الرصيد = مدين − دائن. السالب مستحق للمورد علينا؛ والموجب رصيد مدين لنا لديه.</p>
          <p>الأرصدة تتحدث تلقائياً بعد أي إضافة أو تعديل. زر «تحديث» لإعادة الحساب يدوياً عند الحاجة.</p>
        </section>
      </aside>
    </div>
  );
}

function BalanceRow(p: { r: SupplierBalance; open: boolean; flash: boolean; onToggle: () => void }) {
  const { r } = p;
  const st = balanceState(r.final);
  return (
    <>
      <tr id={`sup-${r.id}`} className={p.flash ? l.flash : undefined}>
        <th scope="row" className={s.sup}>
          <span className={l.cellIn}>
            <button
              type="button"
              className={l.xp}
              aria-expanded={p.open}
              aria-label={`تفاصيل ${r.name}`}
              onClick={p.onToggle}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={l.ic}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <Link to={`/statement/${r.id}`} className={s.nm}>
              {r.name}
            </Link>
            {r.archived ? <span className={l.tag}>مؤرشف</span> : null}
          </span>
        </th>
        <td className={`${l.amt} ${s.cPrev} ${l.hideTp}`} data-l="السابق">
          <Amount h={r.prev} />
        </td>
        <td className={`${l.amt} ${s.cDr}`} data-l="مدين">
          <Amount h={r.debit} />
        </td>
        <td className={`${l.amt} ${s.cCr}`} data-l="دائن">
          <Amount h={r.credit} />
        </td>
        <td className={`${l.amt} ${s.fin}`}>
          <Amount h={r.final} />
          <span className={`${s.state} ${st.tone === "neg" ? l.neg : ""}`}>{st.label}</span>
        </td>
      </tr>
      {p.open ? (
        <tr className={l.rowDetail}>
          <td colSpan={5}>
            <dl className={l.dlInline}>
              <div>
                <dt>الرصيد السابق</dt>
                <dd>
                  <Amount h={r.prev} />
                </dd>
              </div>
              <div>
                <dt>الرصيد النهائي</dt>
                <dd className={st.tone === "neg" ? l.neg : undefined}>{st.label}</dd>
              </div>
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** عدّادات المراجعة والإحصاءات للمالك والإدارة فقط (القواعد تمنعها عن مدخل البيانات). تُقرأ مرة لكل فتح أو تحديث. */
function useManagerData(enabled: boolean, reloadKey: string) {
  const review = useKeyedLoad(enabled ? `r${reloadKey}` : null, reviewCounts, "قراءة تنبيهات المراجعة", "r");
  const stats = useKeyedLoad(enabled ? `s${reloadKey}` : null, ledgerStats, "قراءة محتوى الدفتر", "s");
  return { review, stats };
}

const ALERTS: { k: keyof Omit<ReviewCounts, "total">; side: string; chip: string }[] = [
  { k: "dates", side: "تاريخاً معطوباً أو مقلوباً", chip: "تاريخاً معطوباً" },
  { k: "duplicates", side: "أرقاماً مرجعية مكررة", chip: "أرقام مكررة" },
  { k: "untyped", side: "سجلاً بلا نوع", chip: "بلا نوع" },
  { k: "other", side: "سجلاً بأسباب أخرى", chip: "أخرى" },
];

function SideAlerts({ review }: { review: Loadable<ReviewCounts> }) {
  return (
    <section aria-labelledby="al-h">
      <h2 id="al-h">تنبيهات المراجعة</h2>
      <p>سجلات منقولة تحتاج تعديلاً يدوياً قبل اعتماد أرصدة الفترة.</p>
      {review.status === "error" ? <Banner tone="err">{review.message}</Banner> : null}
      {review.status === "loading" ? <p>جارٍ التحميل…</p> : null}
      {review.status === "ready" ? (
        <>
          <ul className={s.alertList}>
            {ALERTS.map((a) => (
              <li key={a.k}>
                <span className={`num ${s.alN}`}>{review.data[a.k]}</span>
                <Link className={s.alT} to="/review">
                  {a.side}
                </Link>
              </li>
            ))}
          </ul>
          <p className={s.alTotal}>
            الإجمالي <span className="num">{review.data.total}</span> سجلاً للتعديل اليدوي، وقد يجمع السجل
            أكثر من سبب. <Link to="/review">افتح مركز المراجعة</Link>
          </p>
        </>
      ) : null}
    </section>
  );
}

function MobileAlerts({ review }: { review: Loadable<ReviewCounts> }) {
  if (review.status === "error")
    return (
      <div className={l.mOnly}>
        <Banner tone="err">{review.message}</Banner>
      </div>
    );
  if (review.status !== "ready") return null;
  return (
    <ul className={s.mAlerts} aria-label="تنبيهات المراجعة">
      {ALERTS.map((a) => (
        <li key={a.k}>
          <Link to="/review">
            <span className="num">{review.data[a.k]}</span>
            {a.chip}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatsList(p: {
  stats: Loadable<LedgerStats>;
  suppliers: number | null;
  side?: boolean;
  className?: string;
}) {
  if (p.stats.status === "error") return <Banner tone="err">{p.stats.message}</Banner>;
  const d = p.stats.status === "ready" ? p.stats.data : null;
  const items: [string, number | null][] = [
    ["الموردون", p.suppliers],
    ["الحركات", d?.entries ?? null],
    ["فواتير", d?.inv ?? null],
    ["قيود", d?.misc ?? null],
    ["بلا نوع", d?.untyped ?? null],
  ];
  return (
    <dl className={`${s.stats} ${p.side ? s.statsSide : ""} ${p.className ?? ""}`}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className="num">{v === null ? "…" : v.toLocaleString("en-US")}</dd>
        </div>
      ))}
    </dl>
  );
}
