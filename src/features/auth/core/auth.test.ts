import { describe, expect, it } from "vitest";
import { createIdleTracker, type IdleState, type IdleTimers } from "./idle";
import { effectiveIdleMinutes, parseIdleMinutes } from "./sessionSettings";
import { msToNextMinute, riyadhClock } from "./clock";
import { authErrorMessage } from "./authErrors";

/** مؤقت وهمي يتقدم يدوياً. */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const q = new Map<number, { at: number; fn: () => void }>();
  const timers: IdleTimers = {
    now: () => now,
    set: (fn, ms) => {
      const id = ++seq;
      q.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (h) => void q.delete(h as number),
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      q.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  };
  return { timers, advance };
}

const MIN = 60_000;

function setup(timeout = 30 * MIN) {
  const f = fakeTimers();
  const states: IdleState[] = [];
  const tr = createIdleTracker({
    timeoutMs: timeout,
    warnMs: MIN,
    timers: f.timers,
    onChange: (s) => states.push(s),
  });
  return { ...f, tr, states };
}

describe("الخمول وإنهاء الجلسة", () => {
  it("تحذير قبل الانتهاء بدقيقة، ثم انتهاء", () => {
    const { tr, advance, states } = setup();
    advance(29 * MIN - 1);
    expect(tr.state()).toBe("active");
    advance(1);
    expect(states).toEqual(["warning"]);
    advance(MIN);
    expect(states).toEqual(["warning", "expired"]);
  });
  it("النشاط يؤجل الانتهاء", () => {
    const { tr, advance } = setup();
    advance(20 * MIN);
    tr.activity();
    advance(20 * MIN);
    expect(tr.state()).toBe("active");
    advance(9 * MIN);
    expect(tr.state()).toBe("warning");
  });
  it("الحركة أثناء التحذير لا تكفي، و«متابعة العمل» تعيد المدة", () => {
    const { tr, advance } = setup();
    advance(29 * MIN);
    tr.activity();
    advance(30_000);
    expect(tr.state()).toBe("warning");
    tr.extend();
    expect(tr.state()).toBe("active");
    advance(28 * MIN);
    expect(tr.state()).toBe("active");
  });
  it("الانتهاء نهائي", () => {
    const { tr, advance } = setup();
    advance(30 * MIN);
    tr.extend();
    tr.activity();
    expect(tr.state()).toBe("expired");
  });
  it("تغيير المالك للمدة يسري فوراً", () => {
    const { tr, advance } = setup();
    advance(10 * MIN);
    tr.setTimeoutMs(10 * MIN);
    expect(tr.state()).toBe("expired");
    const b = setup();
    b.advance(29 * MIN);
    expect(b.tr.state()).toBe("warning");
    b.tr.setTimeoutMs(60 * MIN);
    expect(b.tr.state()).toBe("active");
  });
  it("الإيقاف يلغي المؤقت", () => {
    const { tr, advance, states } = setup();
    tr.stop();
    advance(60 * MIN);
    expect(states).toEqual([]);
  });
  it("يرفض مدة أقصر من التحذير", () => {
    expect(() => setup(MIN)).toThrow(RangeError);
  });
});

describe("إعداد مدة الخمول", () => {
  it("من 5 إلى 120 دقيقة، والأرقام الهندية تُقبل", () => {
    expect(parseIdleMinutes("30")).toEqual({ ok: true, value: 30 });
    expect(parseIdleMinutes("٤٥")).toEqual({ ok: true, value: 45 });
    expect(parseIdleMinutes(" 5 ")).toEqual({ ok: true, value: 5 });
    for (const bad of ["4", "121", "", "3.5", "-10", "abc", "1000"]) {
      expect(parseIdleMinutes(bad)).toMatchObject({ ok: false });
    }
  });
  it("القيمة المخزنة الشاذة تعود للافتراضي", () => {
    expect(effectiveIdleMinutes(45)).toBe(45);
    expect(effectiveIdleMinutes(undefined)).toBe(30);
    expect(effectiveIdleMinutes(2)).toBe(30);
    expect(effectiveIdleMinutes("45")).toBe(30);
  });
});

describe("ساعة الدخول", () => {
  it("12 ساعة بتوقيت الرياض", () => {
    expect(riyadhClock(new Date("2026-10-10T08:21:00Z"))).toMatchObject({ time: "11:21", period: "ص" });
    expect(riyadhClock(new Date("2026-10-10T13:05:00Z"))).toMatchObject({ time: "4:05", period: "م" });
    expect(riyadhClock(new Date("2026-10-10T21:00:00Z"))).toMatchObject({ time: "12:00", period: "ص" });
    const d = riyadhClock(new Date("2026-10-10T08:21:00Z")).date;
    expect(d).toContain("2026");
    expect(d).toContain("أكتوبر");
    expect(d).toContain("السبت");
  });
  it("يتحدث عند بداية الدقيقة", () => {
    expect(msToNextMinute(new Date("2026-10-10T08:21:45Z"))).toBe(15_000);
  });
});

describe("رسائل أخطاء الدخول", () => {
  it("خطأ البيانات رسالة عامة لا تكشف وجود الحساب", () => {
    const a = authErrorMessage({ code: "auth/user-not-found" });
    expect(authErrorMessage({ code: "auth/wrong-password" })).toBe(a);
    expect(authErrorMessage({ code: "auth/invalid-credential" })).toBe(a);
  });
  it("الرمز غير المعروف يظهر ولا يُبتلع", () => {
    expect(authErrorMessage({ code: "auth/quota-exceeded" })).toContain("auth/quota-exceeded");
    expect(authErrorMessage(new Error("x"))).toContain("غير متوقع");
  });
});
