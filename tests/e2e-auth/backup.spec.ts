import { expect, test, type Page } from "@playwright/test";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./cleanup";
import { ADMIN, ENTRY, OWNER } from "./seed";

/** متابعة النسخ (الخيار ب «الشريط الزمني»): حالة، وشريط 30 يوماً، وتفاصيل اليوم، وملفات Dropbox. */
async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

const riyadhDay = (ms: number) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
const DAY = 86_400_000;
const now = Date.now();
const today = riyadhDay(now);
const yesterday = riyadhDay(now - DAY);
const dmy = (iso: string) => iso.split("-").reverse().join("/");

async function clear() {
  const db = adminDb();
  const runs = await db.collection("backupRuns").get();
  await Promise.all(runs.docs.map((d) => d.ref.delete()));
  await db.doc("settings/backup").delete();
}

test.afterAll(clear);

test("المالك: بلا تشغيلات تظهر حالة الفراغ برابط السير", async ({ page }) => {
  await clear();
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.getByRole("link", { name: "النسخ الاحتياطي" }).first().click();
  await expect(page).toHaveURL(/\/backup$/);
  await expect(page.getByText("لم يُسجَّل أي تشغيل بعد")).toBeVisible();
  await expect(page.getByText("لم يُفعَّل بعد")).toBeVisible();
});

test("الإدارة: الحالة والشريط والتفاصيل والملفات", async ({ page }) => {
  const db = adminDb();
  await db
    .doc("settings/backup")
    .set({ lastRunAt: Timestamp.fromMillis(now - 3600_000), lastStatus: "ok", lastError: "" });
  await db.doc(`backupRuns/${today}`).set({
    day: today,
    at: Timestamp.fromMillis(now - 3600_000),
    status: "ok",
    error: "",
    durationMs: 42_000,
    bytes: 3_400_000,
    counts: { entries: 2603, suppliers: 19 },
    authUsers: 3,
    files: [`raseed-${today}.xlsx`, `raseed-${today}.json.gz.enc`],
  });
  await db.doc(`backupRuns/${yesterday}`).set({
    day: yesterday,
    at: Timestamp.fromMillis(now - DAY),
    status: "failed",
    error: "Dropbox: invalid_access_token",
    durationMs: 3000,
  });

  await page.emulateMedia({ reducedMotion: "reduce" }); // لقطات بلا شاشة الافتتاح
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ADMIN.email, ADMIN.password);
  await page.goto("/backup");
  const status = page.getByRole("region", { name: "حالة النسخ" });
  await expect(status).toContainText("آخر نسخة سليمة");
  await expect(status).toContainText("غداً 11:30");

  const days = page.getByRole("group", { name: "أيام النسخ" }).getByRole("button");
  await expect(days).toHaveCount(30);
  const todayBtn = page.getByRole("button", { name: new RegExp(`^${dmy(today)}: نجحت`) });
  await expect(todayBtn).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: dmy(today) })).toContainText("2,603");

  await page.getByRole("button", { name: new RegExp(`^${dmy(yesterday)}: فشلت`) }).click();
  await expect(page.getByText("Dropbox: invalid_access_token")).toBeVisible();

  const files = page.getByRole("complementary", { name: "ملفات النسخ" });
  await expect(files).toContainText(`raseed-${today}.json.gz.enc`);
  await page.screenshot({ path: "test-results/backup-1440.png", fullPage: true });

  await page.setViewportSize({ width: 360, height: 780 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/backup-360.png", fullPage: true });
});

test("مدخل البيانات: لا بند ولا صفحة", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await expect(page.getByRole("link", { name: "النسخ الاحتياطي" })).toHaveCount(0);
  await page.goto("/backup");
  await expect(page.getByRole("heading", { name: "النسخ الاحتياطي" })).toHaveCount(0);
});
