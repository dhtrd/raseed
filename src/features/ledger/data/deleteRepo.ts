/**
 * الحذف الناعم والاسترجاع (DECISIONS 2026-10-11، الخيار أ): معاملة واحدة تكتب الحركة وسجل تدقيقها بالسبب،
 * وتحرّر رقمها المرجعي عند الحذف وتعيده عند الاسترجاع (قرار المستخدم)، وتُغلق سجل المراجعة بوسم «حُذفت»
 * وتعيد فتحه عند الاسترجاع (قرار المستخدم). القواعد تفرض كل شرط من الخادم.
 */
import {
  collection,
  deleteField,
  doc,
  documentId,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import type { Period } from "../../../shared/fields/components/PeriodFilter";
import { refIndexKey } from "../../../shared/fields/core/ref";
import type { DeletedEntry, Deletion } from "../core/deleteEntry";
import { parseEntry, type LedgerEntry } from "../core/ledger";
import { EntrySaveError, type RefPlace } from "./entriesRepo";

const hasRef = (e: LedgerEntry) => (e.kind === "inv" || e.kind === "misc") && e.refNo !== "";

function parseDeletion(d: DocumentData): Deletion | null {
  const x = d.deletion as { by?: unknown; at?: unknown; reason?: unknown } | undefined;
  if (!x || typeof x !== "object") return null;
  return {
    by: typeof x.by === "string" ? x.by : "",
    at: x.at instanceof Timestamp ? x.at.toMillis() : null,
    reason: typeof x.reason === "string" ? x.reason : "",
  };
}

export function parseDeleted(id: string, d: DocumentData): DeletedEntry {
  return { ...parseEntry(id, d), deletion: parseDeletion(d) };
}

/** المحذوفات لمورد (للمالك والإدارة فقط؛ القواعد تخفيها عن مدخل البيانات)، بمستمع مباشر. */
export function watchDeleted(
  supplierId: string,
  period: Period | null,
  onData: (entries: DeletedEntry[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const { db } = firebase();
  const range = period ? [where("date", ">=", period.from), where("date", "<=", period.to)] : [];
  return onSnapshot(
    query(
      collection(db, "entries"),
      where("supplierId", "==", supplierId),
      where("deleted", "==", true),
      ...range,
      orderBy("date"),
      orderBy(documentId()),
    ),
    (snap) => onData(snap.docs.map((d) => parseDeleted(d.id, d.data()))),
    onError,
  );
}

export interface DeleteOptions {
  supplierName: string;
  reason: string;
  /** سبب التكرار المؤكَّد عند استرجاع رقم استُعمل بعد الحذف */
  dupReason: string | null;
}

export async function softDeleteEntry(uid: string, e: LedgerEntry, reason: string): Promise<void> {
  const { db } = firebase();
  const entryRef = doc(db, "entries", e.id);
  const issueRef = doc(db, "migrationIssues", e.id);

  await runTransaction(db, async (tx) => {
    const cur = await tx.get(entryRef);
    if (!cur.exists() || cur.get("deleted") === true) throw new EntrySaveError("الحركة محذوفة مسبقاً أو غير موجودة.");
    // الرقم من المستند الحالي لا من الشاشة
    const fresh = parseEntry(e.id, cur.data());
    const refDoc = hasRef(fresh) ? doc(db, "refs", refIndexKey(fresh.refNo)) : null;
    const refSnap = refDoc ? await tx.get(refDoc) : null;
    const issue = await tx.get(issueRef);

    const auditRef = doc(collection(db, "auditLog"));
    tx.set(auditRef, {
      actor: uid,
      at: serverTimestamp(),
      action: "delete",
      entity: "entries",
      entityId: e.id,
      before: { deleted: false },
      after: { deleted: true },
      reason,
    });
    tx.update(entryRef, {
      deleted: true,
      deletion: { by: uid, at: serverTimestamp(), reason },
      updatedAt: serverTimestamp(),
      auditId: auditRef.id,
    });
    // تحرير الرقم: تُزال الحركة وحدها من فهرسه
    if (refDoc && refSnap?.exists()) {
      const d = refSnap.data() as { ids?: string[]; places?: RefPlace[] };
      if ((d.ids ?? []).includes(e.id))
        tx.update(refDoc, {
          ids: (d.ids ?? []).filter((x) => x !== e.id),
          places: (d.places ?? []).filter((p) => p.entryId !== e.id),
        });
    }
    if (issue.exists() && issue.get("resolved") !== true) {
      const issueAudit = doc(collection(db, "auditLog"));
      tx.set(issueAudit, {
        actor: uid,
        at: serverTimestamp(),
        action: "reviewDeleted",
        entity: "migrationIssues",
        entityId: e.id,
        before: { resolved: false },
        after: { resolved: true, resolution: "deleted" },
        reason,
      });
      tx.update(issueRef, {
        resolved: true,
        resolution: "deleted",
        resolutionNote: reason,
        resolvedBy: uid,
        resolvedAt: serverTimestamp(),
        auditId: issueAudit.id,
      });
    }
  });
}

export async function restoreEntry(uid: string, e: LedgerEntry, o: DeleteOptions): Promise<void> {
  const { db } = firebase();
  const entryRef = doc(db, "entries", e.id);
  const issueRef = doc(db, "migrationIssues", e.id);

  await runTransaction(db, async (tx) => {
    const cur = await tx.get(entryRef);
    if (!cur.exists() || cur.get("deleted") !== true) throw new EntrySaveError("الحركة ليست محذوفة.");
    const fresh = parseEntry(e.id, cur.data());
    const refDoc = hasRef(fresh) ? doc(db, "refs", refIndexKey(fresh.refNo)) : null;
    const refSnap = refDoc ? await tx.get(refDoc) : null;
    const issue = await tx.get(issueRef);
    const d = (refSnap?.exists() ? refSnap.data() : {}) as { ids?: string[]; places?: RefPlace[] };
    const others = (d.ids ?? []).filter((x) => x !== e.id);
    if (others.length && !o.dupReason)
      throw new EntrySaveError(
        `الرقم المرجعي ${fresh.refNo} استُعمل لحركة أخرى بعد الحذف. أكّد أنهما مختلفتان واكتب السبب.`,
      );

    const auditRef = doc(collection(db, "auditLog"));
    tx.set(auditRef, {
      actor: uid,
      at: serverTimestamp(),
      action: "restore",
      entity: "entries",
      entityId: e.id,
      before: { deleted: true },
      after: { deleted: false },
      reason: others.length && o.dupReason ? `${o.reason} · تكرار مؤكَّد: ${o.dupReason}` : o.reason,
    });
    const data: Record<string, unknown> = {
      deleted: false,
      deletion: deleteField(),
      updatedAt: serverTimestamp(),
      auditId: auditRef.id,
    };
    if (refDoc) data.dup = others.length && o.dupReason ? { reason: o.dupReason } : deleteField();
    tx.update(entryRef, data);

    if (refDoc && !(d.ids ?? []).includes(e.id)) {
      const place: RefPlace = { entryId: e.id, supplierId: fresh.supplierId, supplierName: o.supplierName };
      if (refSnap?.exists()) tx.update(refDoc, { ids: [...(d.ids ?? []), e.id], places: [...(d.places ?? []), place] });
      else tx.set(refDoc, { ids: [e.id], places: [place] });
    }
    // سجل المراجعة المغلق بالحذف يعود مفتوحاً
    if (issue.exists() && issue.get("resolution") === "deleted") {
      const issueAudit = doc(collection(db, "auditLog"));
      tx.set(issueAudit, {
        actor: uid,
        at: serverTimestamp(),
        action: "reviewReopened",
        entity: "migrationIssues",
        entityId: e.id,
        before: { resolved: true, resolution: "deleted" },
        after: { resolved: false },
        reason: o.reason,
      });
      tx.update(issueRef, {
        resolved: false,
        resolution: "reopened",
        resolutionNote: o.reason,
        resolvedBy: uid,
        resolvedAt: serverTimestamp(),
        auditId: issueAudit.id,
      });
    }
  });
}
