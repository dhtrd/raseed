import { useEffect, useState } from "react";
import { formatDate, todayInRiyadh } from "../../../shared/fields/core/date";
import { Banner } from "../../../shared/ui/Banner";
import { EmptyLedger, LoadingLedger } from "../../../shared/ui/LedgerState";
import { BACKUP_STALE_MS, type BackupState } from "../../alerts/core/alerts";
import { watchBackup } from "../../alerts/data/alertsRepo";
import { useKeyedWatch } from "../../ledger/ui/useLedgerData";
import {
  buildStrip,
  formatBytes,
  formatDuration,
  isPermanentFile,
  nextRunLabel,
  type BackupRun,
  type StripDay,
} from "../core/backupRuns";
import { watchRuns } from "../data/backupRepo";
import l from "../../ledger/ui/Ledger.module.css";
import s from "./Backup.module.css";

const ACTIONS_URL = "https://github.com/dhtrd/raseed/actions/workflows/backup.yml";
const STATUS_TEXT = { ok: "نجحت", failed: "فشلت", none: "لم تعمل" } as const;

const timeOf = (ms: number | null) =>
  ms === null
    ? "—"
    : new Date(ms).toLocaleTimeString("en-GB", {
        timeZone: "Asia/Riyadh",
        hour: "2-digit",
        minute: "2-digit",
      });

/**
 * متابعة النسخ الاحتياطي — الخيار «ب. الشريط الزمني» (DECISIONS 2026-10-12): بطاقة الحالة، وشريط آخر 30 يوماً
 * (يوم لكل مربع)، وتفاصيل اليوم المختار، والملفات الموجودة في Dropbox. للمالك والإدارة، قراءة فقط.
 */
export function BackupPage() {
  const runs = useKeyedWatch<BackupRun[]>("backupRuns", watchRuns, "قراءة سجل النسخ");
  const backup = useKeyedWatch<BackupState>("backup", watchBackup, "قراءة حالة النسخ الاحتياطي");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const today = todayInRiyadh(new Date(now));
  const [picked, setPicked] = useState<string | null>(null);

  const error = runs.status === "error" ? runs.message : backup.status === "error" ? backup.message : null;
  const loading = !error && (runs.status === "loading" || backup.status === "loading");
  const list = runs.status === "ready" ? runs.data : [];
  const strip = buildStrip(list, today);
  const latest = list[0] ?? null;
  const lastOk = list.find((r) => r.status === "ok") ?? null;
  const sel = strip.find((d) => d.day === (picked ?? latest?.day ?? today)) ?? strip[strip.length - 1];
  const okCount = strip.filter((d) => d.status === "ok").length;

  return (
    <div className={`${l.sheet} ${s.sheet}`}>
      <main className={l.main} id="main">
        <div className={l.pageHead}>
          <div>
            <h1 className={l.h1}>النسخ الاحتياطي</h1>
            <p className={l.sub}>
              يومياً 11:30 بتوقيت الرياض إلى Dropbox · الاحتفاظ 30 يوماً + أول نسخة من كل شهر · للقراءة فقط
            </p>
          </div>
        </div>

        {error ? <Banner tone="err">{error}</Banner> : null}
        {loading ? <LoadingLedger label="جارٍ تحميل سجل النسخ…" /> : null}

        {!loading && !error && backup.status === "ready" ? (
          <StatusCard b={backup.data} latest={latest} now={now} ranToday={latest?.day === today} />
        ) : null}

        {!loading && !error && list.length === 0 ? (
          <EmptyLedger
            title="لم يُسجَّل أي تشغيل بعد"
            actions={
              <a className={l.linkBtn} href={ACTIONS_URL} target="_blank" rel="noopener noreferrer">
                فتح سير النسخ في GitHub ↗
              </a>
            }
          >
            يظهر هنا كل تشغيل يومي بعد أن يعمل سير النسخ أول مرة بأسراره كاملة (docs/backup.md).
          </EmptyLedger>
        ) : null}

        {!loading && !error && list.length > 0 && sel ? (
          <>
            <section className={s.strip} aria-labelledby="strip-h">
              <h2 id="strip-h" className={s.h2}>
                آخر 30 يوماً{" "}
                <span className={s.count}>
                  · نجحت <span className="num">{okCount}</span>
                </span>
              </h2>
              <div className={s.days} role="group" aria-label="أيام النسخ">
                {strip.map((d) => (
                  <button
                    key={d.day}
                    type="button"
                    className={`${s.day} ${s[d.status]} ${d.monthKept ? s.month : ""}`}
                    aria-pressed={d.day === sel.day}
                    aria-label={`${formatDate(d.day)}: ${STATUS_TEXT[d.status]}${d.monthKept ? "، نسخة الشهر الدائمة" : ""}`}
                    title={formatDate(d.day)}
                    onClick={() => setPicked(d.day)}
                  />
                ))}
              </div>
              <p className={s.legend}>
                <span>
                  <i className={s.ok} /> نجحت
                </span>
                <span>
                  <i className={s.failed} /> فشلت
                </span>
                <span>
                  <i className={s.none} /> لم تعمل
                </span>
                <span>
                  <i className={s.month} /> نسخة الشهر الدائمة
                </span>
                <span>الأقدم في اليمين، والأحدث في اليسار</span>
              </p>
            </section>
            <DayDetail d={sel} />
          </>
        ) : null}
      </main>

      <aside className={l.side} aria-label="ملفات النسخ">
        <section aria-labelledby="files-h">
          <h2 id="files-h">الملفات في Dropbox الآن</h2>
          {lastOk && lastOk.files.length ? (
            <>
              <p>كما سجّلها آخر تشغيل ناجح ({formatDate(lastOk.day)}). التطبيق لا يتصل بـ Dropbox مباشرة.</p>
              <ul className={s.files}>
                {lastOk.files.map((f) => (
                  <li key={f}>
                    <span className="num">{f}</span>
                    {isPermanentFile(f, strip) ? <span className={s.keep}>دائمة</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>لا قائمة بعد؛ تظهر بعد أول تشغيل ناجح.</p>
          )}
        </section>
        <section aria-labelledby="run-h">
          <h2 id="run-h">تشغيل يدوي</h2>
          <p>افتح صفحة السير في GitHub ثم اضغط Run workflow. يحتاج حساباً في GitHub بصلاحية على المستودع.</p>
          <a className={l.linkBtn} href={ACTIONS_URL} target="_blank" rel="noopener noreferrer">
            تشغيل الآن ↗
          </a>
        </section>
      </aside>
    </div>
  );
}

function StatusCard(p: { b: BackupState; latest: BackupRun | null; now: number; ranToday: boolean }) {
  const { b } = p;
  const stale = b.lastRunAt !== null && p.now - b.lastRunAt > BACKUP_STALE_MS;
  const tone = !b.exists ? "info" : b.lastStatus === "failed" ? "err" : stale ? "warn" : "ok";
  const title = !b.exists
    ? "لم يُفعَّل بعد"
    : b.lastStatus === "failed"
      ? "فشلت آخر نسخة"
      : stale
        ? "فاتت نسخة: لا تشغيل منذ أكثر من 26 ساعة"
        : "آخر نسخة سليمة";
  return (
    <section className={`${s.status} ${s[tone]}`} aria-label="حالة النسخ">
      <span className={s.dot} aria-hidden="true">
        {tone === "ok" ? "✓" : tone === "info" ? "i" : "!"}
      </span>
      <div className={s.statusText}>
        <b>{title}</b>
        <p>
          {!b.exists ? (
            "لم يكتب سير النسخ أي حالة بعد. أكمل إعداد الأسرار ثم شغّله من GitHub."
          ) : b.lastStatus === "failed" ? (
            <span className={s.errText}>{b.lastError || "لم تُرفع النسخة إلى Dropbox."}</span>
          ) : (
            <>
              {p.latest ? formatDate(p.latest.day) : ""} الساعة{" "}
              <span className="num">{timeOf(b.lastRunAt)}</span> · الملفان في Dropbox
            </>
          )}
        </p>
      </div>
      <dl className={s.meta}>
        <div>
          <dt>النسخة القادمة</dt>
          <dd>{nextRunLabel(new Date(p.now), p.ranToday)}</dd>
        </div>
        <div>
          <dt>آخر تشغيل</dt>
          <dd className="num">{b.lastRunAt ? timeOf(b.lastRunAt) : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

function DayDetail({ d }: { d: StripDay }) {
  const r = d.run;
  return (
    <section className={s.detail} aria-labelledby="day-h">
      <h2 id="day-h" className={s.h2}>
        {formatDate(d.day)} <span className={`${s.tag} ${s[d.status]}`}>{STATUS_TEXT[d.status]}</span>
        {d.monthKept ? <span className={s.keep}>دائمة</span> : null}
      </h2>
      {r ? (
        <>
          <dl className={s.kv}>
            <dt>الوقت</dt>
            <dd className="num">{timeOf(r.at)}</dd>
            <dt>المدة</dt>
            <dd className="num">{formatDuration(r.durationMs)}</dd>
            <dt>الحجم</dt>
            <dd className="num">{formatBytes(r.bytes)}</dd>
            {r.authUsers !== null ? (
              <>
                <dt>حسابات الدخول</dt>
                <dd className="num">{r.authUsers}</dd>
              </>
            ) : null}
          </dl>
          {r.status === "failed" ? <p className={s.errText}>{r.error || "فشل بلا رسالة."}</p> : null}
          {Object.keys(r.counts).length ? (
            <ul className={s.counts} aria-label="أعداد المجموعات">
              {Object.entries(r.counts).map(([k, v]) => (
                <li key={k}>
                  <span className="num">{k}</span> <b className="num">{v.toLocaleString("en-US")}</b>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className={s.muted}>
          لم يعمل السير في هذا اليوم (تأخّر GitHub، أو توقفت المهام المجدولة، أو قبل التفعيل).
        </p>
      )}
    </section>
  );
}
