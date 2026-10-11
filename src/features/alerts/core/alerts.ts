/**
 * مركز الإشعارات (الخيار ج المعتمد في proposals/2026-10-11-notifications.html): تنبيهات النظام الدائمة
 * للمالك والإدارة من حالة البيانات. منطق نقي بلا واجهة ولا Firestore.
 */
import { formatDate, type IsoDate } from "../../../shared/fields/core/date";

export interface BackupState {
  exists: boolean;
  /** آخر تشغيل بالمللي ثانية */
  lastRunAt: number | null;
  lastStatus: "ok" | "failed" | null;
  lastError: string;
}

export interface AlertInput {
  isOwner: boolean;
  lock: { lockedThrough: IsoDate | null; tempFrom: IsoDate | null } | null;
  reviewOpen: number | null;
  backup: BackupState | null;
  now: number;
}

export interface SystemAlert {
  /** بصمة الحالة: تتغير إن تغيّر التنبيه، فيعود «جديداً» */
  sig: string;
  tone: "err" | "warn" | "info";
  title: string;
  text: string;
  href: string | null;
}

/** النسخ يومي 11:30 الرياض؛ أكثر من 26 ساعة بلا تشغيل يعني أن نسخة فاتت */
export const BACKUP_STALE_MS = 26 * 3600 * 1000;

function dayOf(ms: number): string {
  return formatDate(new Date(ms + 3 * 3600 * 1000).toISOString().slice(0, 10));
}

export function buildAlerts(a: AlertInput): SystemAlert[] {
  const out: SystemAlert[] = [];
  const b = a.backup;
  if (b && !b.exists) {
    out.push({
      sig: "backup-none",
      tone: "info",
      title: "النسخ الاحتياطي اليومي لم يُفعَّل بعد",
      text: "لم تُسجَّل أي نسخة إلى Dropbox بعد. تبدأ تلقائياً 11:30 بتوقيت الرياض بعد إضافة أسرار Dropbox وعبارة السر في GitHub.",
      href: null,
    });
  } else if (b && b.lastStatus === "failed") {
    out.push({
      sig: `backup-fail-${b.lastRunAt ?? 0}`,
      tone: "err",
      title: "فشل النسخ الاحتياطي اليومي",
      text: `${b.lastRunAt ? `محاولة ${dayOf(b.lastRunAt)}. ` : ""}${b.lastError || "لم تُرفع النسخة إلى Dropbox."}`,
      href: null,
    });
  } else if (b && b.lastRunAt !== null && a.now - b.lastRunAt > BACKUP_STALE_MS) {
    out.push({
      sig: `backup-stale-${b.lastRunAt}`,
      tone: "warn",
      title: "لم تُسجَّل نسخة احتياطية حديثة",
      text: `آخر نسخة ناجحة ${dayOf(b.lastRunAt)}.`,
      href: null,
    });
  }
  if (a.lock?.tempFrom) {
    out.push({
      sig: `lock-${a.lock.tempFrom}-${a.lock.lockedThrough ?? ""}`,
      tone: "warn",
      title: "الفترة المقفلة مفتوحة مؤقتاً",
      text: `كانت مقفلة حتى ${formatDate(a.lock.tempFrom)}، والآن حتى ${
        a.lock.lockedThrough ? formatDate(a.lock.lockedThrough) : "—"
      }.${a.isOwner ? " أعد القفل بعد التصحيح." : ""}`,
      href: a.isOwner ? "/lock" : null,
    });
  }
  if (a.reviewOpen) {
    out.push({
      sig: `review-${a.reviewOpen}`,
      tone: "info",
      title: `${a.reviewOpen.toLocaleString("en-US")} ملاحظة مفتوحة في مركز المراجعة`,
      text: "حركات تحتاج تعديلاً يدوياً أو تأكيداً.",
      href: "/review",
    });
  }
  return out;
}

export const unseen = (alerts: SystemAlert[], seen: ReadonlySet<string>) =>
  alerts.filter((x) => !seen.has(x.sig)).length;
