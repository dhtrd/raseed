import { expect, test, type Page } from "@playwright/test";
import { ENTRY, OWNER } from "./seed";

/** البحث العام (الخيار أ: نافذة Ctrl+K) على المحاكي. يقرأ فقط ولا يغيّر شيئاً. */
async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  // اختصار Ctrl+K يعمل بعد رسم الرأس
  await expect(page.getByRole("button", { name: "بحث في كل شيء" })).toBeVisible();
}
const dlg = (page: Page) => page.getByRole("dialog", { name: "البحث العام" });
const box = (page: Page) => dlg(page).getByRole("combobox", { name: "البحث في كل شيء" });
const options = (page: Page) => dlg(page).getByRole("option");

test("Ctrl+K: البحث بالبيان يفتح كشف المورد ويبرز الحركة", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.keyboard.press("Control+k");
  await expect(box(page)).toBeFocused();
  await page.keyboard.type("مرتجع بضاعه"); // التاء المربوطة تُطابَق بالهاء
  await expect(options(page)).toHaveCount(1);
  await expect(options(page).first()).toContainText("P10003");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/statement\/s1$/);
  await expect(dlg(page)).toBeHidden();
  const row = page.locator('main tbody tr[data-entry="e105"]');
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/hl/);
});

test("مورد بالاسم، ومبلغ بلا فواصل، والمحذوف بوسم «محذوف» للمالك", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.getByRole("button", { name: "بحث في كل شيء" }).click();
  await box(page).fill("المورد ب");
  await expect(options(page).first()).toContainText("مورد");
  await options(page).first().click();
  await expect(page).toHaveURL(/\/statement\/s2$/);

  await page.keyboard.press("Control+k");
  await box(page).fill("999");
  const del = options(page).filter({ hasText: "P10009" });
  await expect(del).toContainText("محذوف");
  await page.screenshot({ path: "test-results/search-1440.png" });
  await del.click();
  await expect(page.getByText("الحركة المطلوبة محذوفة، فلا تظهر في الكشف.")).toBeVisible();
});

test("مدخل البيانات: نتائج موردِيه فقط ولا محذوف", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await page.keyboard.press("Control+k");
  await box(page).fill("P1000");
  await expect(dlg(page).getByText(/0 مورد · 0 حركة/)).toBeVisible();
  await box(page).fill("0601");
  await expect(options(page).first()).toContainText("المورد (ب)");
});

test("الجوال: شاشة كاملة بزر «إغلاق» ظاهر، بلا تمرير أفقي ولا عنصر أصلي", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.getByRole("button", { name: "بحث في كل شيء" }).click();
  await box(page).fill("فاتورة");
  await expect(options(page).first()).toBeVisible();
  const close = dlg(page).getByRole("button", { name: "إغلاق البحث" });
  await expect(close).toBeVisible();
  const box1 = await dlg(page).boundingBox();
  expect(box1?.width).toBeGreaterThanOrEqual(359);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const banned = await page.evaluate(
    () =>
      document.querySelectorAll(
        'select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="date"]',
      ).length,
  );
  expect(banned).toBe(0);
  await page.screenshot({ path: "test-results/search-360.png" });
  await close.click();
  await expect(dlg(page)).toBeHidden();
});
