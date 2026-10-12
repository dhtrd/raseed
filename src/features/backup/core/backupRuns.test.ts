import {
  buildStrip,
  formatBytes,
  formatDuration,
  isPermanentFile,
  nextRunLabel,
  parseRun,
  type BackupRun,
} from "./backupRuns";

const run = (day: string, status: "ok" | "failed" = "ok"): BackupRun => ({
  day,
  at: null,
  status,
  error: status === "failed" ? "x" : "",
  durationMs: 40_000,
  bytes: 420_000,
  counts: {},
  authUsers: null,
  files: [],
});

describe("سجل تشغيلات النسخ", () => {
  it("يرفض المستند غير المفهوم بدل عرضه نجاحاً", () => {
    expect(
      parseRun("2026-10-12", { status: "ok", counts: { entries: 3, bad: "x" }, files: ["a", 1] }, 5),
    ).toMatchObject({
      day: "2026-10-12",
      status: "ok",
      at: 5,
      counts: { entries: 3 },
      files: ["a"],
      bytes: null,
    });
    expect(parseRun("2026-10-12", { status: "maybe" }, null)).toBeNull();
    expect(parseRun("today", { status: "ok" }, null)).toBeNull();
  });

  it("الشريط: 30 يوماً من الأقدم إلى اليوم، والأيام بلا تشغيل «none»، ونسخة الشهر الدائمة", () => {
    const s = buildStrip(
      [run("2026-10-12"), run("2026-10-02"), run("2026-10-01", "failed"), run("2026-09-20")],
      "2026-10-12",
    );
    expect(s).toHaveLength(30);
    expect(s[0]?.day).toBe("2026-09-13");
    expect(s[29]?.day).toBe("2026-10-12");
    expect(s.find((d) => d.day === "2026-10-01")?.status).toBe("failed");
    expect(s.find((d) => d.day === "2026-10-05")?.status).toBe("none");
    // أول نجاح في أكتوبر هو 02 (01 فشل)، وفي سبتمبر 20
    expect(s.filter((d) => d.monthKept).map((d) => d.day)).toEqual(["2026-09-20", "2026-10-02"]);
  });

  it("الشريط يعبر حدود الأشهر والسنوات", () => {
    const s = buildStrip([], "2026-01-05");
    expect(s[0]?.day).toBe("2025-12-07");
  });

  it("موعد النسخة القادمة بتوقيت الرياض", () => {
    expect(nextRunLabel(new Date("2026-10-12T05:00:00Z"), false)).toBe("اليوم 11:30"); // 08:00 الرياض
    expect(nextRunLabel(new Date("2026-10-12T09:00:00Z"), false)).toBe("غداً 11:30"); // 12:00 الرياض
    expect(nextRunLabel(new Date("2026-10-12T05:00:00Z"), true)).toBe("غداً 11:30");
  });

  it("تنسيق الحجم والمدة، والملفات الدائمة", () => {
    expect(formatBytes(420_000)).toBe("410 ك.ب");
    expect(formatBytes(3_500_000)).toBe("3.3 م.ب");
    expect(formatBytes(null)).toBe("—");
    expect(formatDuration(42_400)).toBe("42 ث");
    expect(formatDuration(95_000)).toBe("1 د 35 ث");
    const s = buildStrip([run("2026-10-02")], "2026-10-12");
    expect(isPermanentFile("raseed-2026-10-02.xlsx", s)).toBe(true);
    expect(isPermanentFile("raseed-2026-08-01.json.gz.enc", s)).toBe(true);
    expect(isPermanentFile("raseed-2026-10-10.xlsx", s)).toBe(false);
    expect(isPermanentFile("notes.txt", s)).toBe(false);
  });
});
