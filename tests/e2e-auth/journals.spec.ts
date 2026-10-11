import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { ENTRY, OWNER } from "./seed";

// ExcelJS (CommonJS) بمحمّل Node العادي
const ExcelJS = createRequire(import.meta.url)("exceljs") as typeof import("exceljs");

/**
 * فهرس القيود (الخيار أ) على بيانات seed.ts الوهمية: قيود s1 (0501 بـ1,000، 0502 بـ1,200)،
 * وs2 (0601 بـ1,500، و0602 استرداد 200)، وs5 (0701 بـ99.99). الصافي الكلي = 3,599.99.
 */
async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

const rows = (page: Page) => page.locator("main tbody tr");

test("المالك: كل القيود، والوسم، والمورد، والتصدير، والقلم", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.getByRole("link", { name: "القيود", exact: true }).click();
  await expect(page).toHaveURL(/\/journals$/);
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByLabel("مجموع السداد")).toContainText("3,799.99");
  await expect(page.getByLabel("مجموع الاسترداد")).toContainText("200.00");
  await expect(page.getByLabel("الصافي")).toContainText("3,599.99");
  // الأحدث أولاً
  await expect(rows(page).first()).toContainText("MISC/2026/10/0602");
  await expect(rows(page).first()).toContainText("استرداد");

  await page.getByRole("radio", { name: "استرداد", exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator("main tfoot")).toContainText("-200.00");
  await page.getByRole("radio", { name: "سداد", exact: true }).click();
  await expect(rows(page)).toHaveCount(4);
  await page.getByRole("radio", { name: "الكل", exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "تصدير Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^القيود-الكل-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  const ws = wb.getWorksheet("القيود");
  expect(ws?.getCell("C5").value).toBe("MISC/2026/07/0501"); // الأقدم أولاً
  expect(ws?.getCell("F11").value).toMatchObject({ formula: "F10-G10", result: 3599.99 });

  await page.locator("main").getByRole("button", { name: "تعديل الحركة MISC/2026/10/0601" }).click();
  await expect(page.getByRole("dialog", { name: "تعديل الحركة" })).toContainText("المورد (ب)");
  await page.getByRole("dialog", { name: "تعديل الحركة" }).getByRole("button", { name: "إلغاء" }).click();

  await page.goto("/journals/s2");
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  await expect(rows(page)).toHaveCount(2);
  await page.screenshot({ path: "test-results/journals-1440.png", fullPage: true });
});

test("مدخل البيانات: قيود موردِيه فقط بلا قلم", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await page.goto("/journals");
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^تعديل الحركة/ })).toHaveCount(0);
});

test("الجوال: بطاقات بلا تمرير أفقي", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/journals");
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  await expect(rows(page)).toHaveCount(5);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/journals-360.png", fullPage: true });
});
