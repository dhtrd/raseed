/**
 * كتابة الخطة في Firestore بـ firebase-admin (المحاكي أو الإنتاج). معرّفات ثابتة: إعادة التشغيل لا تكرر شيئاً.
 * علامة الاكتمال settings/migration تُكتب أخيراً، ووجودها يمنع نقلاً ثانياً.
 */
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { Plan } from "./model.ts";

const BATCH = 400;

export async function alreadyMigrated(db: Firestore): Promise<boolean> {
  return (await db.doc("settings/migration").get()).exists;
}

export async function findOwnerUid(db: Firestore): Promise<string> {
  const snap = await db.collection("users").where("role", "==", "owner").limit(1).get();
  const owner = snap.docs[0];
  if (!owner) throw new Error("لا يوجد حساب مالك في users؛ أنشئه قبل النقل (يُسجَّل باسمه في التدقيق).");
  return owner.id;
}

export async function writePlan(
  db: Firestore,
  plan: Plan,
  opts: { ownerUid: string; sha256: string; onProgress?: (done: number, total: number) => void },
): Promise<{ writes: number; auditId: string }> {
  if (await alreadyMigrated(db))
    throw new Error("النقل تم سابقاً (settings/migration موجود). لا يُعاد على البيانات نفسها.");
  const now = Timestamp.now();
  const auditRef = db.collection("auditLog").doc();
  const auditId = auditRef.id;
  const names = new Map(plan.suppliers.map((s) => [s.id, s.name]));

  const ops: [string, Record<string, unknown>][] = [];
  for (const s of plan.suppliers)
    ops.push([
      `suppliers/${s.id}`,
      { name: s.name, status: "active", auditId, createdAt: now, updatedAt: now },
    ]);
  for (const e of plan.entries) {
    const doc: Record<string, unknown> = {
      supplierId: e.supplierId,
      kind: e.kind,
      date: e.date,
      mainRef: e.mainRef,
      refNo: e.refNo,
      voucher: e.voucher,
      details: e.details,
      debit: e.debit,
      credit: e.credit,
      reversed: e.reversed,
      needsManualFix: e.issues.length > 0,
      deleted: false,
      auditId,
      createdBy: "migration",
      createdAt: now,
      updatedAt: now,
    };
    if (e.kind === "inv")
      doc.odoo = {
        entered: e.odooEntered === true,
        by: e.odooEntered ? "migration" : null,
        at: e.odooEntered ? now : null,
        reason: null,
        reasonText: "",
      };
    ops.push([`entries/${e.id}`, doc]);
    if (e.issues.length)
      ops.push([
        `migrationIssues/${e.id}`,
        {
          entryId: e.id,
          supplierId: e.supplierId,
          supplierName: names.get(e.supplierId) ?? "",
          sheet: e.sheet.trim(),
          row: e.row,
          issues: e.issues,
          resolved: false,
          createdAt: now,
        },
      ]);
  }
  for (const [key, r] of plan.refs) ops.push([`refs/${key}`, r]);
  ops.push([
    `auditLog/${auditId}`,
    {
      actor: opts.ownerUid,
      at: FieldValue.serverTimestamp(),
      action: "migrate",
      entity: "entries",
      entityId: "migration",
      reason: "نقل من الإكسل كما هو",
      after: { ...plan.totals, suppliers: plan.suppliers.length, sha256: opts.sha256 },
    },
  ]);

  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = db.batch();
    for (const [path, data] of ops.slice(i, i + BATCH)) batch.set(db.doc(path), data);
    await batch.commit();
    opts.onProgress?.(Math.min(i + BATCH, ops.length), ops.length);
  }
  await db.doc("settings/migration").set({ at: now, sha256: opts.sha256, totals: plan.totals, auditId });
  return { writes: ops.length + 1, auditId };
}
