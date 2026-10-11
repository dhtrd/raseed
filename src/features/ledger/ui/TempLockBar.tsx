import { Link, useLocation } from "react-router";
import { formatDate } from "../../../shared/fields/core/date";
import type { LockState } from "../core/lock";
import { watchLock } from "../data/lockRepo";
import { useKeyedWatch } from "./useLedgerData";
import s from "./TempLockBar.module.css";

/**
 * شريط «القفل مفتوح مؤقتاً» أعلى كل الشاشات للمالك (DECISIONS 2026-10-11، الخيار ب):
 * لا إعادة تلقائية من الخادم في خطة Spark، فيبقى ظاهراً حتى يعيد المالك القفل.
 */
export function TempLockBar({ enabled }: { enabled: boolean }) {
  const lock = useKeyedWatch<LockState>(enabled ? "lock" : null, watchLock, "قراءة تاريخ الإقفال");
  // شاشة القفل نفسها تعرض الحالة وزر الإعادة
  const onLockPage = useLocation().pathname.endsWith("/lock");
  if (onLockPage || lock.status !== "ready" || !lock.data.tempFrom) return null;
  return (
    <div className={s.bar} role="status">
      <p>
        <b>القفل مفتوح مؤقتاً:</b> كان مقفلاً حتى{" "}
        <span className="num">{formatDate(lock.data.tempFrom)}</span>، والآن حتى{" "}
        <span className="num">{lock.data.lockedThrough ? formatDate(lock.data.lockedThrough) : "—"}</span>.
        أعده بعد انتهاء التصحيح.
      </p>
      <Link className={s.go} to="/lock">
        إعادة القفل
      </Link>
    </div>
  );
}
