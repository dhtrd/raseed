/**
 * مصادر تنبيهات النظام للمالك والإدارة: حالة النسخ الاحتياطي (مستند يكتبه سير GitHub Actions)،
 * وعدد ملاحظات المراجعة المفتوحة (تجميع count بقراءة واحدة).
 */
import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  query,
  Timestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import type { BackupState } from "../core/alerts";

export function watchBackup(onData: (b: BackupState) => void, onError: (e: Error) => void): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    doc(db, "settings", "backup"),
    (s) => {
      const at = s.get("lastRunAt") as unknown;
      const st = s.get("lastStatus") as unknown;
      onData({
        exists: s.exists(),
        lastRunAt: at instanceof Timestamp ? at.toMillis() : null,
        lastStatus: st === "ok" || st === "failed" ? st : null,
        lastError: typeof s.get("lastError") === "string" ? (s.get("lastError") as string) : "",
      });
    },
    onError,
  );
}

export async function countOpenReview(): Promise<number> {
  const { db } = firebase();
  const snap = await getCountFromServer(query(collection(db, "migrationIssues"), where("resolved", "==", false)));
  return snap.data().count;
}
