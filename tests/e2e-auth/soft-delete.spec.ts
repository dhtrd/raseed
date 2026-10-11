import { expect, test, type Page } from "@playwright/test";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./cleanup";
import { ADMIN, OWNER } from "./seed";

/** الحذف الناعم والاسترجاع (الخيار أ: داخل نافذة التعديل، والاسترجاع من الكشف) على المحاكي بالقواعد الحقيقية. */
test.describe.configure({ mode: "serial" });

const REF = "MISC|2026|08|0701";

async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

const row = (page: Page) => page.locator("main tbody tr").filter({ hasText: "MISC/2026/08/0701" });
const balance = (page: Page) => page.locator("main tfoot tr");

// إعادة e501 كما زُرعت لبقية الاختبارات أياً كانت النتيجة
test.afterAll(async () => {
  const db = adminDb();
  await db
    .doc("entries/e501")
    .update({ deleted: false, deletion: FieldValue.delete(), dup: FieldValue.delete() });
  await db.doc(`refs/${REF}`).set({
    ids: ["e501"],
    places: [{ entryId: "e501", supplierId: "s5", supplierName: "المورد (هـ)" }],
  });
});

test("المالك: الحذف من نافذة التعديل بسبب إلزامي، ثم الاسترجاع من الكشف", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/statement/s5");
  await expect(balance(page)).toContainText("99.99");

  await page.locator("main").getByRole("button", { name: "تعديل الحركة MISC/2026/08/0701" }).click();
  await page
    .getByRole("dialog", { name: "تعديل الحركة" })
    .getByRole("button", { name: "حذف الحركة" })
    .click();
  const d = page.getByRole("dialog", { name: "حذف الحركة" });
  await expect(d).toContainText("رصيد المورد ينقص بـ 99.99");
  await d.getByRole("button", { name: "حذف", exact: true }).click();
  await expect(d.getByText("اكتب سبب الحذف: يُحفظ في سجل التدقيق.")).toBeVisible();
  await d.getByRole("button", { name: "حركة ملغاة" }).click();
  await expect(d.getByRole("textbox", { name: /سبب الحذف/ })).toHaveValue("حركة ملغاة");
  await page.screenshot({ path: "test-results/soft-delete-1440.png" });
  await d.getByRole("button", { name: "حذف", exact: true }).click();

  await expect(page.getByText(/حُذفت حركة MISC\/2026\/08\/0701 وخرجت من الرصيد/)).toBeVisible();
  await expect(row(page)).toHaveCount(0);
  await expect(balance(page)).toContainText("0.00");
  const e = await adminDb().doc("entries/e501").get();
  expect(e.get("deleted")).toBe(true);
  expect(e.get("deletion.reason")).toBe("حركة ملغاة");
  expect((await adminDb().doc(`refs/${REF}`).get()).get("ids")).toEqual([]);
  const audit = await adminDb()
    .doc(`auditLog/${e.get("auditId") as string}`)
    .get();
  expect([audit.get("action"), audit.get("reason")]).toEqual(["delete", "حركة ملغاة"]);

  // الاسترجاع: «إظهار المحذوف» ثم «استرجاع» بسبب إلزامي
  await page.getByRole("checkbox", { name: /إظهار المحذوف/ }).click();
  await expect(row(page)).toContainText("محذوف");
  await expect(row(page)).toContainText("حُذفت: حركة ملغاة");
  await row(page).getByRole("button", { name: "استرجاع الحركة MISC/2026/08/0701" }).click();
  const r = page.getByRole("dialog", { name: "استرجاع الحركة" });
  await r.getByRole("textbox", { name: /سبب الاسترجاع/ }).fill("حُذفت بالخطأ");
  await r.getByRole("button", { name: "استرجاع", exact: true }).click();
  await expect(page.getByText(/استُرجعت حركة MISC\/2026\/08\/0701 وعادت إلى الرصيد/)).toBeVisible();
  await expect(row(page)).not.toContainText("محذوف");
  await expect(balance(page)).toContainText("99.99");
  const back = await adminDb().doc("entries/e501").get();
  expect([back.get("deleted"), back.get("deletion")]).toEqual([false, undefined]);
  expect((await adminDb().doc(`refs/${REF}`).get()).get("ids")).toEqual(["e501"]);
});

test("الإدارة: ترى المحذوف ولا تحذف ولا تسترجع", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ADMIN.email, ADMIN.password);
  await page.goto("/statement/s1");
  await page.getByRole("checkbox", { name: /إظهار المحذوف/ }).click();
  const gone = page.locator("main tbody tr").filter({ hasText: "P10009" });
  await expect(gone).toContainText("محذوف");
  await expect(page.getByRole("button", { name: /^استرجاع الحركة/ })).toHaveCount(0);
  await page.locator("main").getByRole("button", { name: "تعديل الحركة P10002" }).click();
  const d = page.getByRole("dialog", { name: "تعديل الحركة" });
  await expect(d.getByRole("button", { name: "حذف الحركة" })).toHaveCount(0);
});

test("الجوال: الحذف لوحة سفلية، والمحذوف بزر الاسترجاع في الزاوية، بلا تمرير أفقي", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/statement/s1");
  await page.getByRole("checkbox", { name: /إظهار المحذوف/ }).click();
  const btn = page.getByRole("button", { name: "استرجاع الحركة P10009" });
  await expect(btn).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await btn.click();
  const r = page.getByRole("dialog", { name: "استرجاع الحركة" });
  const box = await r.boundingBox();
  expect(box && Math.round(box.y + box.height)).toBeGreaterThanOrEqual(770);
  await page.screenshot({ path: "test-results/soft-delete-360.png", fullPage: true });
  await r.getByRole("button", { name: "إلغاء" }).click();
});
