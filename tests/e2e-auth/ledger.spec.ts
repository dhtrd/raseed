import { expect, test, type Page } from "@playwright/test";
import { ENTRY, OWNER } from "./seed";

/**
 * الأرصدة والكشف على بيانات seed.ts الوهمية. الأرقام المتوقعة محسوبة يدوياً (لا من كود التطبيق):
 * الربع 4/2026 — (أ) سابق 0.00، مدين 1,500.00، دائن 2,550.75، نهائي -1,050.75 ·
 * (ب) -4,000.00 / 1,500.00 / 200.00 / -2,700.00 · الإجمالي -3,910.01 / 3,000.00 / 3,500.75 / -4,410.76
 */
async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/** الفترة مخصصة 01/10/2026–31/12/2026 كي لا يعتمد الاختبار على تاريخ تشغيله. */
async function pickQ4(page: Page) {
  await page.getByRole("radio", { name: "مخصص" }).click();
  const from = page.getByRole("textbox", { name: /^من/ });
  await from.fill("011026");
  await from.press("Tab");
  const to = page.getByRole("textbox", { name: /^إلى/ });
  await to.fill("311226");
  await to.press("Tab");
  await expect(page.getByText("من 01/10/2026 إلى 31/12/2026").first()).toBeVisible();
}

const rowOf = (page: Page, name: string | RegExp) =>
  page.locator("tr", { has: page.getByRole("rowheader", { name }) });

test("لوحة الأرصدة للمالك: الأرقام والإجمالي والتنبيهات والإحصاءات", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await expect(page.getByRole("heading", { name: "أرصدة الموردين" })).toBeVisible();
  await pickQ4(page);
  const a = rowOf(page, /المورد \(أ\)/).locator("td");
  await expect(a).toHaveText(["0.00", "1,500.00", "2,550.75", /-1,050.75/]);
  await expect(rowOf(page, /المورد \(ب\)/).locator("td")).toHaveText([
    "-4,000.00",
    "1,500.00",
    "200.00",
    /-2,700.00/,
  ]);
  // المؤرشف داخل الإجمالي ومعلَّم، والمحذوف ناعماً خارجه
  await expect(rowOf(page, /المورد \(ق\)/)).toContainText("مؤرشف");
  await expect(page.locator("tfoot td")).toHaveText(["-3,910.01", "3,000.00", "3,500.75", "-4,410.76"]);
  const side = page.getByRole("complementary", { name: "ملخص الدفتر" });
  await expect(side.getByText("تاريخاً معطوباً أو مقلوباً")).toBeVisible();
  await expect(side.locator("li").filter({ hasText: "سجلاً بلا نوع" })).toContainText("1");
  await expect(side.locator("li").filter({ hasText: "مكررة" })).toContainText("0");
  await expect(side.locator("dl div").filter({ hasText: "الحركات" })).toContainText("13");
  await page.screenshot({ path: "test-results/dashboard-1440.png", fullPage: true });
});

test("ترتيب الأعمدة: النهائي تصاعدياً يضع الأكثر استحقاقاً أولاً", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await pickQ4(page);
  const final = page.getByRole("columnheader", { name: /الرصيد النهائي/ });
  await final.getByRole("button").click();
  await expect(final).toHaveAttribute("aria-sort", "descending");
  await final.getByRole("button").click();
  await expect(final).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator("tbody tr").first()).toContainText("المورد (ب)");
});

test("كشف المورد: الرصيد الجاري، الأحدث أولاً، الوسوم، والفترة برصيد افتتاحي", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.getByRole("link", { name: "المورد (أ)" }).click();
  await expect(page).toHaveURL(/\/statement\/s1$/);
  await expect(page.getByRole("heading", { name: "المورد (أ)", level: 1 })).toBeVisible();
  const body = page.locator("tbody tr");
  await expect(body).toHaveCount(7); // المحذوف ناعماً لا يظهر
  await expect(body.first()).toContainText("07/10/2026");
  await expect(body.first().locator("td").last()).toHaveText("-1,050.75");
  await expect(body.last().locator("td").last()).toHaveText("-1,000.00");
  await expect(page.getByText("مرتجع", { exact: true })).toBeVisible();
  await expect(page.getByText("بلا نوع", { exact: true })).toBeVisible();
  await expect(page.locator("tbody").getByText("للمراجعة", { exact: true })).toHaveCount(2);
  await expect(page.getByText("اتصال لتأكيد موعد التوريد")).toBeVisible();
  await expect(page.locator("tfoot td").last()).toHaveText("-1,050.75");

  // التاريخ تصاعدياً: الأقدم أولاً والرصيد نفسه لكل حركة
  await page
    .getByRole("columnheader", { name: /التاريخ/ })
    .getByRole("button")
    .click();
  await expect(body.first()).toContainText("20/06/2026");

  await page.getByRole("radio", { name: "فترة" }).click();
  await pickQ4(page);
  await expect(page.getByText(/الرصيد الافتتاحي قبل/)).toContainText("0.00");
  await expect(body).toHaveCount(5);
  await expect(page.getByText("الرصيد الختامي للفترة").first()).toBeVisible();
  await expect(page.locator("tfoot td").last()).toHaveText("-1,050.75");
  await page.screenshot({ path: "test-results/statement-1440.png", fullPage: true });
});

test("مدخل البيانات: موردوه المسندون فقط، بلا تنبيهات المراجعة، ولا يفتح كشف غيرهم", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await pickQ4(page);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    rowOf(page, /المورد \(ب\)/)
      .locator("td")
      .last(),
  ).toContainText("-2,700.00");
  await expect(page.getByText("تنبيهات المراجعة")).toHaveCount(0);
  await page.goto("/statement/s1");
  await expect(page.getByText("هذا المورد غير موجود أو غير مسند إليك.")).toBeVisible();
  await page.goto("/statement/s2");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.getByText("استرداد", { exact: true })).toBeVisible();
});

for (const w of [360, 834, 1194]) {
  test(`بلا تمرير أفقي ولا عنصر أصلي عند ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await loginOk(page, OWNER.email, OWNER.password);
    for (const [path, ready] of [
      ["/", "الإجمالي"],
      ["/statement/s1", "الرصيد الكلي"],
    ] as const) {
      await page.goto(path);
      // على اللوحي الأفقي يُخفى جدول الأرصدة ويظهر الإجمالي في الفهرس (حساب T)
      await expect(
        page.locator("tfoot th:visible, aside button:visible").filter({ hasText: ready }).first(),
      ).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const banned = await page.evaluate(
        () =>
          document.querySelectorAll(
            'select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="date"]',
          ).length,
      );
      expect(banned).toBe(0);
      await page.screenshot({
        path: `test-results/${path === "/" ? "dashboard" : "statement"}-${w}.png`,
        fullPage: true,
      });
    }
  });
}

test("الجوال: «ترتيب حسب» بشرائح بدل رؤوس الأعمدة", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/statement/s1");
  await expect(page.getByRole("columnheader")).toHaveCount(0);
  const sort = page.getByRole("group", { name: "ترتيب حسب" });
  await sort.getByRole("button", { name: /التاريخ/ }).click();
  await expect(sort.getByRole("button", { name: "التاريخ، تصاعدي" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("20/06/2026");
});
