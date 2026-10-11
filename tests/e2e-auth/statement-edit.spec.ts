import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./cleanup";
import { ENTRY, OWNER } from "./seed";

/** «تعديل» من كشف المورد (الخيار ب: عمود قلم) على المحاكي بالقواعد الحقيقية. */
test.describe.configure({ mode: "serial" });

async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("المالك: القلم يفتح نافذة التعديل، والحفظ يحدّث الكشف ويُسجَّل بالسبب", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/statement/s3");
  await page.locator("main").getByRole("button", { name: "تعديل الحركة P30001" }).click();
  const d = page.getByRole("dialog", { name: "تعديل الحركة" });
  await d.getByRole("textbox", { name: /التفاصيل/ }).fill("فاتورة مشتريات معدّلة");
  await d.getByRole("textbox", { name: /سبب التعديل/ }).fill("تصحيح البيان");
  // لا سجل مراجعة لهذه الحركة: لا خيار «تمت المراجعة»
  await expect(d.getByRole("checkbox", { name: /تمت المراجعة/ })).toHaveCount(0);
  await d.getByRole("button", { name: "حفظ التعديل" }).click();
  await expect(page.getByText(/حُفظ تعديل حركة المورد \(ج\) \(P30001\)/)).toBeVisible();
  await expect(page.locator("main tbody tr").filter({ hasText: "P30001" })).toContainText(
    "فاتورة مشتريات معدّلة",
  );
  const e = await adminDb().doc("entries/e301").get();
  expect(e.get("details")).toBe("فاتورة مشتريات معدّلة");
  const audit = await adminDb()
    .doc(`auditLog/${e.get("auditId") as string}`)
    .get();
  expect(audit.get("reason")).toBe("تصحيح البيان");
});

test("مدخل البيانات: لا قلم ولا عمود تعديل", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await page.goto("/statement/s2");
  await expect(page.locator("main tbody tr").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^تعديل الحركة/ })).toHaveCount(0);
});

test("الجوال: القلم في زاوية البطاقة ولا يغطي المبلغ، بلا تمرير أفقي", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/statement/s1");
  const card = page
    .locator("main tbody tr")
    .filter({ has: page.getByRole("button", { name: /^تعديل الحركة/ }) })
    .first();
  const pen = await card.getByRole("button", { name: /^تعديل الحركة/ }).boundingBox();
  const cells = await card.locator("td, th").evaluateAll((els) =>
    els
      .filter((x) => !x.querySelector("button[aria-label^='تعديل الحركة']") && x.textContent?.trim())
      .map(
        (x) =>
          x.getBoundingClientRect().toJSON() as {
            left: number;
            right: number;
            top: number;
            bottom: number;
          },
      ),
  );
  expect(pen).not.toBeNull();
  const overlap = cells.some(
    (c) =>
      pen && c.left < pen.x + pen.width && c.right > pen.x && c.top < pen.y + pen.height && c.bottom > pen.y,
  );
  expect(overlap).toBe(false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/statement-edit-360.png", fullPage: true });
});
