/**
 * النسخ الاحتياطي اليومي إلى Dropbox (DECISIONS 2026-10-11): منطق نقي بلا شبكة ولا Firestore.
 * - ترميز قيم Firestore إلى JSON وعكسه بلا فقد (الطوابع الزمنية بثوانيها ونانوثوانيها).
 * - أسماء الملفات بتاريخ الرياض، وسياسة الاحتفاظ (آخر 30 يوماً + أول نسخة من كل شهر).
 * - البيان (manifest) بأعداد كل مجموعة، ومقارنته بعد الاسترجاع.
 */

export const FORMAT = "raseed-backup";
export const VERSION = 1;
export const KEEP_DAYS = 30;

/** قيمة مُرمَّزة: كل ما يقبله JSON، والطابع الزمني بشكل {"__ts":[ثوانٍ، نانو]} */
export type Encoded = null | boolean | number | string | Encoded[] | { [k: string]: Encoded };

/** ما يكفي من Timestamp للترميز، كي لا يعتمد المنطق على firebase-admin */
export interface TsLike {
  seconds: number;
  nanoseconds: number;
  toMillis(): number;
}

const isTs = (v: object): v is TsLike =>
  typeof (v as TsLike).seconds === "number" &&
  typeof (v as TsLike).nanoseconds === "number" &&
  typeof (v as TsLike).toMillis === "function";

/** يرمّز قيمة من مستند Firestore؛ أي نوع غير معروف خطأ صريح لا فقد صامت. */
export function encodeValue(v: unknown, path: string): Encoded {
  if (v === null || typeof v === "boolean" || typeof v === "string") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`رقم غير منتهٍ في ${path}`);
    return v;
  }
  if (Array.isArray(v)) return v.map((x, i) => encodeValue(x, `${path}[${i}]`));
  if (typeof v === "object") {
    if (isTs(v)) return { __ts: [v.seconds, v.nanoseconds] };
    const proto = Object.getPrototypeOf(v) as unknown;
    if (proto !== Object.prototype && proto !== null)
      throw new Error(`نوع غير مدعوم في النسخة (${(v as object).constructor?.name ?? "?"}) في ${path}`);
    const out: { [k: string]: Encoded } = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "__ts") throw new Error(`اسم حقل محجوز __ts في ${path}`);
      out[k] = encodeValue(x, `${path}.${k}`);
    }
    return out;
  }
  throw new Error(`نوع غير مدعوم في النسخة (${typeof v}) في ${path}`);
}

/** يفك الترميز؛ `ts` يبني الطابع الزمني بالمكتبة المستعملة (firebase-admin في الاسترجاع). */
export function decodeValue<T>(v: Encoded, ts: (seconds: number, nanos: number) => T): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => decodeValue(x, ts));
  const t = v.__ts;
  if (Array.isArray(t) && Object.keys(v).length === 1) {
    const [s, n] = t;
    if (typeof s !== "number" || typeof n !== "number") throw new Error("طابع زمني تالف في النسخة");
    return ts(s, n);
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = decodeValue(x, ts);
  return out;
}

export interface AuthUserCopy {
  uid: string;
  email: string | null;
  disabled: boolean;
  claims: Record<string, Encoded> | null;
  createdAt: string | null;
}

export interface BackupDump {
  format: typeof FORMAT;
  version: typeof VERSION;
  projectId: string;
  /** وقت أخذ النسخة ISO بالتوقيت العالمي */
  takenAt: string;
  /** تاريخ النسخة بتوقيت الرياض YYYY-MM-DD */
  day: string;
  /** المجموعة ← (المعرّف ← المستند المرمَّز) */
  collections: Record<string, Record<string, { [k: string]: Encoded }>>;
  /** حسابات الدخول بلا كلمات مرور (null إن لم تُطلب) */
  authUsers: AuthUserCopy[] | null;
}

export interface Manifest {
  collections: Record<string, number>;
  authUsers: number | null;
}

export function manifestOf(d: Pick<BackupDump, "collections" | "authUsers">): Manifest {
  const collections: Record<string, number> = {};
  for (const [name, docs] of Object.entries(d.collections)) collections[name] = Object.keys(docs).length;
  return { collections, authUsers: d.authUsers ? d.authUsers.length : null };
}

/** الفروق بين بيانين (فارغة = مطابقة) */
export function compareManifests(expected: Manifest, actual: Manifest): string[] {
  const diffs: string[] = [];
  const names = new Set([...Object.keys(expected.collections), ...Object.keys(actual.collections)]);
  for (const n of [...names].sort()) {
    const a = expected.collections[n] ?? 0;
    const b = actual.collections[n] ?? 0;
    if (a !== b) diffs.push(`${n}: النسخة ${a} ← المسترجَع ${b}`);
  }
  if (expected.authUsers !== null && expected.authUsers !== actual.authUsers)
    diffs.push(`حسابات الدخول: النسخة ${expected.authUsers} ← المسترجَع ${actual.authUsers ?? 0}`);
  return diffs;
}

/** يتحقق من بنية ملف النسخة بعد فك التشفير قبل أي استرجاع */
export function parseDump(json: string): BackupDump {
  const d = JSON.parse(json) as Partial<BackupDump>;
  if (d.format !== FORMAT) throw new Error("الملف ليس نسخة «رصيد».");
  if (d.version !== VERSION)
    throw new Error(`إصدار النسخة ${String(d.version)} غير مدعوم (المدعوم ${VERSION}).`);
  if (!d.collections || typeof d.collections !== "object") throw new Error("النسخة بلا مجموعات.");
  if (typeof d.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.day)) throw new Error("تاريخ النسخة تالف.");
  return d as BackupDump;
}

const DAY_RE = /^raseed-(\d{4}-\d{2}-\d{2})\.(json\.gz\.enc|xlsx)$/;

export function fileNames(day: string): { data: string; sheet: string } {
  return { data: `raseed-${day}.json.gz.enc`, sheet: `raseed-${day}.xlsx` };
}

/** تاريخ النسخة من اسم الملف، أو null لأي ملف آخر (لا يُمس) */
export function dayOfFile(name: string): string | null {
  return DAY_RE.exec(name)?.[1] ?? null;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * الملفات التي تُحذف: نسخ أقدم من 30 يوماً، عدا أقدم نسخة في كل شهر فتبقى دائماً.
 * ما لا يطابق نمط الأسماء لا يُحذف أبداً.
 */
export function toPrune(names: string[], today: string): string[] {
  const days = [...new Set(names.map(dayOfFile).filter((d): d is string => d !== null))].sort();
  const firstOfMonth = new Set<string>();
  const seen = new Set<string>();
  for (const d of days) {
    const m = d.slice(0, 7);
    if (!seen.has(m)) {
      seen.add(m);
      firstOfMonth.add(d);
    }
  }
  return names.filter((n) => {
    const d = dayOfFile(n);
    return d !== null && daysBetween(d, today) > KEEP_DAYS && !firstOfMonth.has(d);
  });
}

/** تاريخ اليوم بتوقيت الرياض YYYY-MM-DD (نسخة Node من todayInRiyadh في الواجهة) */
export function riyadhDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** رسالة خطأ آمنة للعرض في الجرس وسجل التشغيل: سطر واحد قصير بلا رموز وصول */
export function safeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw
    .replace(/(sl\.|Bearer\s+)[A-Za-z0-9._-]+/g, "$1***")
    .replace(/[A-Za-z0-9_-]{40,}/g, "***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
