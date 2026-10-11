import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { useNavigate } from "react-router";
import { formatDate } from "../../../shared/fields/core/date";
import { Icon } from "../../../shared/ui/Icon";
import type { UserProfile } from "../../users/core/users";
import { formatMoney, kindLabel } from "../core/ledger";
import { haystackOf, highlight, search, type SearchEntry, type SupplierLite } from "../core/search";
import { loadSearchEntries } from "../data/searchRepo";
import { readError, useVisibleSuppliers } from "./useLedgerData";
import s from "./SearchPalette.module.css";

type Load =
  { status: "idle" | "loading" } | { status: "error"; message: string } | { status: "ready"; at: number };

/** يعرض النص مع إبراز المطابق */
function Hl({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlight(text, q).map((p, i) =>
        p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}

/**
 * البحث العام (الخيار أ المعتمد: نافذة سريعة من الرأس، Ctrl+K). على الجوال تملأ الشاشة بزر «إغلاق» ظاهر
 * (شرط المستخدم). المورد يفتح كشفه، والحركة تفتح كشف موردها مع إبراز صفها.
 */
export function SearchPalette({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [load, setLoad] = useState<Load>({ status: "idle" });
  const suppliers = useVisibleSuppliers(profile);
  const input = useRef<HTMLInputElement>(null);

  // Ctrl+K / ⌘K من أي شاشة
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // التركيز في حقل البحث عند الفتح (بعد أن ترسم النافذة)
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // التحميل عند الفتح: أول مرة كاملاً، وبعدها المعدّل فقط
  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadSearchEntries(profile)
      .then((r) => {
        if (!alive) return;
        setEntries(r.entries);
        setLoad({ status: "ready", at: Date.now() });
      })
      .catch((e: unknown) => {
        if (alive) setLoad({ status: "error", message: readError(e, "تحميل بيانات البحث") });
      });
    return () => {
      alive = false;
    };
  }, [open, profile]);

  const sups: SupplierLite[] = useMemo(
    () => (suppliers.status === "ready" ? suppliers.data.map((x) => ({ id: x.id, name: x.name })) : []),
    [suppliers],
  );
  const nameOf = useMemo(() => new Map(sups.map((x) => [x.id, x.name] as const)), [sups]);
  // نص البحث لكل حركة يُحسب مرة واحدة لكل تحميل
  const hayOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(e.id, haystackOf(e, nameOf.get(e.supplierId) ?? ""));
    return m;
  }, [entries, nameOf]);
  const res = useMemo(
    () => search(q, entries, sups, (e) => hayOf.get(e.id) ?? ""),
    [q, entries, sups, hayOf],
  );
  const items = [
    ...res.suppliers.map((x) => ({ kind: "sup" as const, id: `sup-${x.id}`, sup: x })),
    ...res.entries.map((e) => ({ kind: "ent" as const, id: `ent-${e.id}`, e })),
  ];
  const act = Math.min(active, Math.max(0, items.length - 1));

  const close = () => {
    setOpen(false);
    setActive(0);
  };
  const pick = (i: number) => {
    const it = items[i];
    if (!it) return;
    close();
    if (it.kind === "sup") navigate(`/statement/${it.sup.id}`);
    else navigate(`/statement/${it.e.supplierId}`, { state: { highlight: it.e.id, deleted: it.e.deleted } });
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(act + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(act - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(act);
    }
  };
  useEffect(() => {
    document.getElementById(`sr-${items[act]?.id ?? ""}`)?.scrollIntoView({ block: "nearest" });
  });

  const status =
    load.status === "error"
      ? load.message
      : load.status !== "ready" && !entries.length
        ? "جارٍ تحميل البيانات للبحث… (مرة واحدة في الجلسة)"
        : q.trim()
          ? `${res.suppliers.length} مورد · ${res.total.toLocaleString("en-US")} حركة${
              res.total > res.entries.length ? ` (أول ${res.entries.length}؛ أضف كلمة لتضييق البحث)` : ""
            }`
          : "اكتب اسم مورد أو رقماً مرجعياً أو سنداً أو بياناً أو مبلغاً.";

  return (
    <>
      <button
        type="button"
        className={s.trigger}
        onClick={() => setOpen(true)}
        aria-label="بحث في كل شيء"
        aria-keyshortcuts="Control+K"
      >
        <Icon name="search" className={s.tIcon} />
        <span className={s.tText}>بحث</span>
        <kbd className={s.kbd}>Ctrl+K</kbd>
      </button>
      <ModalOverlay
        className={s.overlay}
        isOpen={open}
        isDismissable
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <Modal className={s.modal}>
          <AriaDialog className={s.dialog} aria-label="البحث العام">
            <div className={s.head}>
              <Heading slot="title" className={s.title}>
                البحث
              </Heading>
              <button type="button" className={s.close} onClick={close} aria-label="إغلاق البحث">
                <span aria-hidden="true">×</span>
                <span className={s.closeText}>إغلاق</span>
              </button>
            </div>
            <label className={s.q}>
              <Icon name="search" className={s.qIcon} />
              <input
                ref={input}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKey}
                placeholder="مورد، رقم مرجعي، سند، بيان، مبلغ…"
                aria-label="البحث في كل شيء"
                role="combobox"
                aria-expanded={items.length > 0}
                aria-controls="search-results"
                aria-activedescendant={items[act] ? `sr-${items[act].id}` : undefined}
                aria-autocomplete="list"
                enterKeyHint="search"
              />
            </label>
            <p
              className={`${s.status} ${load.status === "error" ? s.err : ""}`}
              role="status"
              aria-live="polite"
            >
              {status}
            </p>
            <div className={s.list} id="search-results" role="listbox" aria-label="نتائج البحث">
              {res.suppliers.length ? <p className={s.group}>الموردون</p> : null}
              {items.map((it, i) =>
                it.kind === "sup" ? (
                  <div
                    key={it.id}
                    id={`sr-${it.id}`}
                    role="option"
                    aria-selected={i === act}
                    className={`${s.res} ${i === act ? s.act : ""}`}
                    tabIndex={-1}
                    onMouseMove={() => setActive(i)}
                    onClick={() => pick(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") pick(i);
                    }}
                  >
                    <span className={`${s.k} ${s.kSup}`}>مورد</span>
                    <span className={s.main}>
                      <span className={s.t1}>
                        <Hl text={it.sup.name} q={q} />
                      </span>
                      <span className={s.t2}>فتح كشف الحساب</span>
                    </span>
                    <span />
                  </div>
                ) : (
                  <ResultRow
                    key={it.id}
                    e={it.e}
                    supplier={nameOf.get(it.e.supplierId) ?? ""}
                    q={q}
                    id={`sr-${it.id}`}
                    first={i === res.suppliers.length}
                    active={i === act}
                    onHover={() => setActive(i)}
                    onPick={() => pick(i)}
                  />
                ),
              )}
              {q.trim() && load.status === "ready" && !items.length ? (
                <p className={s.empty}>لا نتائج لـ«{q}».</p>
              ) : null}
            </div>
            <p className={s.foot} aria-hidden="true">
              <span>
                <kbd className={s.kbd}>↑↓</kbd> تنقل
              </span>
              <span>
                <kbd className={s.kbd}>Enter</kbd> فتح
              </span>
              <span>
                <kbd className={s.kbd}>Esc</kbd> إغلاق
              </span>
            </p>
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}

function ResultRow(p: {
  e: SearchEntry;
  supplier: string;
  q: string;
  id: string;
  first: boolean;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const { e, q } = p;
  const k = kindLabel(e);
  const amount = e.credit || e.debit;
  const text = e.kind === "note" ? e.note : e.details;
  return (
    <>
      {p.first ? <p className={s.group}>الحركات</p> : null}
      <div
        id={p.id}
        role="option"
        aria-selected={p.active}
        className={`${s.res} ${p.active ? s.act : ""} ${e.deleted ? s.gone : ""}`}
        tabIndex={-1}
        onMouseMove={p.onHover}
        onClick={p.onPick}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") p.onPick();
        }}
      >
        <span className={s.k}>{k.label}</span>
        <span className={s.main}>
          <span className={s.t1}>
            {e.refNo ? (
              <>
                <span className="num">
                  <Hl text={e.refNo} q={q} />
                </span>{" "}
                ·{" "}
              </>
            ) : null}
            <Hl text={p.supplier} q={q} />
            {k.tag ? <span className={s.tag}>{k.tag}</span> : null}
            {e.deleted ? <span className={`${s.tag} ${s.del}`}>محذوف</span> : null}
          </span>
          <span className={s.t2}>
            <span className="num">{e.date ? formatDate(e.date) : ""}</span>
            {text ? (
              <>
                {" · "}
                <Hl text={text} q={q} />
              </>
            ) : null}
            {e.voucher ? (
              <>
                {" · سند "}
                <span className="num">
                  <Hl text={e.voucher} q={q} />
                </span>
              </>
            ) : null}
          </span>
        </span>
        <span className={s.end}>
          {amount ? (
            <span className={`num ${s.amt}`}>
              <Hl text={formatMoney(amount)} q={q} />
            </span>
          ) : null}
          {e.kind === "inv" ? (
            <span className={e.odooEntered ? s.in : s.out}>{e.odooEntered ? "دخلت" : "لم تدخل"}</span>
          ) : null}
        </span>
      </div>
    </>
  );
}
