import { expect, test } from "@playwright/test";

// الوضع النهاري دائماً (قرار المستخدم 2026-10-11)، حتى لو كان الجهاز على الوضع الداكن
test.use({ colorScheme: "dark" });

test("الوضع النهاري دائم ولو كان الجهاز داكناً", async ({ page }) => {
  await page.goto("/login");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(238, 242, 245)");
  const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(scheme).toBe("light");
});
