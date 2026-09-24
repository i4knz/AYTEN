/**
 * Applies SQL files from db/migrations in lexical order, each in its own
 * transaction, and records them in schema_migrations with a checksum so an
 * edited, already-applied migration is detected instead of silently skipped.
 *
 * CLI: scripts/db-migrate.ts. Paths resolve from the working directory, which
 * is the platform/ folder for every script and test runner.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

export async function migrate(connectionString: string, opts: { reset?: boolean } = {}) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    if (opts.reset) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Refusing to reset the schema in production");
      }
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; REVOKE ALL ON SCHEMA public FROM PUBLIC;");
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text PRIMARY KEY,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);

    const applied = new Map<string, string>(
      (await client.query<{ name: string; checksum: string }>("SELECT name, checksum FROM schema_migrations")).rows.map(
        (r) => [r.name, r.checksum],
      ),
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const done: string[] = [];

    for (const file of files) {
      const sqlText = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(sqlText).digest("hex");
      const previous = applied.get(file);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(`Migration ${file} was modified after being applied. Add a new migration instead.`);
        }
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sqlText);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
        done.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    return done;
  } finally {
    await client.end();
  }
}
