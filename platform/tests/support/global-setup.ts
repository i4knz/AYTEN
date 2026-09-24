import { migrate } from "../../scripts/migrate";

export default async function setup() {
  const url =
    process.env.TEST_DATABASE_OWNER_URL ?? "postgres://ayten_owner:ayten_owner_dev@localhost:5432/ayten_test";
  await migrate(url, { reset: true });
}
