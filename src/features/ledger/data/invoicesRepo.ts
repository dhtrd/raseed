/**
 * قراءة الفواتير وكتابة حالة Odoo. كل فاتورة تُكتب في دفعة مستقلة مع سجل تدقيقها (القواعد تشترطه)،
 * فإن رفضت القواعد فاتورة (فترة مقفلة، أو بيانات منقولة تحتاج تعديلاً يدوياً) لا تسقط البقية،
 * ويُعاد رقمها وسببها للمستخدم بوضوح.
 */
import {
  collection,
  doc,
  documentId,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { addAudit } from "../../../shared/firebase/audit";
import { firebase } from "../../../shared/firebase/client";
import type { Period } from "../../../shared/fields/components/PeriodFilter";
import type { OdooRevertReason } from "../../../shared/fields/components/ReasonDialog";
import { parseEntry, type LedgerEntry } from "../core/ledger";

/** الحد الذي يقبله Firestore في شرط «in». */
const IN_LIMIT = 30;

/**
 * فواتير غير محذوفة بمستمع مباشر (تغيير الحالة يظهر فوراً).
 * `supplierIds = null`: كل الموردين (للمالك والإدارة فقط)؛ وإلا موردون محددون (مدخل البيانات دائماً).
 */
export function watchInvoices(
  supplierIds: string[] | null,
  period: Period | null,
  onData: (rows: LedgerEntry[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const { db } = firebase();
  const range: QueryConstraint[] = period
    ? [where("date", ">=", period.from), where("date", "<=", period.to)]
    : [];
  const base = (extra: QueryConstraint[]) =>
    query(
      collection(db, "entries"),
      ...extra,
      where("kind", "==", "inv"),
      where("deleted", "==", false),
      ...range,
      orderBy("date"),
      orderBy(documentId()),
    );
  const groups: (string[] | null)[] = [];
  if (supplierIds === null) groups.push(null);
  else for (let i = 0; i < supplierIds.length; i += IN_LIMIT) groups.push(supplierIds.slice(i, i + IN_LIMIT));
  if (!groups.length) {
    onData([]);
    return () => {};
  }
  const parts = new Map<number, LedgerEntry[]>();
  const unsubs = groups.map((g, i) =>
    onSnapshot(
      base(g === null ? [] : [where("supplierId", "in", g)]),
      (snap) => {
        parts.set(
          i,
          snap.docs.map((d) => parseEntry(d.id, d.data())),
        );
        if (parts.size === groups.length) onData([...parts.values()].flat());
      },
      onError,
    ),
  );
  return () => unsubs.forEach((u) => u());
}

/** تاريخ الإقفال («مقفل حتى X») أو null إن لم يُضبط. */
export function watchLockedThrough(onData: (d: string | null) => void, onError: (e: Error) => void): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    doc(db, "settings", "lock"),
    (s) => {
      const v = s.get("lockedThrough");
      onData(typeof v === "string" && v ? v : null);
    },
    onError,
  );
}

export type OdooChange = { entered: true } | { entered: false; reason: OdooRevertReason; text: string };

export interface OdooResult {
  done: string[];
  failed: { id: string; refNo: string; message: string }[];
}

/** دفعات صغيرة متوازية بحد أقصى، كي لا تُغرق الشبكة عند تحديد مئات الفواتير. */
const CONCURRENCY = 8;

export async function setOdooStatus(
  uid: string,
  rows: Pick<LedgerEntry, "id" | "refNo" | "odooEntered">[],
  change: OdooChange,
  onProgress?: (done: number) => void,
): Promise<OdooResult> {
  const { db } = firebase();
  const result: OdooResult = { done: [], failed: [] };
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const r = rows[next++];
      if (!r) break;
      try {
        const batch = writeBatch(db);
        const odoo = change.entered
          ? { entered: true, by: uid, at: serverTimestamp() }
          : {
              entered: false,
              by: uid,
              at: serverTimestamp(),
              reason: change.reason,
              reasonText: change.text,
            };
        const auditId = addAudit(batch, db, {
          actor: uid,
          action: change.entered ? "odooEntered" : "odooReverted",
          entity: "entries",
          entityId: r.id,
          before: { odooEntered: r.odooEntered === true },
          after: { odooEntered: change.entered },
          reason: change.entered ? undefined : [change.reason, change.text].filter(Boolean).join(": "),
        });
        batch.update(doc(db, "entries", r.id), { odoo, auditId, updatedAt: serverTimestamp() });
        await batch.commit();
        result.done.push(r.id);
      } catch (e) {
        console.error(`تعذّر تغيير حالة Odoo للفاتورة ${r.refNo || r.id}`, e);
        const code = (e as { code?: string }).code ?? "";
        result.failed.push({
          id: r.id,
          refNo: r.refNo || r.id,
          message:
            code === "permission-denied"
              ? "رفضتها القواعد: قد تكون في فترة مقفلة أو تحتاج تعديلاً يدوياً من مركز المراجعة."
              : code === "unavailable"
                ? "لا اتصال بالخادم."
                : `خطأ غير متوقع (${code || "غير معروف"}).`,
        });
      }
      onProgress?.(result.done.length + result.failed.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  return result;
}
