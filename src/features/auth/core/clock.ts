/** ساعة شاشة الدخول: 12 ساعة بتوقيت الرياض، بأرقام لاتينية و«ص/م» (DECISIONS 2026-10-10). */
const TZ = "Asia/Riyadh";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export interface ClockFace {
  /** مثل 11:21 */
  time: string;
  period: "ص" | "م";
  /** مثل «السبت، 10 أكتوبر 2026» */
  date: string;
}

export function riyadhClock(at: Date): ClockFace {
  const parts = timeFmt.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    time: `${part("hour")}:${part("minute")}`,
    period: part("dayPeriod").toUpperCase() === "AM" ? "ص" : "م",
    date: dateFmt.format(at),
  };
}

/** كم ملّي ثانية حتى بداية الدقيقة التالية، كي تتحدث الساعة في وقتها لا متأخرة. */
export function msToNextMinute(at: Date): number {
  return 60_000 - (at.getTime() % 60_000);
}
