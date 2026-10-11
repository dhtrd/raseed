import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { OWNER } from "./seed";

// ExcelJS (CommonJS) بمحمّل Node العادي
const ExcelJS = createRequire(import.meta.url)("exceljs") as typeof import("exceljs");

/** تصدير الفواتير حسب الفلتر الظاهر (طلب المستخدم 2026-10-11). لا يغيّر بيانات. */
async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function exportSheet(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("complementary", { name: "تصدير الفواتير" })
      .getByRole("button", { name: "تصدير Excel" })
      .click(),
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  return { name: download.suggestedFilename(), ws: wb.getWorksheet("الفواتير") };
}

test("الفواتير: «تصدير Excel» يتبع فلتر الحالة الظاهر بعمود حالة Odoo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/invoices");
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  const rows = page.locator("main tbody").getByRole("checkbox", { name: /^تحديد الفاتورة/ });
  await expect(rows.first()).toBeVisible();
  const all = await rows.count();

  const a = await exportSheet(page);
  expect(a.name).toMatch(/^الفواتير-كل الحالات-الكل-\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect(String(a.ws?.getCell("A2").value)).toContain(`العدد ${all}`);
  expect(a.ws?.getRow(4).getCell(7).value).toBe("حالة Odoo");

  await page.getByRole("radio", { name: "لم تدخل", exact: true }).click();
  await expect(rows.first()).toBeVisible();
  const out = await rows.count();
  const b = await exportSheet(page);
  expect(b.name).toMatch(/^الفواتير-لم تدخل-/);
  const statuses = new Set<unknown>();
  for (let r = 5; r < 5 + out; r++) statuses.add(b.ws?.getRow(r).getCell(7).value);
  expect([...statuses]).toEqual(["لم تدخل"]);
  expect(b.ws?.getRow(5 + out).getCell(1).value).toBe("الإجمالي");
});
