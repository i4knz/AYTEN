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

export async function resetDatabase() {
  await asOwner((c) =>
    c.query(
      `TRUNCATE users, user_sessions, verification_tokens, rate_limit_buckets, stores, store_settings, store_members, audit_logs, webhook_events CASCADE`,
    ),
  );
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
};
