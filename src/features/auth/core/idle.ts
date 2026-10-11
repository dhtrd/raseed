/**
 * تتبّع الخمول وإنهاء الجلسة (DECISIONS 2026-10-10): بعد مدة بلا نشاط يظهر تحذير
 * بعدّ تنازلي، ثم تنتهي الجلسة. أثناء التحذير لا تكفي حركة الفأرة: يلزم «متابعة العمل» صراحةً.
 * منطق نقي بمؤقت قابل للحقن كي يُختبر دون انتظار حقيقي.
 */
export type IdleState = "active" | "warning" | "expired";

export interface IdleTimers {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const browserTimers: IdleTimers = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface IdleOptions {
  timeoutMs: number;
  /** مدة التحذير قبل الانتهاء (دقيقة في النموذج المعتمد). */
  warnMs: number;
  onChange: (state: IdleState) => void;
  timers?: IdleTimers;
}

export interface IdleTracker {
  /** نشاط المستخدم (لوحة مفاتيح، نقر، لمس، تمرير). يُتجاهل أثناء التحذير. */
  activity(): void;
  /** «متابعة العمل» من نافذة التحذير. */
  extend(): void;
  /** تغيير المدة يسري فوراً محسوباً من آخر نشاط. */
  setTimeoutMs(ms: number): void;
  /** موعد الانتهاء الحالي (لعدّ التحذير التنازلي). */
  deadline(): number;
  state(): IdleState;
  stop(): void;
}

export function createIdleTracker(opts: IdleOptions): IdleTracker {
  const t = opts.timers ?? browserTimers;
  if (!(opts.warnMs > 0) || !(opts.timeoutMs > opts.warnMs)) {
    throw new RangeError("مدة الخمول يجب أن تكون أطول من مدة التحذير.");
  }
  let timeoutMs = opts.timeoutMs;
  let last = t.now();
  let state: IdleState = "active";
  let handle: unknown = null;
  let stopped = false;

  const set = (s: IdleState) => {
    if (s === state) return;
    state = s;
    opts.onChange(s);
  };

  const schedule = () => {
    if (handle !== null) t.clear(handle);
    handle = null;
    if (stopped || state === "expired") return;
    const now = t.now();
    const deadline = last + timeoutMs;
    const warnAt = deadline - opts.warnMs;
    if (now >= deadline) {
      set("expired");
      return;
    }
    if (now >= warnAt) {
      set("warning");
      handle = t.set(schedule, deadline - now);
      return;
    }
    // تغيير المدة قد يعيد الحالة من التحذير إلى النشاط
    set("active");
    handle = t.set(schedule, warnAt - now);
  };

  schedule();

  return {
    activity() {
      if (state !== "active" || stopped) return;
      last = t.now();
      // لا إعادة جدولة مع كل حركة: المؤقت يتحقق من آخر نشاط حين يحين موعده
    },
    extend() {
      if (state === "expired" || stopped) return;
      last = t.now();
      schedule();
    },
    setTimeoutMs(ms: number) {
      if (!(ms > opts.warnMs)) throw new RangeError("مدة الخمول يجب أن تكون أطول من مدة التحذير.");
      timeoutMs = ms;
      schedule();
    },
    deadline: () => last + timeoutMs,
    state: () => state,
    stop() {
      stopped = true;
      if (handle !== null) t.clear(handle);
      handle = null;
    },
  };
}
