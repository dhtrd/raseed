/**
 * بيانات البحث العام (الاتجاه ب المعتمد، DECISIONS 2026-10-11): كل الحركات المرئية تُحمَّل مرة واحدة
 * عند أول بحث في الجلسة وتبقى في الذاكرة، ثم تُجلب الحركات المعدّلة بعد آخر تحميل فقط.
 * - المالك والإدارة: كل الحركات (والمحذوفة ناعماً بوسم «محذوف»)، والتحديث بـ updatedAt > آخر وقت.
 * - مدخل البيانات: حركات موردِيه غير المحذوفة فقط (القواعد تفرض ذلك)، وتُعاد قراءتها كاملة (قليلة).
 */
import { collection, getDocs, query, Timestamp, where, type DocumentData } from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import { isManager } from "../../users/core/users";
import type { UserProfile } from "../../users/core/users";
import { parseEntry } from "../core/ledger";
import type { SearchEntry } from "../core/search";

const IN_LIMIT = 30;

interface Cache {
  key: string;
  entries: Map<string, SearchEntry>;
  /** أحدث updatedAt رأيناه (للتحديث التدريجي) */
  since: Timestamp | null;
}
let cache: Cache | null = null;

function toEntry(id: string, d: DocumentData): SearchEntry {
  return { ...parseEntry(id, d), deleted: d.deleted === true };
}

function newest(a: Timestamp | null, d: DocumentData): Timestamp | null {
  const t = d.updatedAt instanceof Timestamp ? d.updatedAt : null;
  if (!t) return a;
  return !a || t.toMillis() > a.toMillis() ? t : a;
}

/** يعيد حركات البحث للمستخدم، من الذاكرة مع جلب المعدّل فقط إن أمكن. */
export async function loadSearchEntries(profile: UserProfile): Promise<{ entries: SearchEntry[]; reads: number }> {
  const { db } = firebase();
  const manager = isManager(profile.role);
  const key = `${profile.uid}|${profile.role}|${profile.assigned.join(",")}`;
  if (cache?.key !== key) cache = { key, entries: new Map(), since: null };
  const c = cache;
  let reads = 0;

  if (manager) {
    const q = c.since
      ? query(collection(db, "entries"), where("updatedAt", ">", c.since))
      : collection(db, "entries");
    const snap = await getDocs(q);
    reads = snap.size;
    for (const d of snap.docs) {
      c.entries.set(d.id, toEntry(d.id, d.data()));
      c.since = newest(c.since, d.data());
    }
  } else {
    const fresh = new Map<string, SearchEntry>();
    for (let i = 0; i < profile.assigned.length; i += IN_LIMIT) {
      const ids = profile.assigned.slice(i, i + IN_LIMIT);
      const snap = await getDocs(
        query(collection(db, "entries"), where("supplierId", "in", ids), where("deleted", "==", false)),
      );
      reads += snap.size;
      for (const d of snap.docs) fresh.set(d.id, toEntry(d.id, d.data()));
    }
    c.entries = fresh;
  }
  return { entries: [...c.entries.values()], reads };
}

/** يُستدعى عند الخروج كي لا تبقى بيانات مستخدم في ذاكرة الصفحة لغيره. */
export function clearSearchCache() {
  cache = null;
}
