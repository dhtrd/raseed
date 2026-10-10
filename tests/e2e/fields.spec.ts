import { expect, test } from "@playwright/test";

test.describe("معرض الحقول", () => {
  test("لا عنصر إدخال أصلي في الصفحة", async ({ page }) => {
    await page.goto("/__fields");
    const banned = await page.evaluate(
      () =>
        document.querySelectorAll(
          'select, datalist, input[type="date"], input[type="checkbox"], input[type="radio"], input[type="number"], input[type="time"], input[type="range"]',
        ).length,
    );
    expect(banned).toBe(0);
    // كل حقل نصي بلا مظهر المتصفح الافتراضي (لا إطار أصلي)
    const styled = await page.$$eval("form input, form textarea", (els) =>
      els.every((el) => {
        const cs = getComputedStyle(el);
        return cs.borderTopStyle === "none" && cs.appearance === "none";
      }),
    );
    expect(styled).toBe(true);
  });

  for (const width of [360, 834, 1440]) {
    test(`لا تمرير أفقي عند ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/__fields");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/fields-${width}.png`, fullPage: true });
    });
  }

  test("التاريخ بلوحة المفاتيح فقط: كتابة ثم تقويم", async ({ page }) => {
    await page.goto("/__fields");
    const form = page.locator("form");
    const date = form.getByRole("textbox", { name: /التاريخ/ });
    await date.fill("1508");
    await date.press("Tab");
    await expect(date).toHaveValue("15/08/2026");
    await expect(form.getByText("السبت 15/08/2026")).toBeVisible();
    await date.focus();
    await date.press("Alt+ArrowDown");
    await expect(page.getByRole("dialog", { name: "اختيار التاريخ" })).toBeVisible();
    await page.keyboard.press("PageDown");
    await page.keyboard.press("Enter");
    await expect(date).toHaveValue("15/09/2026");
  });

  test("المبلغ: الفاتورة في الدائن فقط، والعكس الصريح ينقله", async ({ page }) => {
    await page.goto("/__fields");
    const form = page.locator("form");
    await expect(form.getByRole("textbox", { name: "مدين" })).toBeDisabled();
    const credit = form.getByRole("textbox", { name: "دائن" });
    await credit.click();
    await page.keyboard.type("١٢٥٠٠٫٥");
    await credit.press("Tab");
    await expect(credit).toHaveValue("12,500.50");
    await form.getByRole("checkbox", { name: /عكس الاتجاه/ }).click();
    await expect(form.getByRole("textbox", { name: "مدين" })).toHaveValue("12,500.50");
  });
});
