import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { PeriodFilter, type Period } from "../../../shared/fields/components/PeriodFilter";
import { Segment } from "../../../shared/fields/components/Segment";
import { formatDate, todayInRiyadh } from "../../../shared/fields/core/date";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { useProfile } from "../../auth/session/SessionProvider";
import { riyadhStamp, safeFileName } from "../../ledger/core/exportModel";
import { currentQuarter } from "../../ledger/core/ledger";
import { readError, useKeyedLoad, useKeyedWatch, useVisibleSuppliers } from "../../ledger/ui/useLedgerData";
import type { UserProfile } from "../../users/core/users";
import { watchUsers } from "../../users/data/usersRepo";
import {
  AUDIT_KINDS,
  describe,
  diffOf,
  groupByDay,
  toneOf,
  type AuditKind,
  type AuditRecord,
  type Names,
} from "../core/audit";
import { loadAuditPage, loadEntryBriefs, type AuditPage as Page, type EntryBrief } from "../data/auditRepo";
import { downloadAuditXlsx } from "../export/auditXlsx";
import l from "../../ledger/ui/Ledger.module.css";
import s from "./Audit.module.css";

type Scope = "latest" | "period";
const KIND_AR: Record<string, string> = { inv: "فاتورة", misc: "قيد", note: "ملاحظة", untyped: "بلا نوع" };

/**
 * سجل التدقيق (الخيار أ المعتمد في proposals/2026-10-11-audit.html): خط زمني مجمّع باليوم بجمل عربية،
 * و«قبل ← بعد» عند الطلب. للمالك والإدارة للقراءة فقط (القواعد تفرض ذلك)، بصفحات من 50.
 */
export function AuditPage() {
  const profile = useProfile();
  const today = todayInRiyadh();
  const suppliers = useVisibleSuppliers(profile);
  const users = useKeyedWatch<UserProfile[]>("users", watchUsers, "قراءة المستخدمين");

  const [actor, setActor] = useState<string | null>(null);
  const [kind, setKind] = useState<AuditKind>("all");
  const [scope, setScope] = useState<Scope>("latest");
  const [period, setPeriod] = useState<Period>(() => currentQuarter(today));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const range = scope === "period" ? period : null;
  const filter = useMemo(() => ({ actor, kind, period: range }), [actor, kind, range]);
  const filterKey = `${actor ?? "*"}|${kind}|${range?.from ?? ""}|${range?.to ?? ""}`;

  // الصفحة الأولى بمفتاح الفلتر، والصفحات التالية تُلحق بها للفلتر نفسه فقط
  const first = useKeyedLoad<Page>(filterKey, () => loadAuditPage(filter, null), "قراءة سجل التدقيق");
  const [extra, setExtra] = useState<{ key: string; page: Page } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const tail = extra?.key === filterKey ? extra.page : null;
  const records = useMemo(
    () => (first.status === "ready" ? [...first.data.records, ...(tail?.records ?? [])] : []),
    [first, tail],
  );
  const cursor = tail ? tail.cursor : first.status === "ready" ? first.data.cursor : null;
  const hasMore = tail ? tail.more : first.status === "ready" && first.data.more;

  const loadMore = async () => {
    setMoreBusy(true);
    setMoreError(null);
    try {
      const next = await loadAuditPage(filter, cursor);
      setExtra({
        key: filterKey,
        page: { records: [...(tail?.records ?? []), ...next.records], cursor: next.cursor, more: next.more },
      });
    } catch (e) {
      setMoreError(readError(e, "تحميل المزيد من السجل"));
    } finally {
      setMoreBusy(false);
    }
  };

  // وصف الحركات المذكورة: يُقرأ الناقص فقط
  const [briefs, setBriefs] = useState<Map<string, EntryBrief>>(new Map());
  const missing = useMemo(
    () => [
      ...new Set(
        records
          .filter((r) => r.entity === "entries" || r.entity === "migrationIssues")
          .map((r) => r.entityId)
          .filter((id) => !briefs.has(id)),
      ),
    ],
    [records, briefs],
  );
  useEffect(() => {
    if (!missing.length) return;
    let alive = true;
    loadEntryBriefs(missing)
      .then((m) => {
        if (!alive) return;
        setBriefs((cur) => {
          const n = new Map(cur);
          for (const id of missing)
            n.set(id, m.get(id) ?? { refNo: "", kind: "", supplierId: "", date: "", deleted: false });
          return n;
        });
      })
      .catch((e: unknown) => console.error("تعذّر قراءة وصف الحركات في السجل", e));
    return () => {
      alive = false;
    };
  }, [missing]);

  const supName = useMemo(() => {
    const m = new Map((suppliers.status === "ready" ? suppliers.data : []).map((x) => [x.id, x.name]));
    return (id: string) => m.get(id) ?? "مورد";
  }, [suppliers]);
  const userList = useMemo(() => (users.status === "ready" ? users.data : []), [users]);
  const names: Names = useMemo(() => {
    const u = new Map(userList.map((x) => [x.uid, x.displayName]));
    return {
      user: (uid) => u.get(uid) ?? (uid === "migration" ? "النقل" : "مستخدم"),
      supplier: supName,
      entry: (id) => {
        const b = briefs.get(id);
        if (!b || !b.supplierId) return null;
        return `${b.refNo || KIND_AR[b.kind] || "حركة"} · ${supName(b.supplierId)}`;
      },
    };
  }, [userList, supName, briefs]);

  const groups = useMemo(() => groupByDay(records, today), [records, today]);
  const scopeLabel = `${actor ? names.user(actor) : "كل المستخدمين"} · ${
    AUDIT_KINDS.find((k) => k.value === kind)?.label ?? ""
  }${range ? ` · ${formatDate(range.from)} إلى ${formatDate(range.to)}` : " · الأحدث"}`;

  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportXlsx = async () => {
    setXlsxBusy(true);
    setExportError(null);
    try {
      await downloadAuditXlsx(records, names, {
        scopeLabel,
        printedAt: riyadhStamp(new Date(), today),
        fileBase: safeFileName(`سجل-التدقيق-${today}`),
      });
    } catch (e) {
      console.error("تعذّر إنشاء ملف Excel للسجل", e);
      setExportError("تعذّر إنشاء ملف Excel. أعد المحاولة، وإن تكرر فأبلغ المالك.");
    } finally {
      setXlsxBusy(false);
    }
  };

  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className={`${l.sheet} ${s.sheet}`}>
      <main className={l.main} id="main">
        <div className={l.pageHead}>
          <div>
            <h1 className={l.h1}>سجل التدقيق</h1>
            <p className={l.sub}>للمالك والإدارة · للقراءة فقط · لا يُعدَّل ولا يُحذف</p>
          </div>
        </div>

        <div className={s.filters}>
          <div className={s.chipRow} role="group" aria-label="المستخدم">
            <span className={s.chipLbl}>المستخدم</span>
            <button
              type="button"
              className={s.chip}
              aria-pressed={actor === null}
              onClick={() => setActor(null)}
            >
              الكل
            </button>
            {userList.map((u) => (
              <button
                key={u.uid}
                type="button"
                className={s.chip}
                aria-pressed={actor === u.uid}
                onClick={() => setActor(u.uid)}
              >
                {u.displayName}
              </button>
            ))}
          </div>
          <div className={s.chipRow} role="group" aria-label="النوع">
            <span className={s.chipLbl}>النوع</span>
            {AUDIT_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                className={s.chip}
                aria-pressed={kind === k.value}
                onClick={() => setKind(k.value)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className={s.period}>
            <Segment
              label="الفترة"
              value={scope}
              onChange={setScope}
              options={[
                { value: "latest", label: "الأحدث" },
                { value: "period", label: "فترة" },
              ]}
            />
            {scope === "period" ? <PeriodFilter value={period} onChange={setPeriod} today={today} /> : null}
          </div>
        </div>

        <p className={l.status} role="status" aria-live="polite">
          {first.status === "loading" ? "جارٍ تحميل السجل…" : ""}
        </p>
        {first.status === "error" ? <Banner tone="err">{first.message}</Banner> : null}
        {users.status === "error" ? <Banner tone="err">{users.message}</Banner> : null}

        {first.status === "ready" ? (
          records.length ? (
            <ol className={s.days}>
              {groups.map((g) => (
                <li key={g.key}>
                  <h2 className={s.day}>{g.label}</h2>
                  <ol className={s.events}>
                    {g.items.map(({ r, time }) => (
                      <Event
                        key={r.id}
                        r={r}
                        time={time}
                        names={names}
                        brief={briefs.get(r.entityId) ?? null}
                        open={open.has(r.id)}
                        onToggle={() => toggle(r.id)}
                      />
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          ) : (
            <p className={s.empty}>لا سجلات بهذا الفلتر.</p>
          )
        ) : null}
        {moreError ? <Banner tone="err">{moreError}</Banner> : null}
        {hasMore ? (
          <div className={s.more}>
            <Button variant="ghost" busy={moreBusy} onClick={() => void loadMore()}>
              تحميل المزيد
            </Button>
          </div>
        ) : null}
      </main>

      <aside className={l.side} aria-label="تصدير السجل">
        <section aria-labelledby="ax-h">
          <h2 id="ax-h">تصدير السجل</h2>
          <p>
            ملف Excel بالسجلات المحمّلة الآن (<span className="num">{records.length}</span>) بالفلتر الحالي،
            من الأحدث. حمّل المزيد أولاً لتصدير أقدم منها.
          </p>
          {exportError ? <Banner tone="err">{exportError}</Banner> : null}
          <div className={s.more}>
            <Button
              variant="ghost"
              busy={xlsxBusy}
              disabled={!records.length}
              onClick={() => void exportXlsx()}
            >
              تصدير Excel
            </Button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function Event(p: {
  r: AuditRecord;
  time: string;
  names: Names;
  brief: EntryBrief | null;
  open: boolean;
  onToggle: () => void;
}) {
  const { r } = p;
  const d = describe(r, p.names);
  const diff = diffOf(r, p.names.supplier);
  const tone = toneOf(r.action);
  // الحركة تفتح كشف موردها مع إبرازها (كالبحث العام)
  const link =
    r.entity === "entries" && p.brief?.supplierId ? (
      <Link
        to={`/statement/${p.brief.supplierId}`}
        state={{ highlight: r.entityId, deleted: p.brief.deleted }}
        className={s.target}
      >
        {d.target}
      </Link>
    ) : (
      <span>{d.target}</span>
    );
  return (
    <li className={`${s.ev} ${tone === "del" ? s.del : tone === "lock" ? s.lock : ""}`}>
      <span className={`num ${s.time}`}>{p.time}</span>
      <span className={s.dot} aria-hidden="true" />
      <div className={s.body}>
        <p className={s.what}>
          <b>{d.who}</b> {d.verb} {d.target ? link : null}
        </p>
        {r.reason ? <p className={s.why}>السبب: «{r.reason}»</p> : null}
        {diff.length ? (
          <>
            <button type="button" className={s.toggle} aria-expanded={p.open} onClick={p.onToggle}>
              {p.open ? "إخفاء التغيير" : "قبل ← بعد"}
            </button>
            {p.open ? (
              <ul className={s.diff}>
                {diff.map((x) => (
                  <li key={x.field}>
                    <span>{x.label}:</span> <del>{x.from}</del> <span aria-hidden="true">←</span>{" "}
                    <ins>{x.to}</ins>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}
