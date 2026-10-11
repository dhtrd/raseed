import { expect, test, type Page } from "@playwright/test";
import { adminDb, removeCreatedEntries } from "./cleanup";
import { OWNER } from "./seed";

/** الإدخال السريع على المحاكي. يعمل بعد ملفات الأرصدة، ويحذف ما أنشأه في النهاية. */
test.describe.configure({ mode: "serial" });
test.afterAll(removeCreatedEntries);

async function loginOk(page: Page) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(OWNER.email);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(OWNER.password);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

const grid = (page: Page) => page.getByRole("table", { name: "صفوف الدفعة" });
const cell = (page: Page, label: string, row: number) =>
  grid(page).getByRole("textbox", { name: `${label} الصف ${row}`, exact: true });

async function openQuick(page: Page, sid: string) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginOk(page);
  await page.goto(`/quick/${sid}`);
  await expect(page.getByRole("heading", { name: "الإدخال السريع", level: 1 })).toBeVisible();
  await expect(cell(page, "التاريخ", 1)).toBeEnabled();
}

test("المتتابع بلوحة المفاتيح: 7 صفوف، المرجع يتسلسل، والحفظ على جزأين", async ({ page }) => {
  await openQuick(page, "s4");
  await cell(page, "التاريخ", 1).click();
  await page.keyboard.type("101026");
  await page.keyboard.press("Enter");
  await page.keyboard.type("40001");
  for (let n = 1; n <= 7; n++) {
    if (n > 1) {
      await expect(cell(page, "التاريخ", n)).toBeFocused();
      await expect(cell(page, "التاريخ", n)).toHaveValue("10/10/2026");
      await page.keyboard.press("Enter"); // التاريخ موروث
      await expect(cell(page, "المرجع", n)).toHaveValue(String(40000 + n));
    }
    await page.keyboard.press("Enter"); // المرجع
    await page.keyboard.press("Enter"); // السند
    await page.keyboard.type(`فاتورة ${n}`);
    await page.keyboard.press("Enter");
    await page.keyboard.type(`${n}00`);
    await page.keyboard.press("Enter"); // آخر خانة: صف جديد
  }
  await expect(page.getByText(/^7 صف في الدفعة/)).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(page.getByText("حُفظت 7 حركة للمورد المورد (د)، وسُجّلت كلها في التدقيق.")).toBeVisible();
  const saved = await adminDb().collection("entries").where("supplierId", "==", "s4").get();
  expect(saved.docs.map((d) => d.get("mainRef") as string).sort()).toEqual([
    "40001",
    "40002",
    "40003",
    "40004",
    "40005",
    "40006",
    "40007",
  ]);
  expect(saved.docs.find((d) => d.get("mainRef") === "40003")?.get("credit")).toBe(30000);
  // الصف الجديد بعد الحفظ يقترح التالي من المحفوظ
  await expect(cell(page, "المرجع", 1)).toHaveValue("40008");
  await page.screenshot({ path: "test-results/quick-1440.png", fullPage: true });
});

test("اللصق من الإكسل: معاينة، خطأ يوقف الحفظ كله، وتكرار يُؤكَّد بسبب", async ({ page }) => {
  await openQuick(page, "s4");
  await page.getByRole("radio", { name: "3. اللصق من الإكسل" }).click();
  const text = [
    "11/10/2026\t40050\t1,250.50\tفاتورة ملصوقة\tفاتورة",
    "11/10/2026\t20001\t300\tرقم مسجل عند مورد آخر\tف",
    "11/10/2026\t40052\t90\tنوع خاطئ\tشيك",
  ].join("\n");
  await page.locator("#pasteZone").focus();
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    document
      .querySelector("#pasteZone")
      ?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
  await expect(page.getByRole("heading", { name: "معاينة قبل النقل إلى الدفعة" })).toBeVisible();
  await expect(page.getByText(/النوع «شيك» غير معروف/)).toBeVisible();
  await expect(page.getByText("⚠ مسجّل لـ المورد (ب)")).toBeVisible();
  await page.getByRole("button", { name: /نقل إلى الدفعة للمراجعة/ }).click();
  await page.keyboard.press("Control+s");
  await expect(page.getByText(/لم يُحفظ شيء\. 1 صف فيه أخطاء\. 1 صف مكرر/)).toBeVisible();
  await page.getByRole("button", { name: "حذف الصف 3" }).click();
  await grid(page).getByRole("checkbox", { name: "أؤكد أنها حركة مختلفة" }).click();
  await grid(page)
    .getByRole("textbox", { name: "سبب تأكيد التكرار الصف 2" })
    .fill("رقم المورد نفسه في نظامه");
  await page.getByRole("button", { name: /حفظ الدفعة/ }).click();
  await expect(page.getByText("حُفظت 2 حركة للمورد المورد (د)، وسُجّلت كلها في التدقيق.")).toBeVisible();
  const dup = await adminDb()
    .collection("entries")
    .where("refNo", "==", "P20001")
    .where("supplierId", "==", "s4")
    .get();
  expect(dup.docs[0]?.get("dup")).toEqual({ reason: "رقم المورد نفسه في نظامه" });
});

test("التعبئة التسلسلية للصفوف المحددة", async ({ page }) => {
  await openQuick(page, "s5");
  await page.getByRole("radio", { name: "2. التعبئة التسلسلية" }).click();
  await page.getByRole("button", { name: "إضافة 5 صفوف فارغة" }).click();
  await grid(page).getByRole("checkbox", { name: "تحديد الصف 2" }).click();
  await grid(page)
    .getByRole("checkbox", { name: "تحديد الصف 4" })
    .click({ modifiers: ["Shift"] });
  await page.getByRole("textbox", { name: "ابدأ التسلسل من" }).fill("50100");
  await page.getByRole("button", { name: /تعبئة المراجع للصفوف المحددة/ }).click();
  await expect(cell(page, "المرجع", 2)).toHaveValue("50100");
  await expect(cell(page, "المرجع", 3)).toHaveValue("50101");
  await expect(cell(page, "المرجع", 4)).toHaveValue("50102");
  // الصف الخامس مقترح فيكمل من آخر رقم
  await expect(cell(page, "المرجع", 5)).toHaveValue("50103");
});

test("الجوال: خطوة لكل صف، ثم مراجعة وحفظ، بلا تمرير أفقي ولا عنصر أصلي", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page);
  await page.goto("/quick/s5");
  const card = page.getByRole("region", { name: "الإدخال السريع على الجوال" });
  await expect(card.getByRole("heading", { name: "الصف 1 من 1" })).toBeVisible();
  await expect(grid(page)).toHaveCount(0);
  // التعبئة التسلسلية مخفية على الجوال (DECISIONS 2026-10-11)
  await expect(page.getByRole("radio", { name: "2. التعبئة التسلسلية" })).toHaveCount(0);

  await card.getByRole("textbox", { name: "التاريخ الصف 1" }).fill("101026");
  await card.getByRole("textbox", { name: "المرجع الصف 1" }).fill("50001");
  await card.getByRole("textbox", { name: "دائن الصف 1" }).click();
  await page.keyboard.type("250");
  await card.getByRole("textbox", { name: "التفاصيل الصف 1" }).fill("فاتورة من الجوال");
  await card.getByRole("button", { name: "التالي (صف جديد)" }).click();

  await expect(card.getByRole("heading", { name: "الصف 2 من 2" })).toBeVisible();
  await expect(card.getByRole("textbox", { name: "التاريخ الصف 2" })).toHaveValue("10/10/2026");
  await expect(card.getByRole("textbox", { name: "المرجع الصف 2" })).toHaveValue("50002");
  await expect(card.getByRole("textbox", { name: "دائن الصف 2" })).toBeFocused();
  await page.keyboard.type("75.5");
  await page.screenshot({ path: "test-results/quick-360-step.png", fullPage: true });

  await card.getByRole("button", { name: "مراجعة وحفظ" }).click();
  await expect(card.getByRole("heading", { name: "مراجعة الدفعة" })).toBeVisible();
  const list = card.getByRole("list", { name: "صفوف الدفعة للمراجعة" });
  await expect(list.getByRole("button")).toHaveCount(2);
  await expect(list.getByRole("button", { name: /الصف 2: P50002، ✓ جاهز/ })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const banned = await page.evaluate(
    () =>
      document.querySelectorAll(
        'select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="date"]',
      ).length,
  );
  expect(banned).toBe(0);
  await page.screenshot({ path: "test-results/quick-360-review.png", fullPage: true });

  // الرجوع من المراجعة إلى صف بعينه
  await list.getByRole("button", { name: /الصف 1:/ }).click();
  await expect(card.getByRole("heading", { name: "الصف 1 من 2" })).toBeVisible();
  await card.getByRole("button", { name: "مراجعة وحفظ" }).click();

  await card.getByRole("button", { name: "حفظ الدفعة (2)" }).click();
  await expect(card.getByText(/^حُفظت 2 حركة للمورد/)).toBeVisible();
  await expect(card.getByRole("heading", { name: "الصف 1 من 1" })).toBeVisible();
  await expect(card.getByRole("textbox", { name: "المرجع الصف 1" })).toHaveValue("50003");
  const saved = await adminDb().collection("entries").where("supplierId", "==", "s5").get();
  const mine = saved.docs.filter((x) => ["50001", "50002"].includes(x.get("mainRef") as string));
  expect(mine.map((x) => x.get("credit") as number).sort((a, b) => a - b)).toEqual([7550, 25000]);
});
