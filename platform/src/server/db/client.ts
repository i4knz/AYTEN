import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// One pool per process. In dev, Next.js hot reload re-evaluates modules, so the
// pool is cached on globalThis to avoid exhausting connections.
const globalForDb = globalThis as unknown as { __aytenPool?: Pool; __aytenDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__aytenDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForDb.__aytenPool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    globalForDb.__aytenDb = drizzle(globalForDb.__aytenPool, { schema });
  }
  return globalForDb.__aytenDb;
}

export async function closeDb() {
  await globalForDb.__aytenPool?.end();
  globalForDb.__aytenPool = undefined;
  globalForDb.__aytenDb = undefined;
}
