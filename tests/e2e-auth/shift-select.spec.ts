import { expect, test, type Page } from "@playwright/test";
import { OWNER } from "./seed";

/** التحديد بـ Shift (طلب المستخدم 2026-10-11): مدى من آخر عنصر نُقر. لا يحفظ شيئاً. */
async function loginOk(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("الفواتير: Shift+نقر يحدد المدى ويلغيه بترتيب العرض", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/invoices");
  await page.getByRole("radio", { name: "كل الفترات" }).click();
  const boxes = page.locator("main tbody").getByRole("checkbox", { name: /^تحديد الفاتورة/ });
  await expect(boxes.nth(3)).toBeVisible();

  await boxes.nth(0).click();
  await boxes.nth(3).click({ modifiers: ["Shift"] });
  for (const i of [0, 1, 2, 3]) await expect(boxes.nth(i)).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("4 فاتورة محددة").first()).toBeVisible();

  // Shift+نقر على محدد يلغي المدى من المرساة (الرابع) إليه
  await boxes.nth(1).click({ modifiers: ["Shift"] });
  await expect(boxes.nth(0)).toHaveAttribute("aria-checked", "true");
  for (const i of [1, 2, 3]) await expect(boxes.nth(i)).toHaveAttribute("aria-checked", "false");

  // النقر العادي يبقى لعنصر واحد
  await boxes.nth(2).click();
  await expect(boxes.nth(2)).toHaveAttribute("aria-checked", "true");
  await expect(boxes.nth(1)).toHaveAttribute("aria-checked", "false");
});

test("الإسناد: Shift+نقر يحدد الموردين الظاهرين بين النقرتين", async ({ page }) => {
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/assign");
  await page.getByRole("link", { name: /سالم/ }).click();
  const list = page.getByRole("checkbox", { name: /^المورد \(/ });
  await expect(list.first()).toBeVisible();
  const names = await list.allInnerTexts();
  const first = names[0]?.trim() ?? "";
  const fourth = names[3]?.trim() ?? "";
  await page.getByRole("checkbox", { name: first, exact: true }).click();
  await page.getByRole("checkbox", { name: fourth, exact: true }).click({ modifiers: ["Shift"] });
  for (const n of names.slice(0, 4))
    await expect(page.getByRole("checkbox", { name: n.trim(), exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  await expect(page.getByRole("checkbox", { name: names[4]?.trim() ?? "", exact: true })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});
