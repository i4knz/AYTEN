import { asOwner } from "./db";

export async function makeAdmin(userId: string, role: "owner" | "admin" | "finance" | "support" | "content" = "owner") {
  await asOwner((c) => c.query(`insert into platform_admins (user_id, role) values ($1, $2) on conflict (user_id) do update set role = excluded.role`, [userId, role]));
}
