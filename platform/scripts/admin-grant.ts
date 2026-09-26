/**
 * Grants platform-admin access to an existing account. The first platform
 * owner can only be created this way (the admin panel requires an admin).
 *
 *   pnpm admin:grant owner@example.com owner
 *
 * Roles: owner, admin, finance, support, content.
 */
import { Client } from "pg";

const [email, role = "owner"] = process.argv.slice(2);
const ROLES = ["owner", "admin", "finance", "support", "content"];
const url = process.env.DATABASE_OWNER_URL;

async function main() {
  if (!email || !ROLES.includes(role)) {
    console.error("Usage: pnpm admin:grant <email> [owner|admin|finance|support|content]");
    process.exit(1);
  }
  if (!url) throw new Error("DATABASE_OWNER_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>("select id from users where email = $1", [email.toLowerCase()]);
    if (!rows[0]) throw new Error(`No account with email ${email}. Register first, then run this again.`);
    await client.query("begin");
    await client.query(
      `insert into platform_admins (user_id, role) values ($1, $2)
       on conflict (user_id) do update set role = excluded.role`,
      [rows[0].id, role],
    );
    await client.query(
      `insert into audit_logs (id, actor_type, action, target_type, target_id, metadata)
       values (gen_random_uuid(), 'system', 'admin.admin_granted', 'user', $1, $2)`,
      [rows[0].id, JSON.stringify({ role, via: "cli" })],
    );
    await client.query("commit");
    console.log(`${email} is now a platform ${role}. Sign in and open /admin.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
