import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./cleanup";
import { ENTRY, OWNER } from "./seed";

/** إدارة الموردين (الخيار ب: «+ مورد جديد» في الفهرس، وقائمة «⋯» في رأس الكشف) على المحاكي بالقواعد الحقيقية. */
test.describe.configure({ mode: "serial" });

const NEW = "مؤسسة التجربة للتوريد";
const RENAMED = "مؤسسة التجربة للتوريد الحديثة";

// يُحذف المورد المضاف كي لا يغيّر أعداد الاختبارات التالية
test.afterAll(async () => {
  const db = adminDb();
  const snap = await db.collection("suppliers").get();
  await Promise.all(
    snap.docs.filter((d) => String(d.get("name")).startsWith("مؤسسة التجربة")).map((d) => d.ref.delete()),
  );
});

async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("المالك: إضافة مورد بفحص التكرار، ثم تعديل الاسم والأرشفة وإعادة التنشيط بتدقيق", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/statement/s3");
  await page.getByRole("button", { name: "+ مورد جديد" }).locator("visible=true").click();
  const d = page.getByRole("dialog", { name: "مورد جديد" });
  await d.getByRole("button", { name: "إضافة المورد" }).click();
  await expect(d.getByText("اكتب اسم المورد.")).toBeVisible();
  // المطابق بعد توحيد الهمزات والمسافات ممنوع
  await d.getByRole("textbox", { name: /اسم المورد/ }).fill("المورد  (ج)");
  await d.getByRole("button", { name: "إضافة المورد" }).click();
  await expect(d.getByText(/يوجد مورد بهذا الاسم: «المورد \(ج\)»/)).toBeVisible();
  await d.getByRole("textbox", { name: /اسم المورد/ }).fill(NEW);
  await page.screenshot({ path: "test-results/suppliers-add-1440.png" });
  await d.getByRole("button", { name: "إضافة المورد" }).click();

  await expect(page.getByRole("heading", { level: 1, name: NEW })).toBeVisible();
  await expect(page).toHaveURL(/\/statement\/[A-Za-z0-9]{20}$/);
  const id = page.url().split("/").pop() ?? "";
  const doc = await adminDb().doc(`suppliers/${id}`).get();
  expect([doc.get("name"), doc.get("status")]).toEqual([NEW, "active"]);
  expect(
    (
      await adminDb()
        .doc(`auditLog/${doc.get("auditId") as string}`)
        .get()
    ).get("action"),
  ).toBe("create");

  await page.getByRole("button", { name: `إجراءات المورد ${NEW}` }).click();
  await page.getByRole("menuitem", { name: "تعديل الاسم" }).click();
  const r = page.getByRole("dialog", { name: "تعديل اسم المورد" });
  await r.getByRole("textbox", { name: /اسم المورد/ }).fill(RENAMED);
  await r.getByRole("button", { name: "حفظ الاسم" }).click();
  await expect(page.getByText(`عُدّل الاسم من «${NEW}» إلى «${RENAMED}» وسُجّل في التدقيق.`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: RENAMED })).toBeVisible();
  const ren = await adminDb().doc(`suppliers/${id}`).get();
  expect(
    (
      await adminDb()
        .doc(`auditLog/${ren.get("auditId") as string}`)
        .get()
    ).get("before"),
  ).toEqual({
    name: NEW,
  });

  await page.getByRole("button", { name: `إجراءات المورد ${RENAMED}` }).click();
  await page.getByRole("menuitem", { name: "أرشفة المورد" }).click();
  await page.getByRole("dialog", { name: "أرشفة المورد" }).getByRole("button", { name: "أرشفة" }).click();
  await expect(page.locator("main").getByText("مؤرشف", { exact: true })).toBeVisible();
  expect((await adminDb().doc(`suppliers/${id}`).get()).get("status")).toBe("archived");

  await page.getByRole("button", { name: `إجراءات المورد ${RENAMED}` }).click();
  await page.getByRole("menuitem", { name: "إعادة تنشيط المورد" }).click();
  await page
    .getByRole("dialog", { name: "إعادة تنشيط المورد" })
    .getByRole("button", { name: "إعادة التنشيط" })
    .click();
  await expect(page.getByText(`أُعيد تنشيط «${RENAMED}».`)).toBeVisible();
  expect((await adminDb().doc(`suppliers/${id}`).get()).get("status")).toBe("active");
});

test("مدخل البيانات: لا إضافة ولا قائمة إجراءات", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await page.goto("/statement/s2");
  await expect(page.locator("main tbody tr").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "+ مورد جديد" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^إجراءات المورد/ })).toHaveCount(0);
});

test("الجوال: «+ مورد جديد» تحت اختيار المورد، والنافذة لوحة سفلية، بلا تمرير أفقي", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/statement/s1");
  const add = page.getByRole("button", { name: "+ مورد جديد" }).locator("visible=true");
  await expect(add).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await add.click();
  const box = await page.getByRole("dialog", { name: "مورد جديد" }).boundingBox();
  expect(box && Math.round(box.y + box.height)).toBeGreaterThanOrEqual(770);
  await page.screenshot({ path: "test-results/suppliers-360.png" });
});
