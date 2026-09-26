import path from "node:path";
import { defineConfig } from "vitest/config";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://ayten_app:ayten_app_dev@localhost:5432/ayten_test";
const TEST_DB_OWNER =
  process.env.TEST_DATABASE_OWNER_URL ?? "postgres://ayten_owner:ayten_owner_dev@localhost:5432/ayten_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/support/global-setup.ts"],
    setupFiles: ["tests/support/setup.ts"],
    // Integration tests share one database and truncate between tests.
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DB,
      ADMIN_DATABASE_URL: process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://ayten_admin:ayten_admin_dev@localhost:5432/ayten_test",
      TEST_DATABASE_OWNER_URL: TEST_DB_OWNER,
      APP_URL: "http://localhost:3000",
      EMAIL_TRANSPORT: "log",
      OUTBOX_DIR: ".data/test",
    },
  },
});
