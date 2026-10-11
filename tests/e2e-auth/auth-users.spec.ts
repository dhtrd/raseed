import { expect, test, type Page } from "@playwright/test";
import { ADMIN, OWNER } from "./seed";

/** سيناريو متتابع: كل خطوة تبني على السابقة (حساب جديد ← إسناد ← أول دخول). */
test.describe.configure({ mode: "serial" });

let tempPassword = "";
const NEW_PW = "Fh7#kLx9!pR2vNq";

async function login(page: Page, id: string, pw: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(id);
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).fill(pw);
  await page.getByRole("button", { name: "دخول" }).click();
}

/** دخول ناجح: ينتظر مغادرة شاشة الدخول قبل أي انتقال، كي لا يسبق التنقلُ الجلسةَ. */
async function loginOk(page: Page, id: string, pw: string) {
  await login(page, id, pw);
  await expect(page).not.toHaveURL(/\/login$/);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "خروج" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("الدخول: الساعة، ورسالة عامة للبيانات الخاطئة", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("timer")).toContainText(/[صم]/);
  await login(page, OWNER.email, "Wrong#Pass2026x");
  await expect(page.getByRole("alert")).toContainText("البريد أو كلمة المرور غير صحيحة.");
  await page.getByLabel("البريد الإلكتروني").fill("a@");
  await page.getByRole("textbox", { name: "كلمة المرور مطلوب" }).click();
  await expect(page.getByText("البريد غير صالح.")).toBeVisible();
});

test("المالك ينشئ مدخل بيانات بكلمة مؤقتة مولّدة", async ({ page }) => {
  await loginOk(page, OWNER.email, OWNER.password);
  await expect(page.getByRole("heading", { name: `مرحباً ${OWNER.name}` })).toBeVisible();
  await page.getByRole("link", { name: "المستخدمون" }).click();
  await expect(page.getByRole("heading", { name: /المستخدمون/ })).toBeVisible();
  await page.getByRole("button", { name: "إضافة مستخدم" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("الاسم الظاهر").fill("فهد");
  await dlg.getByLabel("البريد الإلكتروني للدخول").fill("fahad@example.com");
  await dlg.getByRole("button", { name: "توليد كلمة قوية" }).click();
  await dlg.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(dlg.getByRole("heading", { name: "أُنشئ الحساب" })).toBeVisible();
  tempPassword = ((await dlg.locator("dd").nth(1).textContent()) ?? "").trim();
  expect(tempPassword).toHaveLength(16);
  await dlg.getByRole("button", { name: "تم" }).click();
  await expect(page).toHaveURL(/\/users\/[A-Za-z0-9]+$/);
  await expect(page.getByText("بانتظار أول دخول").first()).toBeVisible();
});

test("اسم المستخدم بلا بريد مرفوض (البريد فقط)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("fahad");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page.getByText("البريد غير صالح.", { exact: false })).toBeVisible();
});

test("تكرار الدخول نفسه مرفوض قبل الإرسال", async ({ page }) => {
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/users");
  await page.getByRole("button", { name: "إضافة مستخدم" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("الاسم الظاهر").fill("مكرر");
  await dlg.getByLabel("البريد الإلكتروني للدخول").fill("FAHAD@Example.com");
  await dlg.getByRole("button", { name: "توليد كلمة قوية" }).click();
  await dlg.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(dlg.getByText("هذا الدخول مستخدم لحساب آخر.")).toBeVisible();
});

test("الإسناد: المؤرشف لا يظهر، والحفظ مرة واحدة، والخروج بتغييرات يُسأل عنه", async ({ page }) => {
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/assign");
  await page.getByRole("link", { name: /فهد/ }).click();
  await expect(page.getByRole("heading", { name: "موردو فهد" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "المورد (ق)" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "المورد (أ)" }).click();
  await page.getByRole("checkbox", { name: "المورد (ب)" }).click();
  await expect(page.getByText("+2 إسناد")).toBeVisible();
  await page.getByRole("link", { name: "المستخدمون" }).click();
  await expect(page.getByRole("dialog", { name: "لديك تغييرات غير محفوظة" })).toBeVisible();
  await page.getByRole("button", { name: "البقاء والحفظ" }).click();
  await page.getByRole("button", { name: "حفظ الإسناد" }).click();
  await expect(page.getByText("حُفظ الإسناد في عملية واحدة")).toBeVisible();
  await expect(page.getByRole("link", { name: /فهد/ })).toContainText("2");
});

test("مدة الخمول: المالك يضبطها ضمن 5–120", async ({ page }) => {
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/users");
  const f = page.getByLabel("مدة الخمول قبل الخروج (دقيقة)");
  await f.fill("4");
  await f.press("Enter");
  await expect(page.getByText("اكتب عدداً من 5 إلى 120 دقيقة.")).toBeVisible();
  await f.fill("45");
  await f.press("Enter");
  await expect(page.getByText("حُفظت مدة الخمول 45 دقيقة")).toBeVisible();
});

test("أول دخول: تغيير الكلمة المؤقتة إلزامي، ثم يرى مدخل البيانات الرئيسية فقط", async ({ page }) => {
  await loginOk(page, "fahad@example.com", tempPassword);
  await expect(page).toHaveURL(/\/first-login$/);
  await page.goto("/users");
  await expect(page).toHaveURL(/\/first-login$/);
  await page.getByRole("textbox", { name: "كلمة المرور الجديدة مطلوب" }).fill("short1A!");
  await page.getByRole("textbox", { name: "أعد كتابتها مطلوب" }).fill("short1A!");
  await page.getByRole("button", { name: "حفظ والمتابعة" }).click();
  await expect(page.getByText(/كلمة المرور ضعيفة/)).toBeVisible();
  await page.getByRole("textbox", { name: "كلمة المرور الجديدة مطلوب" }).fill(NEW_PW);
  await page.getByRole("textbox", { name: "أعد كتابتها مطلوب" }).fill(NEW_PW);
  await page.getByRole("button", { name: "حفظ والمتابعة" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "مرحباً فهد" })).toBeVisible();
  await expect(page.getByRole("link", { name: "المستخدمون" })).toHaveCount(0);
  await page.goto("/users");
  await expect(page).toHaveURL(/\/$/);
  await logout(page);
  await loginOk(page, "fahad@example.com", NEW_PW);
  await expect(page.getByRole("heading", { name: "مرحباً فهد" })).toBeVisible();
});

test("الإدارة ترى حساب المالك محمياً، وتوقف مدخل البيانات", async ({ page }) => {
  await loginOk(page, ADMIN.email, ADMIN.password);
  await page.goto("/users");
  await page.getByRole("link", { name: new RegExp(OWNER.name) }).click();
  await expect(page.getByText("لا تستطيع الإدارة تعديله أو إيقافه.")).toBeVisible();
  await page.getByRole("link", { name: /فهد/ }).click();
  await page.getByRole("switch", { name: /الحساب نشط/ }).click();
  await page.getByRole("button", { name: "إيقاف" }).click();
  await expect(page.getByText("أُوقف الحساب وسُجّل في التدقيق.")).toBeVisible();
  await logout(page);
  await login(page, "fahad@example.com", NEW_PW);
  await expect(page.getByText("حسابك موقوف")).toBeVisible();
});

test("الجوال: بطاقات المستخدمين وصفحة المستخدم بزر رجوع، بلا تمرير أفقي", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await loginOk(page, OWNER.email, OWNER.password);
  await page.goto("/users");
  await expect(page.getByRole("columnheader")).toHaveCount(0);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/users-360.png", fullPage: true });
  await page.getByRole("link", { name: /مها/ }).click();
  await expect(page.getByRole("link", { name: "→ المستخدمون" })).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
  await page.screenshot({ path: "test-results/user-360.png", fullPage: true });
  await page.getByRole("link", { name: "→ المستخدمون" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.goto("/assign");
  await expect(page.getByRole("heading", { name: /موردو/ })).toHaveCount(0);
  await page.getByRole("link", { name: /فهد/ }).click();
  await expect(page.getByRole("link", { name: "→ مدخلو البيانات" })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/assign-360.png", fullPage: true });
  await page.goto("/login");
  await page.screenshot({ path: "test-results/login-360.png", fullPage: true });
});

test("لا عنصر إدخال أصلي في الشاشات الجديدة", async ({ page }) => {
  await loginOk(page, OWNER.email, OWNER.password);
  for (const [path, ready] of [
    ["/users", "الإعدادات: مسميات الأدوار"],
    ["/assign/x", "هذا المستخدم ليس مدخل بيانات"],
  ] as const) {
    await page.goto(path);
    // Firestore يُبقي اتصالاً مفتوحاً، فلا ننتظر «هدوء الشبكة» بل ظهور المحتوى
    await expect(page.getByText(ready)).toBeVisible();
    const banned = await page.evaluate(
      () =>
        document.querySelectorAll(
          'select, input[type="checkbox"], input[type="radio"], input[type="number"], input[type="date"]',
        ).length,
    );
    expect(banned).toBe(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users");
  await page.screenshot({ path: "test-results/users-1440.png", fullPage: true });
});
