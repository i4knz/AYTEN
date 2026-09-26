import { Client } from "pg";
import type { EmailMessage } from "@/server/email";
import type { StorageProvider } from "@/server/storage";

export const outbox: EmailMessage[] = [];

/** Runs SQL as the schema owner (bypasses the app role's grants; RLS is still FORCEd on tenant tables). */
export async function asOwner<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_OWNER_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export const SEEDED_PLANS = {
  founders: "0192f000-0000-7000-8000-000000000001",
  basic: "0192f000-0000-7000-8000-000000000002",
  pro: "0192f000-0000-7000-8000-000000000003",
};

export async function resetDatabase() {
  await asOwner(async (c) => {
    // CASCADE also empties tables that reference users (platform_settings,
    // help_articles, announcements, ...); code falls back to setting defaults.
    await c.query(
      `TRUNCATE users, user_sessions, verification_tokens, rate_limit_buckets, stores, store_settings, store_members, audit_logs, webhook_events, platform_settings, help_articles, announcements CASCADE`,
    );
    // Plans are seeded by the migration: drop test-created ones and restore the default.
    await c.query(`DELETE FROM plans WHERE id <> ALL($1::uuid[])`, [Object.values(SEEDED_PLANS)]);
    await c.query(`UPDATE plans SET is_default = false WHERE is_default AND id <> $1`, [SEEDED_PLANS.founders]);
    await c.query(`UPDATE plans SET is_default = true, archived_at = null WHERE id = $1`, [SEEDED_PLANS.founders]);
  });
}

/** Extracts the token query parameter from the most recent email with the given tag. */
export function lastTokenFromOutbox(tag: string): string {
  const message = [...outbox].reverse().find((m) => m.tag === tag);
  if (!message) throw new Error(`No email with tag ${tag}`);
  const match = message.text.match(/token=([A-Za-z0-9_\-%]+)/);
  if (!match) throw new Error("No token in email");
  return decodeURIComponent(match[1]);
}

export const memoryStorage: StorageProvider & { files: Map<string, Buffer> } = {
  files: new Map(),
  async put(key, body) {
    this.files.set(key, body);
  },
  async get(key) {
    const body = this.files.get(key);
    return body ? { body, contentType: "image/webp" } : null;
  },
  async delete(key) {
    this.files.delete(key);
  },
  url: (key) => `http://media.test/${key}`,
  publicBase: () => "http://media.test/",
};
