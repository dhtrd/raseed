import { defineConfig, devices } from "@playwright/test";

/**
 * e2e للدخول والمستخدمين والإسناد على محاكي Auth وFirestore بالقواعد الحقيقية.
 * يُشغَّل عبر `npm run test:e2e:auth` (يبدأ المحاكي ويزرع حساب المالك وبيانات وهمية).
 */
export default defineConfig({
  testDir: "tests/e2e-auth",
  globalSetup: "./tests/e2e-auth/seed.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-auth" }]]
    : "list",
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
    // تشغيل محلي بمتصفح مثبت مسبقاً (اختياري): PW_CHROMIUM=/path/to/chrome
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: "npx vite --port 5174 --strictPort",
    url: "http://localhost:5174/login",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_USE_EMULATORS: "true", VITE_FIREBASE_PROJECT_ID: "demo-raseed" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
