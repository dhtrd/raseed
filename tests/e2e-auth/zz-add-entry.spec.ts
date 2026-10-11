import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ENTRY, OWNER } from "./seed";

/**
 * إضافة حركة على المحاكي بالقواعد الحقيقية. الملف يعمل بعد ملفات الأرصدة (ترتيب أبجدي، عامل واحد)،
 * ويحذف ما أنشأه في النهاية كي لا يتغير شيء لغيره.
 */
test.describe.configure({ mode: "serial" });

function adminDb() {
  if (!getApps().length) initializeApp({ projectId: "demo-raseed" });
  return getFirestore();
}

async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

const form = (page: Page) => page.getByRole("form", { name: "حركة جديدة" });

/** يضغط اختصار النوع بعد اكتمال تحميل النموذج، ويتأكد من التبديل. */
async function pickType(page: Page, key: "2" | "3", label: string) {
  await expect(form(page).getByRole("combobox", { name: /المورد/ })).not.toHaveValue("");
  await expect(form(page).getByRole("radio", { name: /فاتورة/ })).toBeEnabled();
  await page.keyboard.press(`Alt+${key}`);
  await expect(form(page).getByRole("radio", { name: new RegExp(label) })).toBeChecked();
}

test.afterAll(async () => {
  const db = adminDb();
  const made = await db.collection("entries").where("createdBy", "!=", "seed").get();
  for (const d of made.docs) {
    const refNo = d.get("refNo") as string | undefined;
    if (refNo) {
      const ref = db.doc(`refs/${refNo.replace(/\//g, "|")}`);
      const snap = await ref.get();
      const ids = ((snap.get("ids") as string[] | undefined) ?? []).filter((x) => x !== d.id);
      if (!ids.length) await ref.delete();
      else
        await ref.update({
          ids,
          places: ((snap.get("places") as { entryId: string }[]) ?? []).filter((p) => p.entryId !== d.id),
        });
    }
    await d.ref.delete();
  }
});

test("فاتورة بلوحة المفاتيح: المرجع التالي مقترح، وCtrl+S يحفظ وينتقل للكشف", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.getByRole("link", { name: "إضافة حركة" }).click();
  await expect(page.getByRole("heading", { name: "إضافة حركة", level: 1 })).toBeVisible();
  await page.goto("/add/s3");
  const f = form(page);
  await expect(f.getByRole("textbox", { name: /المرجع الرئيسي/ })).toHaveValue("30002");
  const date = f.getByRole("textbox", { name: /^التاريخ/ });
  await date.fill("081026");
  await date.press("Tab");
  await f.getByRole("textbox", { name: "دائن" }).click();
  await page.keyboard.type("1250.5");
  await f.getByRole("textbox", { name: /التفاصيل/ }).fill("فاتورة مشتريات تجريبية");
  await page.keyboard.press("Control+s");
  await expect(page).toHaveURL(/\/statement\/s3$/);
  const row = page.locator("main tbody tr").filter({ hasText: "P30002" });
  await expect(row).toContainText("1,250.50");
  await expect(row).toContainText("08/10/2026");
  const audit = await adminDb().collection("auditLog").where("action", "==", "create").get();
  expect(audit.docs.some((a) => (a.get("after") as { refNo?: string } | undefined)?.refNo === "P30002")).toBe(
    true,
  );
});

test("التحذير الصارم: رقم مكرر يوقف الحفظ حتى التأكيد والسبب، ثم «حفظ وجديد»", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/add/s2");
  const f = form(page);
  await pickType(page, "2", "قيد");
  const date = f.getByRole("textbox", { name: /^التاريخ/ });
  await date.fill("091026");
  await date.press("Tab");
  const ref = f.getByRole("textbox", { name: /المرجع الرئيسي/ });
  await ref.fill("0601");
  await ref.press("Tab");
  const warn = page.getByRole("complementary", { name: "التحقق من التكرار" });
  await expect(warn.getByRole("heading", { name: "تحذير صارم: الرقم المرجعي مكرّر" })).toBeVisible();
  await expect(warn).toContainText("المورد (ب)");
  await page.screenshot({ path: "test-results/add-dup-1440.png", fullPage: true });
  await f.getByRole("textbox", { name: "مدين" }).click();
  await page.keyboard.type("300");
  await page.keyboard.press("Control+s");
  await expect(page.getByText("لم تُحفظ الحركة: صحّح الحقول المعلَّمة بالأحمر.")).toBeVisible();
  await warn.getByRole("checkbox", { name: "أؤكد أنها حركة مختلفة" }).click();
  await warn.getByRole("textbox", { name: /سبب تسجيل رقم مكرر/ }).fill("دفعة ثانية بالمرجع نفسه");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText(/حُفظت قيد MISC\/2026\/10\/0601 للمورد المورد \(ب\)/)).toBeVisible();
  await expect(f.getByRole("textbox", { name: /المرجع الرئيسي/ })).toHaveValue("0602");
  const refs = await adminDb().doc("refs/MISC|2026|10|0601").get();
  expect(refs.get("ids")).toHaveLength(2);
  const dup = await adminDb()
    .collection("entries")
    .where("refNo", "==", "MISC/2026/10/0601")
    .where("createdBy", "!=", "seed")
    .get();
  expect(dup.docs[0]?.get("dup")).toEqual({ reason: "دفعة ثانية بالمرجع نفسه" });
});

test("الفترة المقفلة ترفض التاريخ، والملاحظة تُحفظ بلا مبلغ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/add/s1");
  const f = form(page);
  await pickType(page, "3", "ملاحظة");
  const date = f.getByRole("textbox", { name: /^التاريخ/ });
  await date.fill("200626");
  await date.press("Tab");
  await f.getByRole("textbox", { name: /نص الملاحظة/ }).fill("اتصال بخصوص موعد التوريد القادم");
  await f.getByRole("button", { name: /^حفظ\s*Ctrl\+S/ }).click();
  await expect(f.getByText(/الفترة مقفلة|مقفل/).first()).toBeVisible();
  await date.fill("101026");
  await date.press("Tab");
  await page.keyboard.press("Control+s");
  await expect(page).toHaveURL(/\/statement\/s1$/);
  await expect(page.locator("main").getByText("اتصال بخصوص موعد التوريد القادم")).toBeVisible();
});

test("مدخل البيانات: موردوه فقط، ومورد غير مسند مرفوض", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await page.goto("/add/s1");
  await expect(page.getByText("هذا المورد غير موجود أو مؤرشف أو غير مسند إليك.")).toBeVisible();
  await page.getByRole("combobox", { name: /المورد/ }).click();
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option").first()).toContainText("المورد (ب)");
});

test("الجوال: التحذير يحل محل النموذج، و«رجوع للتعديل» يعيده، بلا تمرير أفقي ولا عنصر أصلي", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  // المورد (ج) بلا قيود، والرقم مسجل عند المورد (ب): الفحص عام لكل الموردين
  await page.goto("/add/s3");
  const f = form(page);
  await pickType(page, "2", "قيد");
  const date = f.getByRole("textbox", { name: /^التاريخ/ });
  await date.fill("091026");
  await date.press("Tab");
  const ref = f.getByRole("textbox", { name: /المرجع الرئيسي/ });
  await ref.fill("0601");
  await ref.press("Tab");
  await expect(page.getByRole("button", { name: "رجوع للتعديل" })).toBeVisible();
  await expect(f).toBeHidden();
  await page.screenshot({ path: "test-results/add-dup-360.png", fullPage: true });
  await page.getByRole("button", { name: "رجوع للتعديل" }).click();
  await expect(f).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const banned = await page.evaluate(
    () =>
      document.querySelectorAll(
        'select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="date"]',
      ).length,
  );
  expect(banned).toBe(0);
  await page.screenshot({ path: "test-results/add-360.png", fullPage: true });
});

for (const w of [834, 1194]) {
  test(`اللوحي ${w}px: الفهرس والتحذير والنموذج بلا تمرير أفقي`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 1000 });
    await loginOk(page, OWNER.email, OWNER.password);
    await page.goto("/add/s1");
    await expect(page.getByRole("link", { name: "المورد (أ)" }).first()).toBeVisible();
    await expect(form(page).getByRole("radio", { name: /فاتورة/ })).toBeEnabled();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/add-${w}.png`, fullPage: true });
  });
}
