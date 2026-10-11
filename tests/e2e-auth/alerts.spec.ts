import { expect, test, type Page } from "@playwright/test";
import { ENTRY, OWNER } from "./seed";

/** الإشعارات (الخيار ج): مركز الإشعارات بجرس للمالك والإدارة، والإشعار العائم بعد الحفظ. */
async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("المالك: الجرس بعدّاد الجديد، والمركز يعرض النسخ الاحتياطي والمراجعة، والفتح يصفّر العدّاد", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  const bell = page.getByRole("button", { name: /^الإشعارات/ });
  await expect(bell).toHaveAccessibleName(/\(\d+ جديدة\)/);
  await bell.click();
  const d = page.getByRole("dialog", { name: "مركز الإشعارات" });
  await expect(d).toContainText("النسخ الاحتياطي اليومي لم يُفعَّل بعد");
  await expect(d).toContainText(/ملاحظة مفتوحة في مركز المراجعة/);
  await page.screenshot({ path: "test-results/alerts-1440.png" });
  await d.getByRole("link", { name: "فتح" }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(bell).toHaveAccessibleName("الإشعارات");
});

test("مدخل البيانات: لا جرس", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await expect(page.getByRole("button", { name: "بحث في كل شيء" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^الإشعارات/ })).toHaveCount(0);
});

test("الجوال: المركز شاشة كاملة بزر إغلاق", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.getByRole("button", { name: /^الإشعارات/ }).click();
  const box = await page.getByRole("dialog", { name: "مركز الإشعارات" }).boundingBox();
  expect(box && Math.round(box.height)).toBeGreaterThanOrEqual(770);
  await page.getByRole("button", { name: "إغلاق الإشعارات" }).click();
  await expect(page.getByRole("dialog", { name: "مركز الإشعارات" })).toHaveCount(0);
});
