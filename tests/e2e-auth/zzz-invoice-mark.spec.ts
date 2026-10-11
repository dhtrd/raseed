import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./cleanup";
import { ADMIN, ENTRY, OWNER } from "./seed";

/** زر «دخلت ✓» أمام كل فاتورة لم تدخل (طلب المستخدم 2026-10-11). يعيد حالة الفاتورة في النهاية. */
test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await adminDb()
    .doc("entries/e103")
    .update({ odoo: { entered: false } });
  await adminDb()
    .doc("entries/e101")
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
  // المبلغ تحت كل عدّاد: الإجمالي = دخلت + لم تدخل (المرتجع يُطرح)؛ حركات الاختبارات السابقة تغيّر المبالغ
  const money = async (label: string) =>
    Number(((await page.getByLabel(label).textContent()) ?? "").replace(/[^\d.-]/g, ""));
  await expect(page.getByLabel("المبلغ الإجمالي")).toContainText(".");
  const [total0, in0, out0] = [
    await money("المبلغ الإجمالي"),
    await money("مبلغ ما دخلت"),
    await money("مبلغ ما لم تدخل"),
  ];
  expect(Math.round((in0 + out0) * 100)).toBe(Math.round(total0 * 100));
  // المقفلة (يونيو): للمالك زر الاستثناء بدل الزر العادي
  await expect(
    page.getByRole("button", { name: "تحديد P10001 كـدخلت باستثناء الفترة المقفلة" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "تحديد P10002 كـدخلت" }).click();
  await expect(page.getByText("حُددت P10002 كـ«دخلت» وسُجّل التغيير في التدقيق.")).toBeVisible();
  await expect(page.getByRole("button", { name: "تحديد P10002 كـدخلت" })).toHaveCount(0);
  await expect
    .poll(async () => Math.round((await money("مبلغ ما دخلت")) * 100))
    .toBe(Math.round((in0 + 2500.5) * 100));
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

test("المالك: استثناء الفترة المقفلة بسبب إلزامي، ووسم «استثناء» على الفاتورة", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/invoices/s1");
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  await page.getByRole("button", { name: "تحديد P10001 كـدخلت باستثناء الفترة المقفلة" }).click();
  const d = page.getByRole("dialog", { name: "استثناء الفترة المقفلة" });
  await expect(d).toContainText("P10001");
  await d.getByRole("button", { name: "تطبيق الاستثناء" }).click();
  await expect(d.getByText(/اكتب سبب الاستثناء/)).toBeVisible();
  await d.getByRole("textbox", { name: /سبب الاستثناء/ }).fill("أُدخلت في Odoo قبل الإقفال ولم تُعلَّم");
  await page.screenshot({ path: "test-results/odoo-lock-1440.png" });
  await d.getByRole("button", { name: "تطبيق الاستثناء" }).click();
  await expect(page.getByText("حُددت 1 فاتورة مقفلة كـ«دخلت» باستثناء مسجّل في التدقيق.")).toBeVisible();
  const row = page.locator("main tbody tr").filter({ hasText: "P10001" }).first();
  await expect(row).toContainText("دخلت");
  await expect(row).toContainText("استثناء");
  const e = await adminDb().doc("entries/e101").get();
  expect(e.get("odoo.entered")).toBe(true);
  expect(e.get("odoo.lockReason")).toBe("أُدخلت في Odoo قبل الإقفال ولم تُعلَّم");
  const audit = await adminDb()
    .doc(`auditLog/${e.get("auditId") as string}`)
    .get();
  expect(audit.get("action")).toBe("odooEnteredLocked");
  expect(audit.get("reason")).toContain("استثناء الفترة المقفلة");

  // الإرجاع الجماعي: المقفلة لا تتغير، ثم رابط «تغيير المقفلة باستثناء» بسبب واحد
  await page.getByRole("checkbox", { name: "تحديد الفاتورة P10001" }).click();
  await page.getByRole("button", { name: "إرجاع إلى «لم تدخل»" }).first().click();
  const rd = page.getByRole("dialog");
  await rd.getByRole("radio", { name: /حُددت بالخطأ/ }).click();
  await rd.getByRole("button", { name: "إرجاع إلى «لم تدخل»" }).click();
  await expect(page.getByText(/فاتورة في فترة مقفلة .* لم تتغير: P10001/)).toBeVisible();
  await page.getByRole("button", { name: /تغيير المقفلة باستثناء \(1\)/ }).click();
  await d.getByRole("textbox", { name: /سبب الاستثناء/ }).fill("تصحيح تحديد خاطئ");
  await d.getByRole("button", { name: "تطبيق الاستثناء" }).click();
  await expect(
    page.getByText("أُرجعت 1 فاتورة مقفلة إلى «لم تدخل» باستثناء مسجّل في التدقيق."),
  ).toBeVisible();
  const back = await adminDb().doc("entries/e101").get();
  expect([back.get("odoo.entered"), back.get("odoo.lockReason")]).toEqual([false, "تصحيح تحديد خاطئ"]);
});

test("الإدارة: الفاتورة المقفلة معطّلة بلا استثناء", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ADMIN.email, ADMIN.password);
  await page.goto("/invoices/s1");
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  await expect(page.getByRole("button", { name: "تحديد P10001 كـدخلت (فترة مقفلة)" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /باستثناء الفترة المقفلة/ })).toHaveCount(0);
});
