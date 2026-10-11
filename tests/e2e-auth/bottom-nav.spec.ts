import { expect, test, type Page } from "@playwright/test";
import { ENTRY, OWNER } from "./seed";

/** التنقل السفلي على الجوال (CHOSEN §التنقل السفلي، النموذج المعتمد direction-1). */
async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

const nav = (page: Page) => page.getByRole("navigation", { name: "التنقل الرئيسي" });

test("المالك على الجوال: خمس خانات، والألسنة العلوية لما سواها فقط", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await expect(nav(page).getByRole("link")).toHaveText(["الأرصدة", "الكشف", "الفواتير", "إضافة", "المراجعة"]);
  await expect(nav(page).getByRole("link", { name: "الأرصدة" })).toHaveAttribute("aria-current", "page");
  const top = page.getByRole("navigation", { name: "أقسام الدفتر" });
  await expect(top.getByRole("link")).toHaveText(["قفل الفترات", "المستخدمون", "الإسناد"]);
  await nav(page).getByRole("link", { name: "الفواتير" }).click();
  await expect(page).toHaveURL(/\/invoices$/);
  await expect(nav(page).getByRole("link", { name: "الفواتير" })).toHaveAttribute("aria-current", "page");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/bottom-nav-360.png" });
});

test("مدخل البيانات على الجوال: أربع خانات بلا «المراجعة» ولا ألسنة علوية", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await expect(nav(page).getByRole("link")).toHaveText(["الأرصدة", "الكشف", "الفواتير", "إضافة"]);
  await expect(page.getByRole("navigation", { name: "أقسام الدفتر" })).toBeHidden();
});

test("الحاسوب: لا تنقل سفلي، والألسنة كاملة", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await expect(nav(page)).toBeHidden();
  await expect(page.getByRole("navigation", { name: "أقسام الدفتر" }).getByRole("link")).toHaveCount(8);
});
