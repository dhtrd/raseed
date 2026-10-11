/**
 * قراءات الأرصدة والكشف. الأرصدة بتجميعات sum() على الخادم: تُحتسب قراءة واحدة لكل ألف حركة،
 * فتبقى لوحة الأرصدة بعشرات القراءات بدل آلاف (حد Spark: 50 ألف قراءة يومياً).
 * كل استعلام يحمل deleted == false كي تقبله القواعد لمدخل البيانات أيضاً.
 */
import {
  collection,
  doc,
  documentId,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  sum,
  where,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import type { Period } from "../../../shared/fields/components/PeriodFilter";
import type { UserProfile } from "../../users/core/users";
import { isManager } from "../../users/core/users";
import { parseEntry, type LedgerEntry, type SupplierBalance } from "../core/ledger";

export interface SupplierRef {
  id: string;
  name: string;
  archived: boolean;
}

/** الموردون المرئيون: الكل للمالك والإدارة، والمسنَدون فقط لمدخل البيانات (القواعد تفرض ذلك). */
export async function listVisibleSuppliers(profile: UserProfile): Promise<SupplierRef[]> {
  const { db } = firebase();
  const parse = (id: string, d: Record<string, unknown> | undefined): SupplierRef | null =>
    d ? { id, name: typeof d.name === "string" ? d.name : id, archived: d.status === "archived" } : null;
  let list: SupplierRef[];
  if (isManager(profile.role)) {
    const snap = await getDocs(collection(db, "suppliers"));
    list = snap.docs.map((d) => parse(d.id, d.data())).filter((x): x is SupplierRef => x !== null);
  } else {
    const docs = await Promise.all(profile.assigned.map((id) => getDoc(doc(db, "suppliers", id))));
    list = docs.map((d) => parse(d.id, d.data())).filter((x): x is SupplierRef => x !== null);
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

function entriesOf(supplierId: string, ...extra: QueryConstraint[]) {
  const { db } = firebase();
  return query(collection(db, "entries"), where("supplierId", "==", supplierId), where("deleted", "==", false), ...extra);
}

async function sums(q: ReturnType<typeof entriesOf>): Promise<{ debit: number; credit: number }> {
  const s = await getAggregateFromServer(q, { debit: sum("debit"), credit: sum("credit") });
  return { debit: s.data().debit ?? 0, credit: s.data().credit ?? 0 };
}

/** رصيد مورد لفترة: السابق (قبل البداية) ومدين ودائن الفترة والنهائي. */
export async function supplierBalance(s: SupplierRef, period: Period): Promise<SupplierBalance> {
  const [before, inside] = await Promise.all([
    sums(entriesOf(s.id, where("date", "<", period.from))),
    sums(entriesOf(s.id, where("date", ">=", period.from), where("date", "<=", period.to))),
  ]);
  const prev = before.debit - before.credit;
  return { ...s, prev, debit: inside.debit, credit: inside.credit, final: prev + inside.debit - inside.credit };
}

export function balancesFor(suppliers: SupplierRef[], period: Period): Promise<SupplierBalance[]> {
  return Promise.all(suppliers.map((s) => supplierBalance(s, period)));
}

/** الرصيد الافتتاحي لكشف يبدأ من تاريخ (مجموع ما قبله). */
export async function openingBalance(supplierId: string, from: string | null): Promise<number> {
  if (!from) return 0;
  const s = await sums(entriesOf(supplierId, where("date", "<", from)));
  return s.debit - s.credit;
}

/** حركات المورد للفترة (أو كلها) مرتبة من الأقدم، بمستمع مباشر. */
export function watchStatement(
  supplierId: string,
  period: Period | null,
  onData: (entries: LedgerEntry[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  const range = period ? [where("date", ">=", period.from), where("date", "<=", period.to)] : [];
  return onSnapshot(
    entriesOf(supplierId, ...range, orderBy("date"), orderBy(documentId())),
    (snap) => onData(snap.docs.map((d) => parseEntry(d.id, d.data()))),
    onError,
  );
}

export interface ReviewCounts {
  total: number;
  dates: number;
  duplicates: number;
  untyped: number;
}

/** عدّادات مركز المراجعة للمالك والإدارة (من أسباب التعديل اليدوي غير المحلولة). */
export async function reviewCounts(): Promise<ReviewCounts> {
  const { db } = firebase();
  const snap = await getDocs(query(collection(db, "migrationIssues"), where("resolved", "==", false)));
  const c: ReviewCounts = { total: snap.size, dates: 0, duplicates: 0, untyped: 0 };
  for (const d of snap.docs) {
    const codes = ((d.get("issues") as { code?: string }[] | undefined) ?? []).map((i) => i.code ?? "");
    if (codes.some((x) => x === "known_swapped_day_month" || x === "future_date")) c.dates++;
    if (codes.some((x) => x === "duplicate_ref" || x === "known_duplicate_of_row_291")) c.duplicates++;
    if (codes.includes("untyped")) c.untyped++;
  }
  return c;
}

export interface LedgerStats {
  entries: number;
  inv: number;
  misc: number;
  untyped: number;
}

/** محتوى الدفتر (للمالك والإدارة): أعداد بتجميعات count(). */
export async function ledgerStats(): Promise<LedgerStats> {
  const { db } = firebase();
  const base = collection(db, "entries");
  const count = async (...c: QueryConstraint[]) =>
    (await getCountFromServer(query(base, where("deleted", "==", false), ...c))).data().count;
  const [entries, inv, misc, untyped] = await Promise.all([
    count(),
    count(where("kind", "==", "inv")),
    count(where("kind", "==", "misc")),
    count(where("kind", "==", "untyped")),
  ]);
  return { entries, inv, misc, untyped };
}
