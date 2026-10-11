/**
 * إضافة حركة (فاتورة / قيد / ملاحظة). الحركة وسجل تدقيقها وفهرس رقمها المرجعي تُكتب في معاملة واحدة،
 * كما تشترط القواعد (`audited` و`refIndexed`). التكرار مسموح بتأكيد وسبب مكتوب (تحذير صارم غير حاجب).
 */
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import { refIndexKey } from "../../../shared/fields/core/ref";
import { parseEntry } from "../core/ledger";

export interface RefPlace {
  entryId: string;
  supplierId: string;
  supplierName: string;
}

/** أماكن الرقم المرجعي إن كان مسجلاً (اسم المورد يظهر لكل مستخدم، DECISIONS 2026-10-10). */
export async function findRefPlaces(refNo: string): Promise<RefPlace[]> {
  const { db } = firebase();
  const snap = await getDoc(doc(db, "refs", refIndexKey(refNo)));
  if (!snap.exists()) return [];
  const places = snap.get("places") as RefPlace[] | undefined;
  return Array.isArray(places) ? places : [];
}

export interface SupplierContext {
  /** تاريخ آخر حركة محفوظة: أساس +n/−n في النموذج المفرد (FIELDS.md) */
  lastDate: string | null;
  lastRef: { inv: string | null; misc: string | null };
  /** أكثر التفاصيل استخداماً في آخر الحركات، الأكثر أولاً */
  topDetails: string[];
}

const RECENT = 30;
/** حركات اليوم الأخير نفسه نادراً ما تتجاوز هذا العدد */
const LAST_PEEK = 10;

/** سياق المورد للنموذج: ثلاث استعلامات صغيرة (حتى 50 قراءة). */
export async function supplierContext(supplierId: string): Promise<SupplierContext> {
  const { db } = firebase();
  const base = [where("supplierId", "==", supplierId), where("deleted", "==", false)];
  // «آخر رقم»: الأحدث تاريخاً، وعند تساوي التاريخ الأحدث إنشاءً، فيستمر التسلسل من آخر رقم كتبه المستخدم (SPEC)
  const lastOf = async (kind: "inv" | "misc") => {
    const s = await getDocs(
      query(collection(db, "entries"), ...base, where("kind", "==", kind), orderBy("date", "desc"), limit(LAST_PEEK)),
    );
    const millis = (v: unknown) =>
      typeof (v as { toMillis?: () => number } | null)?.toMillis === "function"
        ? (v as { toMillis: () => number }).toMillis()
        : 0;
    const top = s.docs
      .map((d) => ({ date: String(d.get("date")), at: millis(d.get("createdAt")), ref: String(d.get("mainRef") ?? "") }))
      .sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1))[0];
    return top?.ref || null;
  };
  const [recent, inv, misc] = await Promise.all([
    getDocs(query(collection(db, "entries"), ...base, orderBy("date", "desc"), limit(RECENT))),
    lastOf("inv"),
    lastOf("misc"),
  ]);
  const rows = recent.docs.map((d) => parseEntry(d.id, d.data()));
  const counts = new Map<string, number>();
  for (const r of rows) {
    const t = r.details.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return {
    lastDate: rows[0]?.date ?? null,
    lastRef: { inv, misc },
    topDetails: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t),
  };
}

export type NewEntry =
  | {
      kind: "inv" | "misc";
      supplierId: string;
      supplierName: string;
      date: string;
      mainRef: string;
      refNo: string;
      voucher: string;
      details: string;
      amount: number;
      reversed: boolean;
      /** سبب التكرار المؤكَّد (إلزامي إن كان الرقم مسجلاً) */
      dupReason: string | null;
    }
  | { kind: "note"; supplierId: string; supplierName: string; date: string; note: string };

/** خطأ مقصود يُعرض للمستخدم كما هو. */
export class EntrySaveError extends Error {}

export async function addEntry(uid: string, e: NewEntry): Promise<string> {
  const { db } = firebase();
  const entryRef = doc(collection(db, "entries"));
  const auditRef = doc(collection(db, "auditLog"));
  await runTransaction(db, async (tx) => {
    const common = {
      supplierId: e.supplierId,
      kind: e.kind,
      date: e.date,
      needsManualFix: false,
      deleted: false,
      auditId: auditRef.id,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    let data: Record<string, unknown>;
    let refDoc: ReturnType<typeof doc> | null = null;
    let refExists = false;
    if (e.kind === "note") {
      data = { ...common, debit: 0, credit: 0, note: e.note };
    } else {
      refDoc = doc(db, "refs", refIndexKey(e.refNo));
      refExists = (await tx.get(refDoc)).exists();
      if (refExists && !e.dupReason)
        throw new EntrySaveError(
          `الرقم المرجعي ${e.refNo} سُجّل لتوّه لحركة أخرى. راجع التحذير وأكّد مع ذكر السبب، أو عدّل المرجع.`,
        );
      // الفاتورة دائن والقيد مدين، والعكس فقط مع «عكس الاتجاه» (مرتجع/استرداد)
      const credit = (e.kind === "inv") !== e.reversed;
      data = {
        ...common,
        mainRef: e.mainRef,
        refNo: e.refNo,
        voucher: e.voucher,
        details: e.details,
        debit: credit ? 0 : e.amount,
        credit: credit ? e.amount : 0,
        reversed: e.reversed,
        ...(e.kind === "inv"
          ? { odoo: { entered: false, by: null, at: null, reason: null, reasonText: "" } }
          : {}),
        ...(refExists && e.dupReason ? { dup: { reason: e.dupReason } } : {}),
      };
    }
    tx.set(entryRef, data);
    tx.set(auditRef, {
      actor: uid,
      at: serverTimestamp(),
      action: "create",
      entity: "entries",
      entityId: entryRef.id,
      after:
        e.kind === "note"
          ? { kind: "note", date: e.date, supplierId: e.supplierId }
          : {
              kind: e.kind,
              date: e.date,
              supplierId: e.supplierId,
              refNo: e.refNo,
              debit: data.debit,
              credit: data.credit,
            },
      ...(e.kind !== "note" && refExists && e.dupReason ? { reason: `تكرار مؤكَّد: ${e.dupReason}` } : {}),
    });
    if (refDoc) {
      const place: RefPlace = { entryId: entryRef.id, supplierId: e.supplierId, supplierName: e.supplierName };
      if (refExists) tx.update(refDoc, { ids: arrayUnion(entryRef.id), places: arrayUnion(place) });
      else tx.set(refDoc, { ids: [entryRef.id], places: [place] });
    }
  });
  return entryRef.id;
}
