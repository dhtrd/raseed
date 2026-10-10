import { defineConfig, devices } from "@playwright/test";

// محلياً: Chromium فقط. في CI: Chromium وFirefox وWebKit (Safari) — FIELDS «فحص بصري».
const all = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: all,
  retries: 0,
  reporter: all ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
  },
  webServer: {
    command: "npx vite --port 5173 --strictPort",
    url: "http://localhost:5173/__fields",
    reuseExistingServer: !all,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(all
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
          { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
        ]
      : []),
  ],
});
