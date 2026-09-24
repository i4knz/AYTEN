import { rm } from "node:fs/promises";
import { migrate } from "../../scripts/migrate";

export default async function globalSetup() {
  await migrate(process.env.TEST_DATABASE_OWNER_URL ?? "postgres://ayten_owner:ayten_owner_dev@localhost:5432/ayten_test", {
    reset: true,
  });
  await rm(".data/e2e", { recursive: true, force: true });
}
