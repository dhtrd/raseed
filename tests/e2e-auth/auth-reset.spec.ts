import { expect, test } from "@playwright/test";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "./cleanup";

/** إعادة تعيين كلمة المرور داخل التطبيق (الخيار ب + دخول تلقائي، DECISIONS 2026-10-12). */
const USER = { email: "reset-me@example.com", temp: "Tmp7#mLx9!pR2vA", next: "Nw7#mLx9!pR2vB4" };
let uid = "";

async function latestResetCode(email: string): Promise<string> {
  const r = await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-raseed/oobCodes");
  const { oobCodes } = (await r.json()) as {
    oobCodes: { email: string; requestType: string; oobCode: string }[];
  };
  const mine = oobCodes.filter((c) => c.email === email && c.requestType === "PASSWORD_RESET");
  expect(mine.length).toBeGreaterThan(0);
  return mine[mine.length - 1]!.oobCode;
}

test.beforeAll(async () => {
  const db = adminDb();
  const u = await getAuth().createUser({
    email: USER.email,
    password: USER.temp,
    displayName: "مستخدم الاختبار",
  });
  uid = u.uid;
  await db.doc(`users/${uid}`).set({
    displayName: "مستخدم الاختبار",
    login: USER.email,
    role: "entry",
    assigned: [],
    active: true,
    mustChangePassword: true,
    auditId: "seed",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

test.afterAll(async () => {
  const db = adminDb();
  const audits = await db.collection("auditLog").where("actor", "==", uid).get();
  await Promise.all(audits.docs.map((d) => d.ref.delete()));
  await db.doc(`users/${uid}`).delete();
  await getAuth().deleteUser(uid);
});

test("الرابط: الفتح لا يستهلكه، «متابعة» تعرض الحساب، ثم دخول تلقائي يزيل علم الكلمة المؤقتة", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByRole("button", { name: "نسيت كلمة المرور؟" }).click();
  await page.getByLabel("البريد الإلكتروني").fill(USER.email);
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByText("تحقق من بريدك")).toBeVisible();

  const url = `/auth/action?mode=resetPassword&oobCode=${await latestResetCode(USER.email)}&apiKey=k&lang=ar`;
  // فتح مسبق كما يفعل ماسح الروابط: لا يستهلك الرابط
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "إعادة تعيين كلمة المرور" })).toBeVisible();
  await page.goto(url);
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByText(USER.email)).toBeVisible();

  const pw = page.getByRole("textbox", { name: /^كلمة المرور الجديدة/ });
  await pw.fill("weak");
  await page.getByRole("button", { name: "حفظ والدخول" }).click();
  await expect(page.getByText(/كلمة المرور ضعيفة/)).toBeVisible();
  await page.screenshot({ path: "test-results/reset-1440.png" });

  await pw.fill(USER.next);
  await page.getByRole("textbox", { name: /^أعد كتابتها/ }).fill(USER.next);
  await page.getByRole("button", { name: "حفظ والدخول" }).click();
  await expect(page).toHaveURL(/localhost:5174\/$/);
  await expect(page.getByRole("button", { name: "خروج" }).first()).toBeVisible();

  const me = await adminDb().doc(`users/${uid}`).get();
  expect(me.get("mustChangePassword")).toBe(false);
  const audit = await adminDb().collection("auditLog").where("actor", "==", uid).get();
  expect(audit.docs.map((d) => d.get("action"))).toContain("passwordReset");

  // الرابط نفسه بعد الاستعمال
  await page.goto(url);
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByRole("heading", { name: "رابط غير صالح" })).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
});

test("رابط ناقص: رسالة وطلب رابط جديد، والجوال بلا تمرير أفقي", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/auth/action?mode=resetPassword");
  await expect(page.getByRole("heading", { name: "رابط غير صالح" })).toBeVisible();
  await expect(page.getByRole("button", { name: "متابعة" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
