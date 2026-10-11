/**
 * قراءة سجل التدقيق (للمالك والإدارة؛ القواعد تفرض ذلك): صفحات من 50 الأحدث أولاً، بفلاتر المستخدم
 * والنوع والفترة، كي لا تُستهلك قراءات خطة Spark. ووصف مختصر للحركات المذكورة في الصفحة.
 */
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import type { Period } from "../../../shared/fields/components/PeriodFilter";
import { ODOO_ACTIONS, type AuditKind, type AuditRecord } from "../core/audit";

export const AUDIT_PAGE = 50;
const IN_LIMIT = 30;

const ENTITY: Partial<Record<AuditKind, string>> = {
  entries: "entries",
  suppliers: "suppliers",
  users: "users",
  settings: "settings",
  review: "migrationIssues",
};

export interface AuditFilter {
  actor: string | null;
  kind: AuditKind;
  period: Period | null;
}

export interface AuditPage {
  records: AuditRecord[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  more: boolean;
}

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function parse(d: QueryDocumentSnapshot<DocumentData>): AuditRecord {
  const x = d.data();
  return {
    id: d.id,
    actor: typeof x.actor === "string" ? x.actor : "",
    at: x.at instanceof Timestamp ? x.at.toMillis() : null,
    action: typeof x.action === "string" ? x.action : "",
    entity: typeof x.entity === "string" ? x.entity : "",
    entityId: typeof x.entityId === "string" ? x.entityId : "",
    before: obj(x.before),
    after: obj(x.after),
    reason: typeof x.reason === "string" ? x.reason : "",
  };
}

/** بداية اليوم ونهايته بتوقيت الرياض (UTC+3) */
const riyadhStart = (iso: string) => Timestamp.fromMillis(Date.parse(`${iso}T00:00:00+03:00`));
const riyadhEnd = (iso: string) => Timestamp.fromMillis(Date.parse(`${iso}T23:59:59.999+03:00`));

export async function loadAuditPage(
  f: AuditFilter,
  cursor: QueryDocumentSnapshot<DocumentData> | null,
): Promise<AuditPage> {
  const { db } = firebase();
  const c: QueryConstraint[] = [];
  if (f.actor) c.push(where("actor", "==", f.actor));
  if (f.kind === "odoo") c.push(where("action", "in", ODOO_ACTIONS));
  else if (ENTITY[f.kind]) c.push(where("entity", "==", ENTITY[f.kind]));
  if (f.period) c.push(where("at", ">=", riyadhStart(f.period.from)), where("at", "<=", riyadhEnd(f.period.to)));
  c.push(orderBy("at", "desc"));
  if (cursor) c.push(startAfter(cursor));
  c.push(limit(AUDIT_PAGE + 1));
  const snap = await getDocs(query(collection(db, "auditLog"), ...c));
  const docs = snap.docs.slice(0, AUDIT_PAGE);
  return {
    records: docs.map(parse),
    cursor: docs[docs.length - 1] ?? null,
    more: snap.docs.length > AUDIT_PAGE,
  };
}

export interface EntryBrief {
  refNo: string;
  kind: string;
  supplierId: string;
  date: string;
  deleted: boolean;
}

/** وصف مختصر للحركات المذكورة (قراءة لكل حركة، بدفعات من 30). */
export async function loadEntryBriefs(ids: string[]): Promise<Map<string, EntryBrief>> {
  const { db } = firebase();
  const out = new Map<string, EntryBrief>();
  const uniq = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += IN_LIMIT) {
    const snap = await getDocs(
      query(collection(db, "entries"), where(documentId(), "in", uniq.slice(i, i + IN_LIMIT))),
    );
    for (const d of snap.docs) {
      const x = d.data();
      out.set(d.id, {
        refNo: typeof x.refNo === "string" ? x.refNo : "",
        kind: typeof x.kind === "string" ? x.kind : "",
        supplierId: typeof x.supplierId === "string" ? x.supplierId : "",
        date: typeof x.date === "string" ? x.date : "",
        deleted: x.deleted === true,
      });
    }
  }
  return out;
}
