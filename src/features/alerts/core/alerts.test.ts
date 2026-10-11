import { describe, expect, it } from "vitest";
import { buildAlerts, unseen, type AlertInput } from "./alerts";

const NOW = Date.UTC(2026, 9, 11, 12);
const base: AlertInput = { isOwner: true, lock: null, reviewOpen: 0, backup: null, now: NOW };
const ok = { exists: true, lastStatus: "ok" as const, lastError: "" };

describe("مركز الإشعارات", () => {
  it("لا تنبيهات حين يكون كل شيء سليماً", () => {
    expect(buildAlerts({ ...base, backup: { ...ok, lastRunAt: NOW - 3600_000 } })).toEqual([]);
  });

  it("النسخ الاحتياطي: غير مفعّل، أو فشل، أو متأخر", () => {
    expect(
      buildAlerts({
        ...base,
        backup: { exists: false, lastRunAt: null, lastStatus: null, lastError: "" },
      })[0],
    ).toMatchObject({ sig: "backup-none", tone: "info" });
    const fail = buildAlerts({
      ...base,
      backup: { exists: true, lastRunAt: NOW - 1000, lastStatus: "failed", lastError: "رمز Dropbox منتهٍ" },
    })[0];
    expect(fail).toMatchObject({ tone: "err" });
    expect(fail?.text).toContain("رمز Dropbox منتهٍ");
    expect(buildAlerts({ ...base, backup: { ...ok, lastRunAt: NOW - 27 * 3600_000 } })[0]?.tone).toBe("warn");
  });

  it("الفتح المؤقت والمراجعة، والرابط للمالك فقط", () => {
    const a = buildAlerts({
      ...base,
      lock: { lockedThrough: "2026-05-31", tempFrom: "2026-09-30" },
      reviewOpen: 3,
    });
    expect(a.map((x) => x.href)).toEqual(["/lock", "/review"]);
    expect(a[1]?.title).toBe("3 ملاحظة مفتوحة في مركز المراجعة");
    const admin = buildAlerts({
      ...base,
      isOwner: false,
      lock: { lockedThrough: "2026-05-31", tempFrom: "2026-09-30" },
    });
    expect(admin[0]?.href).toBeNull();
  });

  it("الجديد = ما لم تُرَ بصمته؛ وتغيّر الحالة يجعله جديداً", () => {
    const a = buildAlerts({ ...base, reviewOpen: 3 });
    expect(unseen(a, new Set(["review-3"]))).toBe(0);
    expect(unseen(buildAlerts({ ...base, reviewOpen: 4 }), new Set(["review-3"]))).toBe(1);
  });
});
