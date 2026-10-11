import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ENTRY, OWNER } from "./seed";

// ExcelJS (CommonJS) بمحمّل Node العادي: محمّل Playwright لا يربط اعتمادياته
const ExcelJS = createRequire(import.meta.url)("exceljs") as typeof import("exceljs");

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
  await expect(page.locator("main tfoot td")).toHaveText(["-3,910.01", "3,000.00", "3,500.75", "-4,410.76"]);
  const side = page.getByRole("complementary", { name: "ملخص الدفتر" });
  await expect(side.getByText("تاريخاً معطوباً أو مقلوباً")).toBeVisible();
  await expect(side.locator("li").filter({ hasText: "سجلاً بلا نوع" })).toContainText("1");
  await expect(side.locator("li").filter({ hasText: "مكررة" })).toContainText("0");
  await expect(side.locator("dl div").filter({ hasText: "الحركات" })).toContainText("13");
  await page.screenshot({ path: "test-results/dashboard-1440.png", fullPage: true });
});

test("اسم المورد في اللوحة يفتح كشفه بفترة اللوحة نفسها، و«كل الحركات» يزيلها", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await pickQ4(page);
  await page.locator("main").getByRole("link", { name: "المورد (أ)" }).click();
  await expect(page).toHaveURL(/\/statement\/s1$/);
  await expect(page.getByRole("radio", { name: "فترة" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "مخصص" })).toBeChecked();
  await expect(page.getByRole("textbox", { name: /^من/ })).toHaveValue(/01\/10\/2026/);
  await expect(page.getByRole("textbox", { name: /^إلى/ })).toHaveValue(/31\/12\/2026/);
  await page.getByRole("radio", { name: "كل الحركات" }).click();
  await expect(page.getByRole("radio", { name: "كل الحركات" })).toBeChecked();
  await expect(page.getByRole("textbox", { name: /^من/ })).toHaveCount(0);
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
  await expect(page.locator("main tbody tr").first()).toContainText("المورد (ب)");
});

test("كشف المورد: الرصيد الجاري، الأحدث أولاً، الوسوم، والفترة برصيد افتتاحي", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.getByRole("link", { name: "المورد (أ)" }).click();
  await expect(page).toHaveURL(/\/statement\/s1$/);
  await expect(page.getByRole("heading", { name: "المورد (أ)", level: 1 })).toBeVisible();
  // من اللوحة يُفتح بفترتها (الربع الحالي)؛ «كل الحركات» يزيل الفلترة
  await expect(page.getByRole("radio", { name: "فترة" })).toBeChecked();
  await page.getByRole("radio", { name: "كل الحركات" }).click();
  const body = page.locator("main tbody tr");
  await expect(body).toHaveCount(7); // المحذوف ناعماً لا يظهر
  await expect(body.first()).toContainText("07/10/2026");
  await expect(body.first().locator('td[data-l="الرصيد"]')).toHaveText("-1,050.75");
  await expect(body.last().locator('td[data-l="الرصيد"]')).toHaveText("-1,000.00");
  await expect(page.locator("main").getByText("مرتجع", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByText("بلا نوع", { exact: true })).toBeVisible();
  await expect(page.locator("main tbody").getByText("للمراجعة", { exact: true })).toHaveCount(2);
  await expect(page.locator("main").getByText("اتصال لتأكيد موعد التوريد")).toBeVisible();
  await expect(page.locator("main tfoot td").filter({ hasText: /\d/ }).last()).toHaveText("-1,050.75");

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
  await expect(page.locator("main tfoot td").filter({ hasText: /\d/ }).last()).toHaveText("-1,050.75");
  await page.screenshot({ path: "test-results/statement-1440.png", fullPage: true });
});

test("مدخل البيانات: موردوه المسندون فقط، بلا تنبيهات المراجعة، ولا يفتح كشف غيرهم", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, ENTRY.email, ENTRY.password);
  await pickQ4(page);
  await expect(page.locator("main tbody tr")).toHaveCount(1);
  await expect(
    rowOf(page, /المورد \(ب\)/)
      .locator("td")
      .last(),
  ).toContainText("-2,700.00");
  await expect(page.getByText("تنبيهات المراجعة")).toHaveCount(0);
  await page.goto("/statement/s1");
  await expect(page.getByText("هذا المورد غير موجود أو غير مسند إليك.")).toBeVisible();
  await page.goto("/statement/s2");
  await expect(page.locator("main tbody tr")).toHaveCount(3);
  await expect(page.locator("main").getByText("استرداد", { exact: true })).toBeVisible();
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
        page.locator("main tfoot th:visible, aside button:visible").filter({ hasText: ready }).first(),
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
  await expect(page.locator("main tbody tr").first()).toContainText("20/06/2026");
});

/** كتابة مباشرة في المحاكي (كأن مستخدماً آخر أضاف حركة) لاختبار التحديث التلقائي. */
function adminDb() {
  if (!getApps().length) initializeApp({ projectId: "demo-raseed" });
  return getFirestore();
}

test("الأرصدة تتحدث تلقائياً بعد إضافة حركة وحذفها، دون زر التحديث", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await pickQ4(page);
  const totals = page.locator("main tfoot td");
  await expect(totals.last()).toHaveText("-4,410.76");
  await expect(page.getByText(/^تتحدث تلقائياً/)).toBeVisible();
  const ref = adminDb().doc("entries/e-live");
  await ref.set({
    supplierId: "s3",
    kind: "inv",
    date: "2026-10-10",
    mainRef: "30002",
    refNo: "P30002",
    voucher: "",
    details: "",
    note: "",
    debit: 0,
    credit: 10000,
    reversed: false,
    needsManualFix: false,
    deleted: false,
    odoo: { entered: false },
    auditId: "seed",
    createdBy: "seed",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  try {
    await expect(totals.last()).toHaveText("-4,510.76", { timeout: 15_000 });
    await expect(
      rowOf(page, /المورد \(ج\)/)
        .locator("td")
        .last(),
    ).toContainText("-850.00");
  } finally {
    await ref.delete();
  }
  await expect(totals.last()).toHaveText("-4,410.76", { timeout: 15_000 });
});

test("تصدير الكشف: ملف Excel بالأرقام والمعادلات، ونسخة طباعة A4 بلا «للمراجعة»", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/statement/s1");
  await expect(page.locator("main tfoot td").filter({ hasText: /\d/ }).last()).toHaveText("-1,050.75");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "تصدير Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^كشف-المورد \(أ\)-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  const ws = wb.getWorksheet("الكشف");
  expect(ws?.getCell("A1").value).toBe("كشف حساب: المورد (أ)");
  expect(ws?.getCell("C6").value).toBe("P10001"); // الأقدم أولاً
  expect(ws?.getCell("G12").value).toMatchObject({ result: -1050.75 }); // آخر حركة (7 حركات من الصف 6)
  expect(ws?.getCell("G13").value).toMatchObject({ formula: "G5+E13-F13", result: -1050.75 });
  const texts: string[] = [];
  ws?.eachRow((r) => r.eachCell((c) => texts.push(String(c.value))));
  expect(texts.join(" ")).toContain("اتصال لتأكيد موعد التوريد");
  expect(texts.join(" ")).not.toContain("للمراجعة");

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#root")).toBeHidden();
  const sheet = page.locator("body > div:not(#root)").filter({ hasText: "كشف حساب مورد" });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("tbody tr").first()).toContainText("20/06/2026");
  await expect(sheet).toContainText("اتصال لتأكيد موعد التوريد");
  await expect(sheet).not.toContainText("للمراجعة");
  await expect(sheet.locator("tbody tr").last()).toContainText("-1,050.75");
  await page.pdf({ path: "test-results/statement-a4.pdf", format: "A4" });
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator("#root")).toBeVisible();
});

test.describe("فهرس الفواتير وحالة Odoo", () => {
  const counter = (page: Page, label: string) =>
    page
      .locator("main dl div")
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator("dd");

  test("المالك: تحديد كـدخلت جماعي يستثني المقفل، والإرجاع بسبب، وكل تغيير في التدقيق", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginOk(page, OWNER.email, OWNER.password);
    await page.getByRole("link", { name: "الفواتير" }).click();
    await page.getByRole("radio", { name: "كل الفترات" }).click();
    await expect(counter(page, "إجمالي الفواتير")).toHaveText("6");
    await expect(counter(page, "دخلت")).toHaveText("1");
    await expect(counter(page, "لم تدخل Odoo")).toHaveText("5");

    await page.getByRole("radio", { name: "لم تدخل" }).click();
    await expect(page.locator("main tbody tr")).toHaveCount(5);
    await page.getByRole("checkbox", { name: "تحديد الكل الظاهر" }).click();
    await expect(page.getByText("5 فاتورة محددة").first()).toBeVisible();
    await page.getByRole("button", { name: "تحديد كـدخلت" }).first().click();
    await expect(page.getByText("حُددت 3 فاتورة كـ«دخلت» وسُجّل كل تغيير في التدقيق.")).toBeVisible();
    await expect(page.getByText(/2 فاتورة في فترة مقفلة .* لم تتغير: P10001، P90001/)).toBeVisible();
    await expect(counter(page, "دخلت")).toHaveText("4");
    await expect(counter(page, "لم تدخل Odoo")).toHaveText("2");
    await expect(page.locator("main tbody tr")).toHaveCount(2);

    await page.getByRole("radio", { name: "الكل", exact: true }).click();
    await page.getByRole("checkbox", { name: "تحديد الفاتورة P10002" }).click();
    await page.getByRole("button", { name: "إرجاع إلى «لم تدخل»" }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "إرجاع إلى «لم تدخل»" }).click();
    await expect(dlg.getByText("اختر سبب الإرجاع.")).toBeVisible();
    await dlg.getByRole("radio", { name: /حُددت بالخطأ/ }).click();
    await dlg.getByRole("button", { name: "إرجاع إلى «لم تدخل»" }).click();
    await expect(page.getByText("أُرجعت 1 فاتورة إلى «لم تدخل» وسُجّل كل تغيير في التدقيق.")).toBeVisible();
    await expect(counter(page, "لم تدخل Odoo")).toHaveText("3");
    await expect(counter(page, "دخلت")).toHaveText("3");

    const audit = await adminDb().collection("auditLog").where("entity", "==", "entries").get();
    const actions = audit.docs.map((d) => d.get("action") as string);
    expect(actions.filter((a) => a === "odooEntered")).toHaveLength(3);
    expect(actions.filter((a) => a === "odooReverted")).toHaveLength(1);
    const p10002 = await adminDb().doc("entries/e103").get();
    expect(p10002.get("odoo")).toMatchObject({ entered: false, reason: "wrong" });
    await page.screenshot({ path: "test-results/invoices-1440.png", fullPage: true });
  });

  test("مدخل البيانات: فواتير موردِيه فقط وللاطلاع، بلا تحديد", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginOk(page, ENTRY.email, ENTRY.password);
    await page.goto("/invoices");
    await page.getByRole("radio", { name: "كل الفترات" }).click();
    await expect(page.locator("main tbody tr")).toHaveCount(1);
    await expect(page.locator("main tbody tr").first()).toContainText("P20001");
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "تحديد كـدخلت" })).toHaveCount(0);
    await expect(page.getByText("صلاحية مدخل البيانات للاطلاع فقط")).toBeVisible();
  });

  test("الجوال: بطاقات، ووضع التحديد بشريط سفلي، بلا تمرير أفقي ولا عنصر أصلي", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await loginOk(page, OWNER.email, OWNER.password);
    await page.goto("/invoices");
    await page.getByRole("radio", { name: "كل الفترات" }).click();
    await expect(page.locator("main tbody tr").first()).toBeVisible();
    await expect(page.getByRole("columnheader")).toHaveCount(0);
    await page.getByRole("button", { name: "تحديد فواتير" }).click();
    const bar = page.getByRole("region", { name: "إجراءات التحديد" });
    await expect(bar).toBeVisible();
    await page.locator("main tbody tr").first().click();
    await expect(bar).toContainText("1 فاتورة محددة");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const banned = await page.evaluate(
      () =>
        document.querySelectorAll(
          'select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="date"]',
        ).length,
    );
    expect(banned).toBe(0);
    await page.screenshot({ path: "test-results/invoices-360.png", fullPage: true });
    await bar.getByRole("button", { name: "إلغاء" }).click();
    await expect(bar).toHaveCount(0);
  });
});
