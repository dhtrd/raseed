import { collection, doc, serverTimestamp, type Firestore, type WriteBatch } from "firebase/firestore";

export type AuditEntity = "entries" | "users" | "suppliers" | "settings";

export interface AuditInput {
  actor: string;
  action: string;
  entity: AuditEntity;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
}

/**
 * يضيف سجل تدقيق إلى الدفعة نفسها ويعيد معرّفه ليُكتب في `auditId` للمستند المعدَّل.
 * القواعد ترفض أي كتابة على المستخدمين والموردين والحركات والإعدادات بلا سجل مطابق.
 */
export function addAudit(batch: WriteBatch, db: Firestore, a: AuditInput): string {
  const ref = doc(collection(db, "auditLog"));
  const data: Record<string, unknown> = {
    actor: a.actor,
    at: serverTimestamp(),
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
  };
  if (a.before) data.before = a.before;
  if (a.after) data.after = a.after;
  if (a.reason) data.reason = a.reason;
  batch.set(ref, data);
  return ref.id;
}
