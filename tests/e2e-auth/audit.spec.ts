import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./cleanup";
import { ENTRY, OWNER } from "./seed";

const ExcelJS = createRequire(import.meta.url)("exceljs") as typeof import("exceljs");

/** سجل التدقيق (الخيار أ: خط زمني) على المحاكي. السجلات الوهمية تُزرع هنا وتُحذف في النهاية. */
test.describe.configure({ mode: "serial" });

const IDS = ["zz-audit-1", "zz-audit-2", "zz-audit-3"];

async function ownerUid() {
  const snap = await adminDb().collection("users").where("role", "==", "owner").get();
  return snap.docs[0]?.id ?? "";
}

test.beforeAll(async () => {
  const db = adminDb();
  const uid = await ownerUid();
  // أحدث من أي سجل آخر كي تظهر أولاً
  const at = (minAgo: number) => Timestamp.fromMillis(Date.now() + 60_000 - minAgo * 60_000);
  await db.doc(`auditLog/${IDS[0]}`).set({
    actor: uid,
    at: at(1),
    action: "update",
    entity: "entries",
    entityId: "e301",
    before: { credit: 75000, date: "2026-10-01" },
    after: { credit: 70000, date: "2026-10-01" },
    reason: "تصحيح المبلغ حسب الفاتورة الورقية",
  });
  await db.doc(`auditLog/${IDS[1]}`).set({
    actor: uid,
    at: at(2),
    action: "odooEntered",
    entity: "entries",
    entityId: "e301",
    before: { odooEntered: false },
    after: { odooEntered: true },
  });
  await db.doc(`auditLog/${IDS[2]}`).set({
    actor: uid,
    at: at(3),
    action: "lockSet",
    entity: "settings",
    entityId: "lock",
    before: { lockedThrough: "2026-03-31" },
    after: { lockedThrough: "2026-06-30" },
    reason: "إقفال الربع الثاني",
  });
});

test.afterAll(async () => {
  await Promise.all(IDS.map((id) => adminDb().doc(`auditLog/${id}`).delete()));
});

async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("المالك: جمل مقروءة باليوم، و«قبل ← بعد»، والفلترة، والتصدير، ورابط الحركة", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.getByRole("link", { name: "التدقيق", exact: true }).click();
  await expect(page).toHaveURL(/\/audit$/);
  const first = page.locator("main li li").first();
  await expect(first).toContainText("عدّل الحركة P30001 · المورد (ج)");
  await expect(first).toContainText("السبب: «تصحيح المبلغ حسب الفاتورة الورقية»");
  await expect(page.getByRole("heading", { name: /^اليوم/ })).toBeVisible();
  await first.getByRole("button", { name: "قبل ← بعد" }).click();
  await expect(first).toContainText("دائن: 750.00 ← 700.00");
  await expect(first).not.toContainText("التاريخ:");
  await page.screenshot({ path: "test-results/audit-1440.png" });

  await page.getByRole("group", { name: "النوع" }).getByRole("button", { name: "Odoo" }).click();
  await expect(page.locator("main li li").first()).toContainText("حدّد «دخلت Odoo» لـ الفاتورة P30001");
  await page.getByRole("group", { name: "النوع" }).getByRole("button", { name: "الإعدادات والقفل" }).click();
  await expect(page.locator("main li li").first()).toContainText("غيّر تاريخ الإقفال");
  await page.getByRole("group", { name: "النوع" }).getByRole("button", { name: "الكل" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "تصدير Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^سجل-التدقيق-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  expect(wb.getWorksheet("التدقيق")?.getCell("D5").value).toBe("عدّل الحركة P30001 · المورد (ج)");

  await page
    .locator("main li li")
    .first()
    .getByRole("link", { name: /P30001/ })
    .click();
  await expect(page).toHaveURL(/\/statement\/s3$/);
  await expect(page.locator('main tbody tr[data-entry="e301"]')).toBeVisible();
});

test("مدخل البيانات: لا تبويب ولا وصول", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await expect(page.getByRole("link", { name: "التدقيق", exact: true })).toHaveCount(0);
  await page.goto("/audit");
  await expect(page).not.toHaveURL(/\/audit$/);
});

test("الجوال: بلا تمرير أفقي", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/audit");
  await expect(page.locator("main li li").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/audit-360.png", fullPage: true });
});
