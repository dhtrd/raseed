import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useParams } from "react-router";
import { Checkbox, SearchField } from "../../../shared/fields";
import { shiftRange } from "../../../shared/fields/core/rangeSelect";
import { Banner } from "../../../shared/ui/Banner";
import { useToast } from "../../../shared/ui/Toast";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import { useProfile } from "../../auth/session/SessionProvider";
import { pendingAssignments, type UserProfile } from "../core/users";
import { saveAssignments } from "../data/usersRepo";
import { useRoleNames } from "./roleNames";
import { errorText, useSuppliers, useUsers } from "./useUsersData";
import s from "./AssignPage.module.css";

/**
 * إسناد الموردين (الخيار «أ» المعتمد، النسخة 2): قائمة مدخلي البيانات ثم موردو المختار.
 * التغييرات تُجمع لكل المستخدمين وتُحفظ مرة واحدة، والخروج بتغييرات غير محفوظة يُسأل عنه.
 * المورد المؤرشف لا يظهر ولا يُسند، ويبقى إسناده السابق كما هو.
 */
export function AssignPage() {
  const viewer = useProfile();
  const names = useRoleNames();
  const users = useUsers();
  const suppliers = useSuppliers();
  const { uid } = useParams();
  const [drafts, setDrafts] = useState<Map<string, Set<string>>>(new Map());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // النجاح إشعار عائم، والخطأ يبقى بجانب النموذج (DECISIONS 2026-10-11)
  const toast = useToast();

  const entries = useMemo(
    () => (users.status === "ready" ? users.data.filter((u) => u.role === "entry") : []),
    [users],
  );
  const pending = useMemo(() => pendingAssignments(entries, drafts), [entries, drafts]);
  const dirty = pending.length > 0;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !nextLocation.pathname.startsWith("/assign") &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (users.status !== "ready" || suppliers.status !== "ready") {
    const err =
      users.status === "error" ? users.message : suppliers.status === "error" ? suppliers.message : null;
    return <div className={s.state}>{err ? <Banner tone="err">{err}</Banner> : "جارٍ التحميل…"}</div>;
  }

  const selected = uid ? entries.find((u) => u.uid === uid) : undefined;
  const draftOf = (u: UserProfile) => drafts.get(u.uid) ?? new Set(u.assigned);
  const active = suppliers.data.filter((x) => !x.archived);
  const archivedCount = suppliers.data.length - active.length;

  const toggle = (u: UserProfile, ids: string[], on: boolean) => {
    setMsg(null);
    setDrafts((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(u.uid) ?? u.assigned);
      for (const id of ids) {
        if (on) set.add(id);
        else set.delete(id);
      }
      next.set(u.uid, set);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await saveAssignments(pending, viewer.uid);
      setDrafts(new Map());
      toast({ tone: "ok", text: "حُفظ الإسناد في عملية واحدة مع سجل تدقيق لكل مستخدم تغيّر." });
    } catch (e) {
      console.error(e);
      setMsg({ tone: "err", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const totals = pending.reduce((t, p) => ({ add: t.add + p.added.length, rem: t.rem + p.removed.length }), {
    add: 0,
    rem: 0,
  });
  const nameOf = (id: string) => suppliers.data.find((x) => x.id === id)?.name ?? id;

  return (
    <main className={`${s.page} ${uid ? s.open : ""}`}>
      <nav className={s.who} aria-label={names.entry}>
        <h1 className={s.grp}>{names.entry}</h1>
        {entries.length === 0 ? (
          <p className={s.empty}>
            لا يوجد {names.entry} بعد. أضفه من <Link to="/users">إدارة المستخدمين</Link>.
          </p>
        ) : (
          entries.map((u) => (
            <Link
              key={u.uid}
              to={`/assign/${u.uid}`}
              className={s.it}
              aria-current={u.uid === uid ? "page" : undefined}
            >
              <span>
                {u.displayName}
                {!u.active ? <span className={s.off}>موقوف</span> : null}
                {drafts.has(u.uid) && pending.some((p) => p.user.uid === u.uid) ? (
                  <span className={s.dot} title="تغييرات غير محفوظة" />
                ) : null}
              </span>
              <span className="num">{draftOf(u).size}</span>
            </Link>
          ))
        )}
      </nav>

      <section className={s.body} aria-label="الموردون">
        {selected ? (
          <SupplierList
            key={selected.uid}
            user={selected}
            draft={draftOf(selected)}
            suppliers={active}
            archivedCount={archivedCount}
            q={q}
            setQ={setQ}
            onToggle={(ids, on) => toggle(selected, ids, on)}
          />
        ) : (
          <p className={s.empty}>
            {uid ? "هذا المستخدم ليس مدخل بيانات أو لم يعد موجوداً." : `اختر ${names.entry} لعرض موردينه.`}
          </p>
        )}

        <div className={s.savebar}>
          <div className={s.diff} aria-live="polite">
            {dirty ? (
              <>
                <span className={s.plus}>+{totals.add} إسناد</span> ·{" "}
                <span className={s.minus}>−{totals.rem} إلغاء</span>
                <div className={s.parts}>
                  {pending
                    .map(
                      (p) =>
                        `${p.user.displayName}: ${[...p.added.map((x) => `+${nameOf(x)}`), ...p.removed.map((x) => `−${nameOf(x)}`)].join("، ")}`,
                    )
                    .join(" · ")}
                </div>
              </>
            ) : (
              <span className={s.muted}>لا تغييرات بعد.</span>
            )}
          </div>
          <Button variant="primary" disabled={!dirty} busy={busy} onClick={() => void save()}>
            حفظ الإسناد
          </Button>
          <Button variant="ghost" disabled={!dirty || busy} onClick={() => setDrafts(new Map())}>
            تراجع
          </Button>
        </div>
        {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      </section>

      <Dialog
        isOpen={blocker.state === "blocked"}
        tone="warn"
        title="لديك تغييرات غير محفوظة"
        onDismiss={() => blocker.reset?.()}
      >
        <p className={d.sub}>
          +{totals.add} إسناد و−{totals.rem} إلغاء لم تُحفظ. إن انتقلت الآن تضيع.
        </p>
        <div className={d.actions}>
          <Button variant="primary" onClick={() => blocker.reset?.()}>
            البقاء والحفظ
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setDrafts(new Map());
              blocker.proceed?.();
            }}
          >
            انتقل دون حفظ
          </Button>
        </div>
      </Dialog>
    </main>
  );
}

function SupplierList(p: {
  user: UserProfile;
  draft: ReadonlySet<string>;
  suppliers: { id: string; name: string }[];
  archivedCount: number;
  q: string;
  setQ: (v: string) => void;
  onToggle: (ids: string[], on: boolean) => void;
}) {
  const q = p.q.trim();
  const visible = q ? p.suppliers.filter((x) => x.name.includes(q)) : p.suppliers;
  const anchor = useRef<string | null>(null);
  const on = visible.filter((x) => p.draft.has(x.id)).length;
  const all: boolean | "mixed" =
    visible.length > 0 && on === visible.length ? true : on > 0 ? "mixed" : false;
  return (
    <>
      <div className={s.head}>
        <Link to="/assign" className={s.back}>
          → مدخلو البيانات
        </Link>
        <h2 className={s.title}>موردو {p.user.displayName}</h2>
        <Link to={`/users/${p.user.uid}`} className={s.toUser}>
          صفحة المستخدم ←
        </Link>
      </div>
      {!p.user.active ? <Banner tone="info">هذا الحساب موقوف. الإسناد يُحفظ ويسري عند تفعيله.</Banner> : null}
      <div className={s.tools}>
        <div className={s.search}>
          <SearchField
            label="بحث في الموردين"
            placeholder="اكتب جزءاً من الاسم"
            value={p.q}
            onChange={p.setQ}
          />
        </div>
        <Checkbox
          checked={all}
          disabled={!visible.length}
          onChange={(v) =>
            p.onToggle(
              visible.map((x) => x.id),
              v,
            )
          }
        >
          تحديد الظاهر (<span className="num">{visible.length}</span>)
        </Checkbox>
      </div>
      <div className={s.list}>
        {visible.map((x) => (
          <Checkbox
            key={x.id}
            checked={p.draft.has(x.id)}
            onChange={(v, m) => {
              // Shift+نقر: كل الموردين الظاهرين بين آخر مورد نُقر وهذا
              const ids = m.shift
                ? shiftRange(
                    visible.map((y) => y.id),
                    anchor.current,
                    x.id,
                  )
                : [x.id];
              anchor.current = x.id;
              p.onToggle(ids, v);
            }}
          >
            {x.name}
          </Checkbox>
        ))}
        {visible.length === 0 ? (
          <p className={s.empty}>{q ? "لا مورد يطابق البحث." : "لا موردين نشطين بعد."}</p>
        ) : null}
      </div>
      {p.archivedCount ? (
        <p className={s.muted}>
          الموردون المؤرشفون لا يظهرون هنا (<span className="num">{p.archivedCount}</span>)، ويبقى إسنادهم
          السابق كما هو.
        </p>
      ) : null}
    </>
  );
}
