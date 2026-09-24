import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
// Use a preinstalled Chromium when the environment provides one (e.g. CI images
// or sandboxes where `playwright install` is not allowed).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://ayten_app:ayten_app_dev@localhost:5432/ayten_test",
      APP_URL: BASE_URL,
      STOREFRONT_ROOT_DOMAIN: `localhost:${PORT}`,
      EMAIL_TRANSPORT: "log",
      ALLOW_LOG_EMAIL: "1",
      OUTBOX_DIR: ".data/e2e",
      TRUST_PROXY: "0",
    },
  },
});
