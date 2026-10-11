import { identifierToEmail } from "../../../shared/fields/core/password";

export type Role = "owner" | "admin" | "entry";
export type RoleNames = Record<Role, string>;

export const DEFAULT_ROLE_NAMES: RoleNames = { owner: "المالك", admin: "الإدارة", entry: "مدخل البيانات" };
export const ROLE_NAME_MAX = 40;
export const DISPLAY_NAME_MAX = 80;

export interface UserProfile {
  uid: string;
  displayName: string;
  login: string;
  role: Role;
  assigned: string[];
  active: boolean;
  mustChangePassword: boolean;
  updatedAt: Date | null;
}

/** يقرأ مستند users بأمان: أي حقل شاذ يُرفض بدل أن يُفترض. */
export function parseUser(uid: string, d: Record<string, unknown> | undefined): UserProfile | null {
  if (!d) return null;
  const role = d.role;
  if (role !== "owner" && role !== "admin" && role !== "entry") return null;
  if (typeof d.displayName !== "string" || typeof d.login !== "string" || typeof d.active !== "boolean")
    return null;
  const assigned = Array.isArray(d.assigned)
    ? d.assigned.filter((x): x is string => typeof x === "string")
    : [];
  const ts = d.updatedAt as { toDate?: () => Date } | undefined;
  return {
    uid,
    displayName: d.displayName,
    login: d.login,
    role,
    assigned,
    active: d.active,
    mustChangePassword: d.mustChangePassword === true,
    updatedAt: ts && typeof ts.toDate === "function" ? ts.toDate() : null,
  };
}

export function parseRoleNames(d: Record<string, unknown> | undefined): RoleNames {
  const pick = (k: Role) => {
    const v = d?.[k];
    return typeof v === "string" && v.trim() ? v.trim() : DEFAULT_ROLE_NAMES[k];
  };
  return { owner: pick("owner"), admin: pick("admin"), entry: pick("entry") };
}

export function validateRoleName(v: string): string | null {
  const t = v.trim();
  if (!t) return "المسمى لا يكون فارغاً.";
  if (t.length > ROLE_NAME_MAX) return `المسمى حتى ${ROLE_NAME_MAX} حرفاً.`;
  return null;
}

export function validateDisplayName(v: string): string | null {
  const t = v.trim();
  if (!t) return "اكتب الاسم الظاهر.";
  if (t.length > DISPLAY_NAME_MAX) return `الاسم حتى ${DISPLAY_NAME_MAX} حرفاً.`;
  return null;
}

export function isEmailLogin(login: string): boolean {
  return login.includes("@");
}

/** الدخول الجديد: صيغة صحيحة وغير مستخدم لحساب آخر (المقارنة بعد التحويل إلى بريد). */
export function validateNewLogin(
  v: string,
  existing: string[],
): { ok: true; login: string; email: string } | { ok: false; error: string } {
  const r = identifierToEmail(v);
  if (!r.ok) return r;
  const taken = existing.some((l) => {
    const e = identifierToEmail(l);
    return e.ok && e.email === r.email;
  });
  if (taken) return { ok: false, error: "هذا الدخول مستخدم لحساب آخر." };
  return { ok: true, login: v.trim().toLowerCase(), email: r.email };
}

export type Viewer = Pick<UserProfile, "uid" | "role">;

export function isManager(role: Role): boolean {
  return role === "owner" || role === "admin";
}

/** هل يعدّل المشاهد هذا المستخدم؟ الإدارة تدير الجميع عدا المالك (SPEC، DECISIONS 2026-10-10). */
export function canEditUser(viewer: Viewer, target: UserProfile): boolean {
  if (!isManager(viewer.role)) return false;
  if (target.role === "owner") return viewer.role === "owner" && viewer.uid === target.uid;
  return true;
}

/** تغيير الدور أو الإيقاف ممنوع على النفس، كي لا يقفل أحد نفسه خارج النظام. */
export function canChangeRoleOrStatus(viewer: Viewer, target: UserProfile): boolean {
  return canEditUser(viewer, target) && target.role !== "owner" && viewer.uid !== target.uid;
}

const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, entry: 2 };

export function sortUsers(list: UserProfile[]): UserProfile[] {
  return [...list].sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      Number(b.active) - Number(a.active) ||
      a.displayName.localeCompare(b.displayName, "ar"),
  );
}

export interface AssignDiff {
  added: string[];
  removed: string[];
}

export function diffAssigned(before: string[], after: ReadonlySet<string>): AssignDiff {
  const b = new Set(before);
  return {
    added: [...after].filter((x) => !b.has(x)),
    removed: before.filter((x) => !after.has(x)),
  };
}

export interface PendingAssign {
  user: UserProfile;
  assigned: string[];
  added: string[];
  removed: string[];
}

/** التغييرات غير المحفوظة لكل مدخل بيانات: المسودة مقابل الإسناد الحالي في الخادم. */
export function pendingAssignments(
  users: UserProfile[],
  drafts: ReadonlyMap<string, ReadonlySet<string>>,
): PendingAssign[] {
  const out: PendingAssign[] = [];
  for (const user of users) {
    const d = drafts.get(user.uid);
    if (!d || user.role !== "entry") continue;
    const { added, removed } = diffAssigned(user.assigned, d);
    if (added.length || removed.length) out.push({ user, assigned: [...d], added, removed });
  }
  return out;
}
