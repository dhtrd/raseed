/**
 * قفل الفترات: قراءة الحالة مباشرة، والحفظ مع سجل التدقيق بالسبب في الدفعة نفسها (القواعد تشترطه)،
 * وسجل الإقفال من التدقيق، وعدّ الحركات المقفلة. المالك وحده يكتب (القواعد تفرض ذلك).
 */
import {
  collection,
  doc,
  getCountFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { addAudit } from "../../../shared/firebase/audit";
import { firebase } from "../../../shared/firebase/client";
import type { IsoDate } from "../../../shared/fields/core/date";
import type { LockPlan, LockState } from "../core/lock";

const iso = (v: unknown): IsoDate | null => (typeof v === "string" && v ? v : null);

export function watchLock(onData: (s: LockState) => void, onError: (e: Error) => void): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    doc(db, "settings", "lock"),
    (s) => onData({ lockedThrough: iso(s.get("lockedThrough")), tempFrom: iso(s.get("tempFrom")) }),
    onError,
  );
}

export async function saveLock(uid: string, before: LockState, plan: LockPlan, reason: string): Promise<void> {
  const { db } = firebase();
  const batch = writeBatch(db);
  const clean = (s: LockState) =>
    Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null)) as Record<string, string>;
  const auditId = addAudit(batch, db, {
    actor: uid,
    action: plan.action,
    entity: "settings",
    entityId: "lock",
    before: clean(before),
    after: clean(plan.next),
    reason: reason.trim(),
  });
  // set يستبدل المستند كله: إعادة القفل تحذف tempFrom
  batch.set(doc(db, "settings", "lock"), { ...clean(plan.next), auditId });
  await batch.commit();
}

export interface LockHistoryItem {
  id: string;
  action: string;
  actor: string;
  at: Date | null;
  after: Partial<LockState> | undefined;
  reason: string;
}

/** آخر تغييرات القفل من التدقيق (للمالك والإدارة؛ فهرس entity + entityId + at تنازلي). */
export function watchLockHistory(
  onData: (rows: LockHistoryItem[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    query(
      collection(db, "auditLog"),
      where("entity", "==", "settings"),
      where("entityId", "==", "lock"),
      orderBy("at", "desc"),
      limit(30),
    ),
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const at = d.get("at") as { toDate?: () => Date } | null;
          return {
            id: d.id,
            action: String(d.get("action") ?? ""),
            actor: String(d.get("actor") ?? ""),
            at: at?.toDate ? at.toDate() : null,
            after: d.get("after") as Partial<LockState> | undefined,
            reason: String(d.get("reason") ?? ""),
          };
        }),
      ),
    onError,
  );
}

/** عدد الحركات غير المحذوفة بتاريخ في (from, to] — from = null من البداية (فهرس deleted + date). */
export async function countEntriesBetween(from: IsoDate | null, to: IsoDate): Promise<number> {
  const { db } = firebase();
  const q = query(
    collection(db, "entries"),
    where("deleted", "==", false),
    ...(from ? [where("date", ">", from)] : []),
    where("date", "<=", to),
  );
  return (await getCountFromServer(q)).data().count;
}
