/**
 * Periodic maintenance. Run every 5–15 minutes from cron / a scheduler:
 *   pnpm jobs
 */
import { closeDb } from "../src/server/db/client";
import { expireUnpaidOnlineOrders } from "../src/server/commerce/payments";

async function main() {
  const expired = await expireUnpaidOnlineOrders();
  console.log(JSON.stringify({ job: "expire_unpaid_online_orders", expired, at: new Date().toISOString() }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
