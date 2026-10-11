/**
 * تعديل الحركة (نافذة التعديل، DECISIONS 2026-10-11): معاملة واحدة تكتب الحركة وسجل تدقيقها بالسبب،
 * وتنقل الحركة بين فهارس الأرقام المرجعية إن تغيّر رقمها، وتغلق سجل المراجعة إن اختار المستخدم ذلك صراحة.
 * القواعد تفرض كل شرط من الخادم؛ هنا رسائل واضحة لما يُكتشف قبل الإرسال.
 */
import { collection, deleteField, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import { refIndexKey } from "../../../shared/fields/core/ref";
import type { EntryPatch } from "../core/editEntry";
import type { LedgerEntry } from "../core/ledger";
import { EntrySaveError, type RefPlace } from "./entriesRepo";

export interface EditOptions {
  supplierName: string;
  reason: string;
  /** سبب تسجيل رقم مكرر إن انتقلت الحركة إلى رقم مسجّل */
  dupReason: string | null;
  /** سجل المراجعة الذي يُعلَّم «تمت المراجعة» بعد الحفظ (اختيار صريح من المستخدم) */
  resolveIssueId: string | null;
}

export async function updateEntry(uid: string, orig: LedgerEntry, patch: EntryPatch, o: EditOptions): Promise<void> {
  const { db } = firebase();
  const entryRef = doc(db, "entries", orig.id);
  const refChanged = patch.refNo !== orig.refNo && (patch.kind === "inv" || patch.kind === "misc");
  const newRefDoc = refChanged ? doc(db, "refs", refIndexKey(patch.refNo)) : null;
  const oldRefDoc = refChanged && orig.refNo ? doc(db, "refs", refIndexKey(orig.refNo)) : null;

  await runTransaction(db, async (tx) => {
    // القراءات أولاً كما تشترط Firestore
    const newSnap = newRefDoc ? await tx.get(newRefDoc) : null;
    const oldSnap = oldRefDoc ? await tx.get(oldRefDoc) : null;
    const newExists = newSnap?.exists() === true;
    if (newExists && !o.dupReason)
      throw new EntrySaveError(
        `الرقم المرجعي ${patch.refNo} مسجّل لحركة أخرى. أكّد أنها مختلفة واكتب السبب، أو عدّل المرجع.`,
      );

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const k of Object.keys(patch) as (keyof EntryPatch)[]) {
      if (String(patch[k]) !== String(orig[k])) {
        before[k] = orig[k];
        after[k] = patch[k];
      }
    }
    const auditRef = doc(collection(db, "auditLog"));
    tx.set(auditRef, {
      actor: uid,
      at: serverTimestamp(),
      action: "update",
      entity: "entries",
      entityId: orig.id,
      before,
      after,
      reason: newExists && o.dupReason ? `${o.reason} · تكرار مؤكَّد: ${o.dupReason}` : o.reason,
    });

    const data: Record<string, unknown> = {
      ...patch,
      auditId: auditRef.id,
      updatedAt: serverTimestamp(),
    };
    if (o.resolveIssueId) data.needsManualFix = false;
    if (refChanged) data.dup = newExists && o.dupReason ? { reason: o.dupReason } : deleteField();
    tx.update(entryRef, data);

    if (newRefDoc) {
      const place: RefPlace = { entryId: orig.id, supplierId: orig.supplierId, supplierName: o.supplierName };
      if (newExists) {
        const d = newSnap?.data() as { ids?: string[]; places?: RefPlace[] } | undefined;
        tx.update(newRefDoc, { ids: [...(d?.ids ?? []), orig.id], places: [...(d?.places ?? []), place] });
      } else tx.set(newRefDoc, { ids: [orig.id], places: [place] });
    }
    // الرقم القديم: تُزال الحركة وحدها من فهرسه (القواعد تسمح بذلك فقط لأنها انتقلت في الدفعة نفسها)
    if (oldRefDoc && oldSnap?.exists()) {
      const d = oldSnap.data() as { ids?: string[]; places?: RefPlace[] };
      if ((d.ids ?? []).includes(orig.id))
        tx.update(oldRefDoc, {
          ids: (d.ids ?? []).filter((x) => x !== orig.id),
          places: (d.places ?? []).filter((p) => p.entryId !== orig.id),
        });
    }

    if (o.resolveIssueId) {
      const issueAudit = doc(collection(db, "auditLog"));
      tx.set(issueAudit, {
        actor: uid,
        at: serverTimestamp(),
        action: "reviewFixed",
        entity: "migrationIssues",
        entityId: o.resolveIssueId,
        before: { resolved: false },
        after: { resolved: true },
        reason: o.reason,
      });
      tx.update(doc(db, "migrationIssues", o.resolveIssueId), {
        resolved: true,
        resolution: "fixed",
        resolutionNote: o.reason.slice(0, 300),
        resolvedBy: uid,
        resolvedAt: serverTimestamp(),
        auditId: issueAudit.id,
      });
    }
  });
}
