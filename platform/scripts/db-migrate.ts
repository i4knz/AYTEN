/**
 *   pnpm db:migrate            # applies pending migrations using DATABASE_OWNER_URL
 *   pnpm db:reset              # drops and recreates the public schema first (refused in production)
 */
import { migrate } from "./migrate";

const url = process.env.DATABASE_OWNER_URL;
if (!url) {
  console.error("DATABASE_OWNER_URL is not set");
  process.exit(1);
}

migrate(url, { reset: process.argv.includes("--reset") })
  .then((done) => console.log(done.length ? `Applied: ${done.join(", ")}` : "Database is up to date"))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
