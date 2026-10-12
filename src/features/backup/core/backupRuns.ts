/**
 * نافذة متابعة النسخ الاحتياطي — الخيار «ب. الشريط الزمني» (proposals/2026-10-11-backup-monitor.html،
 * DECISIONS 2026-10-12). منطق نقي: قراءة سجل التشغيل، وشريط آخر 30 يوماً، وموعد النسخة القادمة.
 */
import type { IsoDate } from "../../../shared/fields/core/date";

export const STRIP_DAYS = 30;

export interface BackupRun {
  day: IsoDate;
  /** وقت التشغيل بالمللي ثانية، أو null إن لم يصل بعد */
  at: number | null;
  status: "ok" | "failed";
  error: string;
  durationMs: number | null;
  bytes: number | null;
  counts: Record<string, number>;
  authUsers: number | null;
  files: string[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** يقرأ مستند `backupRuns/{day}` بأمان؛ ما لا يُفهم يُرفض (null) ولا يُعرض كنجاح */
export function parseRun(id: string, d: Record<string, unknown>, at: number | null): BackupRun | null {
  if (!DAY_RE.test(id)) return null;
  if (d.status !== "ok" && d.status !== "failed") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const counts: Record<string, number> = {};
  if (d.counts && typeof d.counts === "object")
    for (const [k, v] of Object.entries(d.counts as Record<string, unknown>))
      if (typeof v === "number") counts[k] = v;
  return {
    day: id,
    at,
    status: d.status,
    error: typeof d.error === "string" ? d.error : "",
    durationMs: num(d.durationMs),
    bytes: num(d.bytes),
    counts,
    authUsers: num(d.authUsers),
    files: Array.isArray(d.files) ? d.files.filter((f): f is string => typeof f === "string") : [],
  };
}

function shiftDay(day: IsoDate, delta: number): IsoDate {
  const t = Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface StripDay {
  day: IsoDate;
  status: "ok" | "failed" | "none";
  run: BackupRun | null;
  /** أول نسخة ناجحة في شهرها ضمن السجل: تبقى في Dropbox دائماً (سياسة الاحتفاظ) */
  monthKept: boolean;
}

/** آخر 30 يوماً من الأقدم إلى اليوم */
export function buildStrip(runs: BackupRun[], today: IsoDate, days = STRIP_DAYS): StripDay[] {
  const byDay = new Map(runs.map((r) => [r.day, r]));
  const firstOk = new Map<string, IsoDate>();
  for (const r of [...runs].sort((a, b) => a.day.localeCompare(b.day)))
    if (r.status === "ok" && !firstOk.has(r.day.slice(0, 7))) firstOk.set(r.day.slice(0, 7), r.day);
  const out: StripDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = shiftDay(today, -i);
    const run = byDay.get(day) ?? null;
    out.push({
      day,
      status: run ? run.status : "none",
      run,
      monthKept: run?.status === "ok" && firstOk.get(day.slice(0, 7)) === day,
    });
  }
  return out;
}

/** ساعة الرياض الآن (بالدقائق من منتصف الليل) */
function riyadhMinutes(now: Date): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** موعد النسخة القادمة: اليوم أو غداً 11:30 بتوقيت الرياض (ما لم تكن نسخة اليوم قد تمت) */
export function nextRunLabel(now: Date, ranToday: boolean): string {
  return !ranToday && riyadhMinutes(now) < 11 * 60 + 30 ? "اليوم 11:30" : "غداً 11:30";
}

export function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024)).toLocaleString("en-US")} ك.ب`;
  return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 60_000
    ? `${Math.round(ms / 1000)} ث`
    : `${Math.floor(ms / 60_000)} د ${Math.round((ms % 60_000) / 1000)} ث`;
}

/** ملفات Dropbox المحفوظة دائماً (أول نسخة في الشهر) من قائمة الملفات */
export function isPermanentFile(name: string, kept: StripDay[]): boolean {
  const m = /^raseed-(\d{4}-\d{2}-\d{2})\./.exec(name);
  if (!m?.[1]) return false;
  return (
    kept.some((d) => d.monthKept && d.day === m[1]) ||
    Date.parse(`${m[1]}T00:00:00Z`) < Date.parse(`${kept[0]?.day ?? m[1]}T00:00:00Z`)
  );
}
