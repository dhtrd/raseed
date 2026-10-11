import { expect, test, type Page } from "@playwright/test";
import { adminDb } from "./cleanup";
import { ENTRY, OWNER } from "./seed";

/** مركز المراجعة على المحاكي: الأقسام الأربعة، والتجاهل بتدقيق، والتراجع. يعيد ما غيّره في النهاية. */
test.describe.configure({ mode: "serial" });

async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

const section = (page: Page, name: RegExp) => page.locator("main").getByRole("region", { name });

test("المالك: الأقسام الأربعة بأسبابها، والتاريخ المرجّح، ورابط من لوحة الأرصدة", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page
    .getByRole("complementary", { name: /ملخص|تنبيهات/ })
    .getByRole("link", { name: "افتح مركز المراجعة" })
    .click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByRole("heading", { name: "مركز المراجعة", level: 1 })).toBeVisible();

  const dates = section(page, /بتواريخ معطوبة/);
  await expect(dates.getByRole("row")).toHaveCount(3); // الرأس + e102 + e107
  const swapped = dates.getByRole("row").filter({ hasText: "الأرجح" });
  await expect(swapped.getByRole("insertion")).toHaveText("07/05/2026");
  await expect(swapped).toContainText("05/07/2026");
  await expect(section(page, /بلا نوع/)).toContainText("وهمي");
  await expect(section(page, /بأسباب أخرى/)).toContainText("طول المرجع 4 (المتوقع 5)");
  // المحلول لا يظهر: قسم المكرر فارغ فيُخفى
  await expect(section(page, /مرجعية مكررة/)).toHaveCount(0);

  // التصفية من الملخص الجانبي
  await page
    .getByRole("complementary", { name: "ملخص المراجعة" })
    .getByRole("button", { name: /بأسباب أخرى/ })
    .click();
  await expect(section(page, /بتواريخ معطوبة/)).toHaveCount(0);
  await expect(section(page, /بأسباب أخرى/)).toBeVisible();
  await page.screenshot({ path: "test-results/review-1440.png", fullPage: true });
});

test("التجاهل بسبب يُغلق السجل ويُسجَّل في التدقيق، والتراجع يعيده", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/review");
  const other = section(page, /بأسباب أخرى/);
  await other.getByRole("button", { name: "تجاهل" }).click();
  const dlg = page.getByRole("dialog", { name: "تجاهل التنبيه" });
  await dlg.getByRole("textbox").fill("المرجع صحيح في نظام المورد");
  await dlg.getByRole("button", { name: "تجاهل التنبيه" }).click();
  await expect(page.getByText(/تجاهلتَ تنبيه .* الصف 14/)).toBeVisible();
  await expect(other).toHaveCount(0);
  const doc = await adminDb().doc("migrationIssues/e103").get();
  expect(doc.get("resolved")).toBe(true);
  expect(doc.get("resolution")).toBe("ignored");
  expect(doc.get("resolutionNote")).toBe("المرجع صحيح في نظام المورد");
  const audit = await adminDb()
    .doc(`auditLog/${doc.get("auditId") as string}`)
    .get();
  expect(audit.get("action")).toBe("reviewIgnored");
  expect(audit.get("reason")).toBe("المرجع صحيح في نظام المورد");

  await page.getByRole("button", { name: "تراجع" }).click();
  await expect(page.getByText(/أُعيد فتح سجل/)).toBeVisible();
  await expect(section(page, /بأسباب أخرى/)).toBeVisible();
  expect((await adminDb().doc("migrationIssues/e103").get()).get("resolved")).toBe(false);
});

test("مدخل البيانات: لا تبويب ولا وصول", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await expect(page.getByRole("link", { name: "المراجعة" })).toHaveCount(0);
  await page.goto("/review");
  await expect(page).not.toHaveURL(/\/review$/);
});

test("الجوال: شريط الأقسام والبطاقات بلا تمرير أفقي ولا عنصر أصلي", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/review");
  const chips = page.getByRole("list", { name: "عرض قسم" });
  await chips.getByRole("button", { name: /بلا نوع/ }).click();
  await expect(section(page, /بلا نوع/)).toBeVisible();
  await expect(section(page, /بتواريخ معطوبة/)).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const banned = await page.evaluate(
    () =>
      document.querySelectorAll(
        'select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="date"]',
      ).length,
  );
  expect(banned).toBe(0);
  await page.screenshot({ path: "test-results/review-360.png", fullPage: true });
});

for (const w of [834, 1194]) {
  test(`اللوحي ${w}px: فهرس الأقسام يصفّي، بلا تمرير أفقي`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await loginOk(page, OWNER.email, OWNER.password);
    await page.goto("/review");
    const ix = page.getByRole("complementary", { name: "أقسام المراجعة" });
    await ix.getByRole("button", { name: /تواريخ معطوبة/ }).click();
    await expect(section(page, /بلا نوع/)).toHaveCount(0);
    await expect(section(page, /بتواريخ معطوبة/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/review-${w}.png`, fullPage: true });
  });
}

test.describe("نافذة تعديل الحركة", () => {
  const dlg = (page: Page) => page.getByRole("dialog", { name: "تعديل الحركة" });

  test("تاريخ مستقبلي: السبب إلزامي، والقيد ينتقل إلى رقم شهره الجديد، وتمت المراجعة بخيار صريح", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginOk(page, OWNER.email, OWNER.password);
    await page.goto("/review");
    const row = section(page, /بتواريخ معطوبة/)
      .getByRole("row")
      .filter({ hasText: "بلا ترجيح" });
    await row.getByRole("button", { name: "تعديل" }).click();
    const d = dlg(page);
    await expect(d).toContainText("MISC/2026/10/0502");
    const date = d.getByRole("textbox", { name: /^التاريخ/ });
    await date.fill("060926");
    await date.press("Tab");
    await expect(d.getByRole("list", { name: "التغييرات" })).toContainText("MISC/2026/09/0502");
    // بلا سبب لا يُحفظ
    await d.getByRole("button", { name: "حفظ التعديل" }).click();
    await expect(d.getByText("اكتب سبب التعديل؛ يُحفظ في سجل التدقيق.")).toBeVisible();
    await d.getByRole("textbox", { name: /سبب التعديل/ }).fill("التاريخ مستقبلي خطأً في الإكسل");
    await d.getByRole("checkbox", { name: /تمت المراجعة/ }).click();
    await page.screenshot({ path: "test-results/edit-1440.png", fullPage: true });
    await d.getByRole("button", { name: "حفظ التعديل" }).click();
    await expect(page.getByText(/حُفظ تعديل حركة .* وأُغلق سجل المراجعة/)).toBeVisible();
    await expect(d).toBeHidden();

    const db = adminDb();
    const e = await db.doc("entries/e107").get();
    expect(e.get("date")).toBe("2026-09-06");
    expect(e.get("refNo")).toBe("MISC/2026/09/0502");
    expect(e.get("needsManualFix")).toBe(false);
    expect((await db.doc("refs/MISC|2026|09|0502").get()).get("ids")).toEqual(["e107"]);
    const old = await db.doc("refs/MISC|2026|10|0502").get();
    expect(old.exists ? (old.get("ids") as string[]).includes("e107") : false).toBe(false);
    const issue = await db.doc("migrationIssues/e107").get();
    expect(issue.get("resolution")).toBe("fixed");
    const audit = await db.doc(`auditLog/${e.get("auditId") as string}`).get();
    expect(audit.get("action")).toBe("update");
    expect(audit.get("reason")).toBe("التاريخ مستقبلي خطأً في الإكسل");
    expect(audit.get("after")).toMatchObject({ date: "2026-09-06", refNo: "MISC/2026/09/0502" });
  });

  test("بلا نوع: يُصنَّف فاتورة، ويبقى سجل المراجعة مفتوحاً ما لم يُختر صراحة", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginOk(page, OWNER.email, OWNER.password);
    await page.goto("/review");
    await section(page, /بلا نوع/)
      .getByRole("button", { name: "تعديل" })
      .click();
    const d = dlg(page);
    await d.getByRole("radio", { name: "فاتورة" }).click();
    const ref = d.getByRole("textbox", { name: /المرجع الرئيسي/ });
    await ref.fill("10010");
    await ref.press("Tab");
    await d.getByRole("textbox", { name: /سبب التعديل/ }).fill("تصنيف حركة منقولة");
    await d.getByRole("button", { name: "حفظ التعديل" }).click();
    await expect(page.getByText(/حُفظ تعديل حركة .*P10010.* وسُجّل في التدقيق\.$/)).toBeVisible();
    const e = await adminDb().doc("entries/e108").get();
    expect(e.get("kind")).toBe("inv");
    expect(e.get("refNo")).toBe("P10010");
    expect(e.get("credit")).toBe(5025);
    expect((await adminDb().doc("migrationIssues/e108").get()).get("resolved")).toBe(false);
  });

  test("الفترة المقفلة: المرجّح داخلها يُرفض بوضوح قبل الإرسال", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginOk(page, OWNER.email, OWNER.password);
    await page.goto("/review");
    const row = section(page, /بتواريخ معطوبة/)
      .getByRole("row")
      .filter({ hasText: "الأرجح" });
    await row.getByRole("button", { name: "تعديل" }).click();
    const d = dlg(page);
    await d.getByRole("button", { name: /استعمال المرجّح 07\/05\/2026/ }).click();
    await d.getByRole("textbox", { name: /سبب التعديل/ }).fill("تاريخ مقلوب");
    await d.getByRole("button", { name: "حفظ التعديل" }).click();
    await expect(d.getByText(/الفترة مقفلة حتى 30\/06\/2026/).first()).toBeVisible();
    expect((await adminDb().doc("entries/e102").get()).get("date")).toBe("2026-07-05");
    await d.getByRole("button", { name: "إلغاء" }).click();
    await expect(d).toBeHidden();
  });

  test("الجوال: لوحة سفلية بلا تمرير أفقي ولا عنصر أصلي", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await loginOk(page, OWNER.email, OWNER.password);
    await page.goto("/review");
    await page
      .getByRole("list", { name: "عرض قسم" })
      .getByRole("button", { name: /تواريخ/ })
      .click();
    await section(page, /بتواريخ معطوبة/)
      .getByRole("button", { name: "تعديل" })
      .first()
      .click();
    await expect(dlg(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const banned = await page.evaluate(
      () =>
        document.querySelectorAll(
          'select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="date"]',
        ).length,
    );
    expect(banned).toBe(0);
    await page.screenshot({ path: "test-results/edit-360.png" });
  });
});
