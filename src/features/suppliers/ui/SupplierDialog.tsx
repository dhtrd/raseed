import { useState } from "react";
import { TextField } from "../../../shared/fields/components/TextField";
import { Banner } from "../../../shared/ui/Banner";
import { Button } from "../../../shared/ui/Button";
import { Dialog, dialogStyles as d } from "../../../shared/ui/Dialog";
import { checkSupplierName, SUPPLIER_NAME_MAX, type NamedSupplier } from "../core/suppliers";
import { createSupplier, renameSupplier, setSupplierArchived } from "../data/suppliersRepo";
import s from "./SupplierDialog.module.css";

export type SupplierAction =
  | { kind: "add" }
  | { kind: "rename"; supplier: NamedSupplier }
  | { kind: "archive"; supplier: NamedSupplier };

const TITLE = { add: "مورد جديد", rename: "تعديل اسم المورد", archive: "أرشفة المورد" } as const;

/**
 * إضافة مورد وتعديل اسمه وأرشفته (الخيار ب المعتمد في proposals/2026-10-11-suppliers.html):
 * للمالك والإدارة، وكل تغيير بسجل تدقيق. وسطى على الحاسوب، ولوحة سفلية على الجوال.
 */
export function SupplierDialog(p: {
  action: SupplierAction | null;
  uid: string;
  /** كل الموردين (للتحقق من تكرار الاسم) */
  all: NamedSupplier[];
  onClose: () => void;
  /** المعرّف (للإضافة) ونص النتيجة */
  onDone: (text: string, id: string) => void;
}) {
  const a = p.action;
  const title = !a ? "" : a.kind === "archive" && a.supplier.archived ? "إعادة تنشيط المورد" : TITLE[a.kind];
  return (
    <Dialog isOpen={a !== null} title={title} onDismiss={p.onClose}>
      {a ? (
        <Body
          key={a.kind + (a.kind === "add" ? "" : a.supplier.id)}
          action={a}
          uid={p.uid}
          all={p.all}
          onClose={p.onClose}
          onDone={p.onDone}
        />
      ) : null}
    </Dialog>
  );
}

function Body(p: {
  action: SupplierAction;
  uid: string;
  all: NamedSupplier[];
  onClose: () => void;
  onDone: (text: string, id: string) => void;
}) {
  const a = p.action;
  const [name, setName] = useState(a.kind === "rename" ? a.supplier.name : "");
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const check =
    a.kind === "archive" ? null : checkSupplierName(name, p.all, a.kind === "rename" ? a.supplier.id : null);

  const fail = (e: unknown, what: string) => {
    console.error(`تعذّر ${what}`, e);
    setFailure(
      (e as { code?: string }).code === "permission-denied"
        ? `رفضت القواعد ${what}: الموردون للمالك والإدارة فقط.`
        : `تعذّر ${what}. أعد المحاولة، وإن تكرر فأبلغ المالك.`,
    );
  };

  const submit = async () => {
    setFailure(null);
    if (a.kind !== "archive") {
      const c = checkSupplierName(name, p.all, a.kind === "rename" ? a.supplier.id : null);
      setError(c.error);
      if (c.error) return;
    }
    const t = name.trim().replace(/\s+/g, " ");
    setBusy(true);
    try {
      if (a.kind === "add") {
        const id = await createSupplier(p.uid, t);
        p.onDone(`أُضيف المورد «${t}» وسُجّل في التدقيق.`, id);
      } else if (a.kind === "rename") {
        if (t === a.supplier.name) return p.onClose();
        await renameSupplier(p.uid, a.supplier, t);
        p.onDone(`عُدّل الاسم من «${a.supplier.name}» إلى «${t}» وسُجّل في التدقيق.`, a.supplier.id);
      } else {
        const archive = !a.supplier.archived;
        await setSupplierArchived(p.uid, a.supplier, archive);
        p.onDone(
          archive
            ? `أُرشف «${a.supplier.name}»: لا يظهر في الإدخال والإسناد، وكشفه باقٍ.`
            : `أُعيد تنشيط «${a.supplier.name}».`,
          a.supplier.id,
        );
      }
    } catch (e) {
      fail(e, a.kind === "add" ? "إضافة المورد" : a.kind === "rename" ? "تعديل الاسم" : "تغيير حالة المورد");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={s.form}
      noValidate
      aria-label={a.kind === "add" ? "مورد جديد" : a.kind === "rename" ? "تعديل اسم المورد" : "حالة المورد"}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {a.kind === "archive" ? (
        <p className={d.sub}>
          {a.supplier.archived
            ? `يعود «${a.supplier.name}» إلى القوائم والإدخال والإسناد.`
            : `«${a.supplier.name}» يختفي من الإدخال والإسناد، ويبقى كشفه وأرصدته وإسناده السابق. يمكن إعادة تنشيطه من كشفه.`}
        </p>
      ) : (
        <>
          <TextField
            label="اسم المورد"
            required
            value={name}
            onChange={(v) => {
              setName(v);
              setError(null);
            }}
            maxLength={SUPPLIER_NAME_MAX}
            error={error}
          />
          {check && !check.error && check.similar.length ? (
            <p className={s.similar} role="status">
              <b>تنبيه:</b> اسم قريب من {check.similar.map((x) => `«${x}»`).join("، ")}. تأكد أنه مورد مختلف.
            </p>
          ) : null}
          {a.kind === "rename" ? (
            <p className={d.sub}>الاسم القديم يبقى في سجل التدقيق، والكشف والحركات لا تتغير.</p>
          ) : null}
        </>
      )}
      {failure ? <Banner tone="err">{failure}</Banner> : null}
      <div className={d.actions}>
        <Button type="submit" variant="primary" busy={busy}>
          {a.kind === "add"
            ? "إضافة المورد"
            : a.kind === "rename"
              ? "حفظ الاسم"
              : a.supplier.archived
                ? "إعادة التنشيط"
                : "أرشفة"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={p.onClose}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
