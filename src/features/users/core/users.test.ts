import { describe, expect, it } from "vitest";
import {
  canChangeRoleOrStatus,
  canEditUser,
  diffAssigned,
  parseRoleNames,
  pendingAssignments,
  parseUser,
  sortUsers,
  validateDisplayName,
  validateNewLogin,
  validateRoleName,
  type UserProfile,
} from "./users";

const u = (uid: string, role: UserProfile["role"], over: Partial<UserProfile> = {}): UserProfile => ({
  uid,
  displayName: uid,
  login: uid,
  role,
  assigned: [],
  active: true,
  mustChangePassword: false,
  updatedAt: null,
  ...over,
});

describe("المستخدمون", () => {
  it("قراءة المستند ترفض الشاذ", () => {
    expect(parseUser("x", { displayName: "a", login: "a", role: "boss", active: true })).toBeNull();
    expect(parseUser("x", undefined)).toBeNull();
    expect(
      parseUser("x", { displayName: "a", login: "a", role: "entry", active: true, assigned: ["s1", 3] }),
    ).toMatchObject({ assigned: ["s1"], mustChangePassword: false });
  });
  it("المسميات الفارغة تعود للافتراضي", () => {
    expect(parseRoleNames({ owner: "صاحب المنشأة", admin: " " })).toEqual({
      owner: "صاحب المنشأة",
      admin: "الإدارة",
      entry: "مدخل البيانات",
    });
    expect(validateRoleName("  ")).not.toBeNull();
    expect(validateRoleName("x".repeat(41))).not.toBeNull();
    expect(validateRoleName("المحاسب")).toBeNull();
  });
  it("الاسم الظاهر والدخول الجديد", () => {
    expect(validateDisplayName("")).not.toBeNull();
    expect(validateDisplayName("x".repeat(81))).not.toBeNull();
    expect(validateNewLogin("Fahad@Example.com", ["fahad@example.com"])).toMatchObject({
      ok: false,
      error: "هذا الدخول مستخدم لحساب آخر.",
    });
    expect(validateNewLogin("layla", [])).toMatchObject({ ok: false });
    expect(validateNewLogin(" Layla@Example.com ", ["fahad@example.com"])).toEqual({
      ok: true,
      login: "layla@example.com",
      email: "layla@example.com",
    });
  });
  it("الإدارة تدير الجميع عدا المالك، ولا أحد يغيّر دوره أو يوقف نفسه", () => {
    const owner = u("o", "owner");
    const admin = u("a", "admin");
    const admin2 = u("a2", "admin");
    const entry = u("e", "entry");
    expect(canEditUser(admin, owner)).toBe(false);
    expect(canEditUser(owner, owner)).toBe(true);
    expect(canEditUser(admin, admin2)).toBe(true);
    expect(canEditUser(entry, entry)).toBe(false);
    expect(canChangeRoleOrStatus(owner, owner)).toBe(false);
    expect(canChangeRoleOrStatus(admin, admin)).toBe(false);
    expect(canChangeRoleOrStatus(admin, admin2)).toBe(true);
    expect(canChangeRoleOrStatus(admin, entry)).toBe(true);
  });
  it("الترتيب: الدور ثم النشط ثم الاسم", () => {
    const list = sortUsers([
      u("ب", "entry"),
      u("أ", "entry", { active: false }),
      u("م", "owner"),
      u("ج", "admin"),
    ]);
    expect(list.map((x) => x.uid)).toEqual(["م", "ج", "ب", "أ"]);
  });
  it("فرق الإسناد", () => {
    expect(diffAssigned(["a", "b", "z"], new Set(["b", "c", "z"]))).toEqual({ added: ["c"], removed: ["a"] });
  });
  it("التغييرات المعلّقة: من تغيّر فقط، والمؤرشف المسند سابقاً يبقى", () => {
    const a = u("a", "entry", { assigned: ["s1", "arch"] });
    const b = u("b", "entry", { assigned: ["s2"] });
    const drafts = new Map([
      ["a", new Set(["s1", "arch", "s3"])],
      ["b", new Set(["s2"])],
    ]);
    const p = pendingAssignments([a, b], drafts);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ added: ["s3"], removed: [], assigned: ["s1", "arch", "s3"] });
  });
});
