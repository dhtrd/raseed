/** قراءة سجل تشغيلات النسخ (يكتبه سير GitHub Actions وحده؛ القواعد تمنع الكتابة من التطبيق). */
import { collection, limit, onSnapshot, orderBy, query, Timestamp, type Unsubscribe } from "firebase/firestore";
import { firebase } from "../../../shared/firebase/client";
import { parseRun, STRIP_DAYS, type BackupRun } from "../core/backupRuns";

export function watchRuns(onData: (runs: BackupRun[]) => void, onError: (e: Error) => void): Unsubscribe {
  const { db } = firebase();
  return onSnapshot(
    query(collection(db, "backupRuns"), orderBy("day", "desc"), limit(STRIP_DAYS + 5)),
    (snap) => {
      const runs: BackupRun[] = [];
      for (const d of snap.docs) {
        const at = d.get("at") as unknown;
        const r = parseRun(d.id, d.data(), at instanceof Timestamp ? at.toMillis() : null);
        if (r) runs.push(r);
        else console.error("سجل تشغيل نسخ غير مفهوم، تُرك خارج الشريط", d.id);
      }
      onData(runs);
    },
    onError,
  );
}
