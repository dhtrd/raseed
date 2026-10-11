import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./cleanup";
import { ADMIN, OWNER } from "./seed";

/**
 * قفل الفترات (الخيار ب) على المحاكي بالقواعد الحقيقية. يعيد تاريخ القفل إلى قيمة البذرة في النهاية
 * لأن ملفات بعده تعتمد عليه.
 */
test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await adminDb().doc("settings/lock").set({ lockedThrough: "2026-06-30", auditId: "seed" });
});

async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
const months = (page: Page) => page.getByRole("list", { name: /^أشهر 2026/ });
const reason = (page: Page) => page.getByRole("textbox", { name: /السبب/ });

test("المالك: قفل حتى نهاية شهر بسبب إلزامي، ثم فتح مؤقت وشريط ظاهر، ثم إعادة القفل", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.getByRole("link", { name: "قفل الفترات" }).click();
  await expect(page.getByRole("heading", { name: "قفل الفترات", level: 1 })).toBeVisible();
  await expect(page.locator("main").getByText("30/06/2026").first()).toBeVisible();
  await expect(months(page).getByRole("button", { name: "يونيو 2026، مقفل" })).toBeVisible();
  await expect(months(page).getByRole("button", { name: "أكتوبر 2026، قادم" })).toBeVisible();

  // قفل حتى نهاية سبتمبر: بلا سبب لا يُحفظ
  await months(page)
    .getByRole("button", { name: /^سبتمبر 2026/ })
    .click();
  await page.getByRole("button", { name: "قفل حتى نهايته" }).click();
  await page.getByRole("button", { name: "حفظ تاريخ الإقفال" }).click();
  await expect(page.getByText("اكتب السبب؛ يُحفظ في سجل التدقيق.")).toBeVisible();
  await reason(page).fill("إقفال الربع الثالث");
  await page.getByRole("button", { name: "حفظ تاريخ الإقفال" }).click();
  await expect(page.getByText("صار مقفلاً حتى 30/09/2026.")).toBeVisible();
  let lock = await adminDb().doc("settings/lock").get();
  expect(lock.data()).toMatchObject({ lockedThrough: "2026-09-30" });
  expect(lock.get("tempFrom")).toBeUndefined();
  const audit = await adminDb()
    .doc(`auditLog/${lock.get("auditId") as string}`)
    .get();
  expect(audit.get("action")).toBe("lockSet");
  expect(audit.get("reason")).toBe("إقفال الربع الثالث");
  await expect(page.getByRole("complementary", { name: "سجل الإقفال" })).toContainText("قفل حتى 30/09/2026");

  // فتح مؤقت من بداية مارس
  await months(page)
    .getByRole("button", { name: /^مارس 2026/ })
    .click();
  await page.getByRole("button", { name: "فتح مؤقت من بدايته" }).click();
  await expect(page.getByRole("textbox", { name: /افتح القفل إلى/ })).toHaveValue(/28\/02\/2026/);
  await reason(page).fill("تصحيح تاريخ مقلوب في مارس");
  await page.getByRole("button", { name: "فتح مؤقت", exact: true }).click();
  await expect(page.getByText(/فُتح القفل مؤقتاً إلى 28\/02\/2026/)).toBeVisible();
  lock = await adminDb().doc("settings/lock").get();
  expect(lock.data()).toMatchObject({ lockedThrough: "2026-02-28", tempFrom: "2026-09-30" });
  await expect(months(page).getByRole("button", { name: "أبريل 2026، مفتوح مؤقتاً" })).toBeVisible();
  await page.screenshot({ path: "test-results/lock-1440.png", fullPage: true });

  // الشريط ظاهر في الشاشات الأخرى
  await page.getByRole("link", { name: "الأرصدة", exact: true }).click();
  await expect(page.getByRole("heading", { name: "أرصدة الموردين" })).toBeVisible();
  const bar = page.getByRole("status").filter({ hasText: "القفل مفتوح مؤقتاً" });
  await expect(bar).toContainText("30/09/2026");
  await bar.getByRole("link", { name: "إعادة القفل" }).click();
  await page.getByRole("button", { name: "إعادة القفل إلى 30/09/2026" }).click();
  await expect(reason(page)).toHaveValue("انتهى التصحيح");
  await page.getByRole("button", { name: "إعادة القفل", exact: true }).click();
  await expect(page.getByText("أُعيد القفل حتى 30/09/2026.")).toBeVisible();
  await expect(bar).toHaveCount(0);
  lock = await adminDb().doc("settings/lock").get();
  expect(lock.data()).toMatchObject({ lockedThrough: "2026-09-30" });
  expect(lock.get("tempFrom")).toBeUndefined();
});

test("لا تاريخ إقفال بعد اليوم", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/lock");
  await page.getByRole("button", { name: "تاريخ مخصص" }).click();
  const d = page.getByRole("textbox", { name: /^مقفل حتى/ });
  await d.fill("311299");
  await d.press("Tab");
  await reason(page).fill("x");
  await page.getByRole("button", { name: "حفظ تاريخ الإقفال" }).click();
  await expect(page.getByText(/لا يتجاوز تاريخ الإقفال اليوم/)).toBeVisible();
});

test("الإدارة: لا تبويب ولا وصول", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ADMIN.email, ADMIN.password);
  await expect(page.getByRole("link", { name: "قفل الفترات" })).toHaveCount(0);
  await page.goto("/lock");
  await expect(page).not.toHaveURL(/\/lock$/);
});

for (const w of [360, 834]) {
  test(`${w}px: بلا تمرير أفقي ولا عنصر أصلي`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await loginOk(page, OWNER.email, OWNER.password);
    await page.goto("/lock");
    await expect(months(page).getByRole("button")).toHaveCount(12);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const banned = await page.evaluate(
      () =>
        document.querySelectorAll(
          'select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="date"]',
        ).length,
    );
    expect(banned).toBe(0);
    await page.screenshot({ path: `test-results/lock-${w}.png`, fullPage: true });
  });
}
