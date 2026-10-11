import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./cleanup";
import { ENTRY, OWNER } from "./seed";

/** زر «دخلت ✓» أمام كل فاتورة لم تدخل (طلب المستخدم 2026-10-11). يعيد حالة الفاتورة في النهاية. */
test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await adminDb()
    .doc("entries/e103")
    .update({ odoo: { entered: false } });
});

async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("المالك: نقرة واحدة تحوّل الفاتورة إلى «دخلت» بتدقيق، والمقفلة معطّلة", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/invoices/s1");
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  // المقفلة (يونيو) لا تتغير
  await expect(page.getByRole("button", { name: "تحديد P10001 كـدخلت (فترة مقفلة)" })).toBeDisabled();
  await page.getByRole("button", { name: "تحديد P10002 كـدخلت" }).click();
  await expect(page.getByText("حُددت P10002 كـ«دخلت» وسُجّل التغيير في التدقيق.")).toBeVisible();
  await expect(page.getByRole("button", { name: "تحديد P10002 كـدخلت" })).toHaveCount(0);
  const e = await adminDb().doc("entries/e103").get();
  expect(e.get("odoo.entered")).toBe(true);
  const audit = await adminDb()
    .doc(`auditLog/${e.get("auditId") as string}`)
    .get();
  expect(audit.get("action")).toBe("odooEntered");
  await page.screenshot({ path: "test-results/invoice-mark-1440.png", fullPage: true });
});

test("مدخل البيانات: لا زر", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await page.goto("/invoices");
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  await expect(page.locator("main tbody tr").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /كـدخلت/ })).toHaveCount(0);
});

test("الجوال: الزر بجانب الختم بلا تمرير أفقي", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/invoices/s1");
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  await expect(page.getByRole("button", { name: /^تحديد P1000\d كـدخلت/ }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/invoice-mark-360.png", fullPage: true });
});
