import { collection, doc, onSnapshot, serverTimestamp, writeBatch, type Unsubscribe } from "firebase/firestore";
import { addAudit } from "../../../shared/firebase/audit";
import { firebase } from "../../../shared/firebase/client";

export interface SupplierRow {
  id: string;
  name: string;
  archived: boolean;
}

/** قائمة الموردين (المالك والإدارة يرونهم كلهم). */
export function watchSuppliers(onData: (s: SupplierRow[]) => void, onError: (e: Error) => void): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    collection(db, "suppliers"),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            return {
              id: d.id,
              name: typeof x.name === "string" ? x.name : d.id,
              archived: x.status === "archived",
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "ar")),
      ),
    onError,
  );
}

/**
 * إشارة تغيّر الموردين داخل الصفحة: بعد إضافة أو تعديل أو أرشفة تُعاد قراءة قوائم الموردين المحمّلة
 * مرة واحدة (useVisibleSuppliers) دون مستمع دائم على المجموعة.
 */
let version = 0;
const listeners = new Set<() => void>();
export const suppliersVersion = () => version;
export function subscribeSuppliers(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function bump() {
  version++;
  listeners.forEach((fn) => fn());
}

/** إضافة مورد (المالك والإدارة؛ القواعد تفرض ذلك مع سجل التدقيق). يعيد معرّفه. */
export async function createSupplier(uid: string, name: string): Promise<string> {
  const { db } = firebase();
  const ref = doc(collection(db, "suppliers"));
  const batch = writeBatch(db);
  const auditId = addAudit(batch, db, {
    actor: uid,
    action: "create",
    entity: "suppliers",
    entityId: ref.id,
    after: { name, status: "active" },
  });
  batch.set(ref, { name, status: "active", auditId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
  bump();
  return ref.id;
}

/** تعديل الاسم (قرار المستخدم 2026-10-11): الاسم القديم يبقى في سجل التدقيق. */
export async function renameSupplier(uid: string, s: SupplierRow, name: string): Promise<void> {
  const { db } = firebase();
  const batch = writeBatch(db);
  const auditId = addAudit(batch, db, {
    actor: uid,
    action: "rename",
    entity: "suppliers",
    entityId: s.id,
    before: { name: s.name },
    after: { name },
  });
  batch.update(doc(db, "suppliers", s.id), { name, auditId, updatedAt: serverTimestamp() });
  await batch.commit();
  bump();
}

/** الأرشفة وإعادة التنشيط (المالك والإدارة). */
export async function setSupplierArchived(uid: string, s: SupplierRow, archived: boolean): Promise<void> {
  const { db } = firebase();
  const batch = writeBatch(db);
  const status = archived ? "archived" : "active";
  const auditId = addAudit(batch, db, {
    actor: uid,
    action: archived ? "archive" : "unarchive",
    entity: "suppliers",
    entityId: s.id,
    before: { status: s.archived ? "archived" : "active" },
    after: { status },
  });
  batch.update(doc(db, "suppliers", s.id), { status, auditId, updatedAt: serverTimestamp() });
  await batch.commit();
  bump();
}
