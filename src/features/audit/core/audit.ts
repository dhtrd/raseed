/**
 * سجل التدقيق (الخيار أ المعتمد في proposals/2026-10-11-audit.html، DECISIONS 2026-10-11):
 * تحويل سجلات auditLog إلى جمل عربية مقروءة و«قبل ← بعد»، وتجميعها باليوم بتوقيت الرياض.
 * منطق نقي بلا واجهة ولا Firestore.
 */
import { formatDate, type IsoDate } from "../../../shared/fields/core/date";
import { formatMoney } from "../../ledger/core/ledger";

export interface AuditRecord {
  id: string;
  actor: string;
  /** وقت التسجيل بالمللي ثانية (null إن لم يصل من الخادم) */
  at: number | null;
  action: string;
  entity: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
}

export type AuditKind = "all" | "entries" | "odoo" | "suppliers" | "users" | "settings" | "review";

export const AUDIT_KINDS: { value: AuditKind; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "entries", label: "الحركات" },
  { value: "odoo", label: "Odoo" },
  { value: "suppliers", label: "الموردون" },
  { value: "users", label: "المستخدمون" },
  { value: "settings", label: "الإعدادات والقفل" },
  { value: "review", label: "المراجعة" },
];

export const ODOO_ACTIONS = ["odooEntered", "odooReverted", "odooEnteredLocked", "odooRevertedLocked"];

const VERB: Record<string, string> = {
  create: "أضاف",
  update: "عدّل",
  delete: "حذف",
  restore: "استرجع",
  odooEntered: "حدّد «دخلت Odoo» لـ",
  odooReverted: "أرجع إلى «لم تدخل» ",
  odooEnteredLocked: "حدّد «دخلت Odoo» باستثناء الفترة المقفلة لـ",
  odooRevertedLocked: "أرجع إلى «لم تدخل» باستثناء الفترة المقفلة ",
  rename: "غيّر اسم",
  archive: "أرشف",
  unarchive: "أعاد تنشيط",
  createUser: "أنشأ حساب",
  changeRole: "عدّل حساب",
  activateUser: "فعّل حساب",
  deactivateUser: "أوقف حساب",
  assignSuppliers: "عدّل إسناد الموردين لـ",
  passwordChanged: "غيّر كلمة المرور لحسابه",
  passwordReset: "أعاد تعيين كلمة المرور لحسابه برابط البريد",
  renameRoles: "غيّر مسميات الأدوار",
  setIdleMinutes: "غيّر مدة الخمول",
  lockSet: "غيّر تاريخ الإقفال",
  lockTempOpen: "فتح الفترة المقفلة مؤقتاً",
  lockRestore: "أعاد القفل",
  reviewFixed: "أغلق ملاحظة المراجعة «تمت المراجعة» لـ",
  reviewIgnored: "تجاهل ملاحظة المراجعة لـ",
  reviewReopened: "أعاد فتح ملاحظة المراجعة لـ",
  reviewDeleted: "أغلق ملاحظة المراجعة بالحذف لـ",
};

/** لون النقطة: الحذف أحمر، والقفل والاستثناء كهرماني */
export function toneOf(action: string): "del" | "lock" | "normal" {
  if (action === "delete" || action === "deactivateUser" || action === "archive") return "del";
  if (action.startsWith("lock") || action.endsWith("Locked")) return "lock";
  return "normal";
}

const FIELD: Record<string, string> = {
  date: "التاريخ",
  kind: "النوع",
  mainRef: "المرجع",
  refNo: "الرقم المرجعي",
  voucher: "السند",
  details: "البيان",
  note: "الملاحظة",
  debit: "مدين",
  credit: "دائن",
  reversed: "عكس الاتجاه",
  deleted: "محذوفة",
  odooEntered: "حالة Odoo",
  name: "الاسم",
  status: "الحالة",
  displayName: "الاسم الظاهر",
  login: "البريد",
  role: "الدور",
  active: "الحساب",
  assigned: "الموردون المسندون",
  idleMinutes: "مدة الخمول (دقيقة)",
  lockedThrough: "مقفل حتى",
  tempFrom: "القفل السابق",
  resolved: "محلولة",
  resolution: "الحل",
  owner: "مسمى المالك",
  admin: "مسمى الإدارة",
  entry: "مسمى مدخل البيانات",
};

const KIND_AR: Record<string, string> = { inv: "فاتورة", misc: "قيد", note: "ملاحظة", untyped: "بلا نوع" };
const ROLE_AR: Record<string, string> = { owner: "المالك", admin: "الإدارة", entry: "مدخل البيانات" };
const isIso = (v: unknown): v is IsoDate => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** قيمة حقل للعرض */
export function showValue(field: string, v: unknown, supplierName?: (id: string) => string): string {
  if (v === null || v === undefined || v === "") return "—";
  if ((field === "debit" || field === "credit") && typeof v === "number") return formatMoney(v);
  if (isIso(v)) return formatDate(v);
  if (field === "kind" && typeof v === "string") return KIND_AR[v] ?? v;
  if (field === "role" && typeof v === "string") return ROLE_AR[v] ?? v;
  if (field === "status") return v === "archived" ? "مؤرشف" : "نشط";
  if (field === "odooEntered") return v ? "دخلت" : "لم تدخل";
  if (field === "active") return v ? "فعّال" : "موقوف";
  if (field === "assigned" && Array.isArray(v))
    return v.length
      ? v.map((x) => (supplierName ? supplierName(String(x)) : String(x))).join("، ")
      : "لا أحد";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (Array.isArray(v)) return v.join("، ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export interface DiffLine {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** «قبل ← بعد» للحقول التي تغيّرت فعلاً */
export function diffOf(r: AuditRecord, supplierName?: (id: string) => string): DiffLine[] {
  if (!r.before || !r.after) return [];
  const keys = [...new Set([...Object.keys(r.before), ...Object.keys(r.after)])];
  const out: DiffLine[] = [];
  for (const k of keys) {
    const from = showValue(k, r.before[k], supplierName);
    const to = showValue(k, r.after[k], supplierName);
    if (from !== to) out.push({ field: k, label: FIELD[k] ?? k, from, to });
  }
  return out;
}

export interface Names {
  user: (uid: string) => string;
  supplier: (id: string) => string;
  /** وصف الحركة المختصر إن عُرفت (الرقم المرجعي · المورد) */
  entry: (id: string) => string | null;
}

/** الجملة: الفاعل، والفعل، والهدف */
export function describe(r: AuditRecord, n: Names): { who: string; verb: string; target: string } {
  const who = n.user(r.actor);
  const verb = VERB[r.action] ?? r.action;
  let target = "";
  if (r.entity === "entries" || r.entity === "migrationIssues") {
    const known = n.entry(r.entityId);
    const kind = r.after?.kind ?? r.before?.kind;
    const refNo = r.after?.refNo ?? r.before?.refNo;
    const label = r.action.startsWith("odoo") ? "الفاتورة" : "الحركة";
    target = known
      ? `${label} ${known}`
      : `${typeof kind === "string" ? (KIND_AR[kind] ?? "حركة") : "حركة"}${typeof refNo === "string" ? ` ${refNo}` : ""}`;
  } else if (r.entity === "suppliers") target = `المورد «${n.supplier(r.entityId)}»`;
  else if (r.entity === "users")
    target = r.action === "passwordChanged" || r.action === "passwordReset" ? "" : `«${n.user(r.entityId)}»`;
  return { who, verb, target };
}

/** ميلي ثانية → تاريخ ووقت بتوقيت الرياض (UTC+3 ثابت، بلا توقيت صيفي) */
export function riyadhParts(ms: number): { day: IsoDate; time: string } {
  const d = new Date(ms + 3 * 3600 * 1000);
  const day = d.toISOString().slice(0, 10);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { day, time: `${h12}:${m} ${h < 12 ? "ص" : "م"}` };
}

function prevDay(iso: IsoDate): IsoDate {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface DayGroup {
  key: string;
  label: string;
  items: { r: AuditRecord; time: string }[];
}

/** تجميع باليوم (السجلات مرتبة من الأحدث): «اليوم» و«أمس» ثم التاريخ. */
export function groupByDay(records: AuditRecord[], today: IsoDate): DayGroup[] {
  const out: DayGroup[] = [];
  const yesterday = prevDay(today);
  for (const r of records) {
    const p = r.at === null ? { day: today, time: "الآن" } : riyadhParts(r.at);
    const label =
      p.day === today
        ? `اليوم ${formatDate(p.day)}`
        : p.day === yesterday
          ? `أمس ${formatDate(p.day)}`
          : formatDate(p.day);
    const last = out[out.length - 1];
    if (last && last.key === p.day) last.items.push({ r, time: p.time });
    else out.push({ key: p.day, label, items: [{ r, time: p.time }] });
  }
  return out;
}
