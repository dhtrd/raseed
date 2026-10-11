import { useMemo, useState } from "react";
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Link } from "react-router";
import { useKeyedLoad, useKeyedWatch } from "../../ledger/ui/useLedgerData";
import type { LockState } from "../../ledger/core/lock";
import { watchLock } from "../../ledger/data/lockRepo";
import type { UserProfile } from "../../users/core/users";
import { buildAlerts, unseen, type BackupState } from "../core/alerts";
import { countOpenReview, watchBackup } from "../data/alertsRepo";
import s from "./AlertCenter.module.css";

const KEY = "raseed.alerts.seen";

function readSeen(): Set<string> {
  try {
    const v = window.localStorage.getItem(KEY);
    return new Set(v ? (JSON.parse(v) as string[]) : []);
  } catch {
    return new Set(); // تخزين محجوب: يبقى العدّاد ظاهراً فقط
  }
}

/**
 * جرس مركز الإشعارات في الرأس (الخيار ج المعتمد): للمالك والإدارة. العدّاد الأحمر لما لم يُرَ؛
 * فتح المركز يعلّم الحالي «مقروءاً» على هذا الجهاز، وأي تغيّر في الحالة يعيده جديداً.
 */
export function AlertCenter({ profile }: { profile: UserProfile }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(readSeen);
  const [refresh, setRefresh] = useState(0);
  // وقت المقارنة لتأخر النسخ الاحتياطي: عند التحميل وكل فتح للمركز
  const [now, setNow] = useState(() => Date.now());
  const lock = useKeyedWatch<LockState>("lock", watchLock, "قراءة تاريخ الإقفال");
  const backup = useKeyedWatch<BackupState>("backup", watchBackup, "قراءة حالة النسخ الاحتياطي");
  const review = useKeyedLoad<number>(`review.${refresh}`, countOpenReview, "عدّ ملاحظات المراجعة", "review");

  const alerts = useMemo(
    () =>
      buildAlerts({
        isOwner: profile.role === "owner",
        lock: lock.status === "ready" ? lock.data : null,
        reviewOpen: review.status === "ready" ? review.data : null,
        backup: backup.status === "ready" ? backup.data : null,
        now,
      }),
    [profile.role, lock, review, backup, now],
  );
  // أثناء فتح المركز كل ما فيه مقروء، ويُحفظ ذلك عند الإغلاق (ولو وصل عدّ جديد وهو مفتوح)
  const fresh = open ? 0 : unseen(alerts, seen);
  const close = () => {
    const next = new Set([...seen, ...alerts.map((a) => a.sig)]);
    setSeen(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // تفضيل عرض فقط
    }
    setOpen(false);
  };
  const failed = [lock, backup, review].filter((x) => x.status === "error").length;

  const show = () => {
    setOpen(true);
    setRefresh((n) => n + 1);
    setNow(Date.now());
  };

  return (
    <>
      <button
        type="button"
        className={s.bell}
        aria-label={fresh ? `الإشعارات (${fresh} جديدة)` : "الإشعارات"}
        onClick={show}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={s.ic}>
          <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />
        </svg>
        {fresh ? <span className={`num ${s.badge}`}>{fresh}</span> : null}
      </button>
      <ModalOverlay
        className={s.overlay}
        isOpen={open}
        isDismissable
        onOpenChange={(v) => (v ? setOpen(true) : close())}
      >
        <Modal className={s.modal}>
          <AriaDialog className={s.dialog} aria-label="مركز الإشعارات">
            <div className={s.head}>
              <Heading slot="title" className={s.title}>
                الإشعارات
              </Heading>
              <button
                type="button"
                className={s.close}
                onClick={() => setOpen(false)}
                aria-label="إغلاق الإشعارات"
              >
                <span aria-hidden="true">×</span> إغلاق
              </button>
            </div>
            {alerts.length ? (
              <ul className={s.list}>
                {alerts.map((a) => (
                  <li key={a.sig} className={`${s.item} ${s[a.tone]}`}>
                    <b>{a.title}</b>
                    <span>{a.text}</span>
                    {a.href ? (
                      <Link to={a.href} className={s.go} onClick={close}>
                        فتح
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.empty}>لا تنبيهات الآن. كل شيء على ما يرام.</p>
            )}
            {failed ? (
              <p className={s.err} role="alert">
                تعذّر قراءة بعض المصادر ({failed})؛ قد تنقص القائمة. أعد فتحها بعد قليل.
              </p>
            ) : null}
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
