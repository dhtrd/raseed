import { expect, test, type Page } from "@playwright/test";
import { ENTRY, OWNER } from "./seed";

/**
 * التنقل: القائمة الجانبية في اليمين (الخيار أ، DECISIONS 2026-10-11) على الحاسوب واللوحي،
 * وعلى الجوال درج ☰ + التنقل السفلي (CHOSEN §التنقل السفلي).
 */
async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

const side = (page: Page) => page.getByRole("navigation", { name: "أقسام الدفتر" });
const bottom = (page: Page) => page.getByRole("navigation", { name: "التنقل الرئيسي" });
const LEDGER = ["الأرصدة", "كشف الحساب", "الفواتير", "القيود", "إضافة حركة", "المراجعة"];
const ADMIN = ["قفل الفترات", "التدقيق", "المستخدمون", "الإسناد"];

test("الحاسوب: قائمة يمنى بقسمين، والطيّ إلى أيقونات يُحفظ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await expect(bottom(page)).toBeHidden();
  await expect(side(page).getByRole("group", { name: "الدفتر" }).getByRole("link")).toHaveText(LEDGER);
  await expect(side(page).getByRole("group", { name: "الإدارة" }).getByRole("link")).toHaveText(ADMIN);
  const box = await side(page).boundingBox();
  // في جهة اليمين (البداية في RTL)
  expect(box && Math.round(box.x + box.width)).toBeGreaterThanOrEqual(1430);
  expect(box && Math.round(box.width)).toBeGreaterThan(200);
  await page.screenshot({ path: "test-results/sidebar-1440.png" });

  await side(page).getByRole("button", { name: "طيّ القائمة" }).click();
  await expect.poll(async () => Math.round((await side(page).boundingBox())?.width ?? 0)).toBeLessThan(80);
  // التسمية تبقى اسماً للرابط
  await side(page).getByRole("link", { name: "الفواتير" }).click();
  await expect(page).toHaveURL(/\/invoices$/);
  await page.reload();
  await expect.poll(async () => Math.round((await side(page).boundingBox())?.width ?? 0)).toBeLessThan(80);
  await side(page).getByRole("button", { name: "توسيع القائمة" }).click();
  await expect
    .poll(async () => Math.round((await side(page).boundingBox())?.width ?? 0))
    .toBeGreaterThan(200);
});

test("اللوحي: أيقونات افتراضياً، بلا تمرير أفقي", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await loginOk(page, OWNER.email, OWNER.password);
  await expect.poll(async () => Math.round((await side(page).boundingBox())?.width ?? 0)).toBeLessThan(80);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/sidebar-834.png" });
});

for (const w of [1280, 1366, 1920]) {
  test(`الحاسوب ${w}px: بلا تمرير أفقي`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await loginOk(page, OWNER.email, OWNER.password);
    await expect(side(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("المالك على الجوال: التنقل السفلي خمس خانات، والدرج ☰ من اليمين لكل الأقسام", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await expect(bottom(page).getByRole("link")).toHaveText([
    "الأرصدة",
    "الكشف",
    "الفواتير",
    "إضافة",
    "المراجعة",
  ]);
  await expect(side(page)).toHaveCount(0);
  await page.getByRole("button", { name: "القائمة", exact: true }).click();
  const d = page.getByRole("dialog", { name: "القائمة" });
  await expect(d.getByRole("group", { name: "الإدارة" }).getByRole("link")).toHaveText(ADMIN);
  const box = await d.boundingBox();
  expect(box && Math.round(box.x + box.width)).toBeGreaterThanOrEqual(355);
  await page.screenshot({ path: "test-results/sidebar-360.png" });
  await d.getByRole("link", { name: "القيود" }).click();
  await expect(page).toHaveURL(/\/journals$/);
  await expect(d).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("مدخل البيانات على الجوال: أربع خانات، والدرج بلا «المراجعة» ولا «الإدارة»", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await expect(bottom(page).getByRole("link")).toHaveText(["الأرصدة", "الكشف", "الفواتير", "إضافة"]);
  await page.getByRole("button", { name: "القائمة", exact: true }).click();
  const d = page.getByRole("dialog", { name: "القائمة" });
  await expect(d.getByRole("group", { name: "الدفتر" }).getByRole("link")).toHaveText(LEDGER.slice(0, 5));
  await expect(d.getByRole("group", { name: "الإدارة" })).toHaveCount(0);
  await d.getByRole("button", { name: "إغلاق القائمة" }).click();
  await expect(d).toHaveCount(0);
});
