import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { auditLogs, storeMembers, storeSettings } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { AppError } from "@/server/lib/errors";
import { uuidv7 } from "@/server/lib/ids";
import {
  checkSlug,
  createStore,
  getStoreAccess,
  getStorefront,
  listMyStores,
  MAX_OWNED_STORES,
  requireStoreAccess,
  updateStoreProfile,
} from "@/server/stores/service";
import { asOwner } from "../support/db";
import { makeStore, makeUser } from "../support/factories";

async function twoTenants() {
  const alice = await makeUser();
  const bob = await makeUser();
  const a = await makeStore(alice.userId, { slug: "alice-shop" });
  const b = await makeStore(bob.userId, { slug: "bob-shop" });
  return { alice, bob, a, b };
}

/** Rejects with a Postgres error whose message (possibly wrapped by Drizzle in `cause`) matches. */
async function expectPgError(p: Promise<unknown>, pattern: RegExp) {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err, "expected the query to fail").toBeDefined();
  const messages: string[] = [];
  for (let e = err as { message?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) messages.push(e.message ?? "");
  expect(messages.join(" | ")).toMatch(pattern);
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe("store creation", () => {
  it("creates the store, its settings, the owner membership and an audit entry", async () => {
    const u = await makeUser();
    const { storeId } = await createStore(u.userId, { name: "متجر الورد", slug: "ward", businessType: "beauty" });
    const access = await requireStoreAccess(u.userId, storeId, "team.manage");
    expect(access.role).toBe("owner");
    expect(access.store).toMatchObject({ slug: "ward", status: "draft", currency: "SAR", countryCode: "SA" });
    const { rows } = await asOwner(async (c) => {
      await c.query("select set_config('app.store_id', $1, false)", [storeId]);
      return c.query("select action from audit_logs where store_id = $1", [storeId]);
    });
    expect(rows.map((r) => r.action)).toEqual(["store.created"]);
  });

  it("rejects taken (case-insensitive), reserved and malformed slugs with a suggestion", async () => {
    const u = await makeUser();
    await makeStore(u.userId, { slug: "perfume" });
    const err = await createStore(u.userId, { name: "x x", slug: "PERFUME", businessType: "beauty" }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.fieldErrors.slug).toContain("perfume-2");
    await expectCode(createStore(u.userId, { name: "x x", slug: "admin", businessType: "general" }), "validation");
    await expectCode(createStore(u.userId, { name: "x x", slug: "bad slug", businessType: "general" }), "validation");
    expect(await checkSlug("perfume")).toMatchObject({ ok: false, suggestion: "perfume-2" });
    expect(await checkSlug("fresh-name")).toEqual({ ok: true });
  });

  it("handles two concurrent requests for the same slug", async () => {
    const u1 = await makeUser();
    const u2 = await makeUser();
    const results = await Promise.allSettled([
      createStore(u1.userId, { name: "سباق", slug: "race", businessType: "general" }),
      createStore(u2.userId, { name: "سباق", slug: "race", businessType: "general" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(AppError);
  });

  it(`limits a user to ${MAX_OWNED_STORES} owned stores`, async () => {
    const u = await makeUser();
    for (let i = 0; i < MAX_OWNED_STORES; i++) await makeStore(u.userId);
    await expectCode(makeStore(u.userId), "limit_reached");
  });
});

describe("tenant isolation — application layer", () => {
  it("a non-member gets not_found for another store, for every permission", async () => {
    const { alice, b } = await twoTenants();
    expect(await getStoreAccess(alice.userId, b.storeId)).toBeNull();
    await expectCode(requireStoreAccess(alice.userId, b.storeId), "not_found");
    await expectCode(requireStoreAccess(alice.userId, b.storeId, "products.read"), "not_found");
  });

  it("cannot update another store's profile", async () => {
    const { alice, b } = await twoTenants();
    await expectCode(
      updateStoreProfile(alice.userId, b.storeId, {
        name: "مخترق",
        contactEmail: "",
        contactPhone: "",
        whatsapp: "",
        brandColor: "#000000",
      }),
      "not_found",
    );
    const store = await getStorefront("bob-shop");
    expect(store?.name).not.toBe("مخترق");
  });

  it("members without the permission are forbidden", async () => {
    const { alice, bob, a } = await twoTenants();
    await withTenant({ storeId: a.storeId }, (tx) =>
      tx.insert(storeMembers).values({ id: uuidv7(), storeId: a.storeId, userId: bob.userId, role: "viewer" }),
    );
    await expect(requireStoreAccess(bob.userId, a.storeId, "orders.read")).resolves.toMatchObject({ role: "viewer" });
    await expectCode(requireStoreAccess(bob.userId, a.storeId, "settings.write"), "forbidden");
    await expectCode(
      updateStoreProfile(bob.userId, a.storeId, {
        name: "x x",
        contactEmail: "",
        contactPhone: "",
        whatsapp: "",
        brandColor: "#000000",
      }),
      "forbidden",
    );
    expect((await listMyStores(bob.userId)).map((s) => s.slug).sort()).toEqual(["alice-shop", "bob-shop"]);
    expect((await listMyStores(alice.userId)).map((s) => s.slug)).toEqual(["alice-shop"]);
  });

  it("malformed store ids are treated as not found", async () => {
    const u = await makeUser();
    await expectCode(requireStoreAccess(u.userId, "../../etc"), "not_found");
    await expectCode(requireStoreAccess(u.userId, "' or 1=1 --"), "not_found");
  });
});

describe("tenant isolation — database row-level security", () => {
  it("without a tenant context, tenant tables return nothing", async () => {
    await twoTenants();
    const db = getDb();
    expect(await db.select().from(storeSettings)).toHaveLength(0);
    expect(await db.select().from(storeMembers)).toHaveLength(0);
    expect(await db.select().from(auditLogs)).toHaveLength(0);
  });

  it("a query with no WHERE clause only sees the current store", async () => {
    const { a, b } = await twoTenants();
    const rows = await withTenant({ storeId: a.storeId }, (tx) => tx.select().from(storeSettings));
    expect(rows.map((r) => r.storeId)).toEqual([a.storeId]);
    const other = await withTenant({ storeId: a.storeId }, (tx) =>
      tx.select().from(storeSettings).where(eq(storeSettings.storeId, b.storeId)),
    );
    expect(other).toHaveLength(0);
  });

  it("cannot update or delete rows of another store even by id", async () => {
    const { a, b } = await twoTenants();
    const updated = await withTenant({ storeId: a.storeId }, (tx) =>
      tx.update(storeSettings).set({ brandColor: "#ff0000" }).where(eq(storeSettings.storeId, b.storeId)).returning(),
    );
    expect(updated).toHaveLength(0);
    const deleted = await withTenant({ storeId: a.storeId }, (tx) =>
      tx.delete(storeMembers).where(eq(storeMembers.storeId, b.storeId)).returning(),
    );
    expect(deleted).toHaveLength(0);
  });

  it("cannot insert rows into another store", async () => {
    const { alice, a, b } = await twoTenants();
    await expectPgError(
      withTenant({ storeId: a.storeId }, (tx) =>
        tx.insert(storeMembers).values({ id: uuidv7(), storeId: b.storeId, userId: alice.userId, role: "owner" }),
      ),
      /row-level security/,
    );
  });

  it("the tenant context does not leak to the next transaction on the same pool", async () => {
    const { a } = await twoTenants();
    await withTenant({ storeId: a.storeId }, (tx) => tx.select().from(storeSettings));
    const after = await getDb().execute(sql`select current_setting('app.store_id', true) as v`);
    expect(after.rows[0].v || null).toBeNull();
    expect(await getDb().select().from(storeSettings)).toHaveLength(0);
  });

  it("the runtime role cannot bypass RLS, alter the audit log, or run DDL", async () => {
    const { a } = await twoTenants();
    const db = getDb();
    const role = await db.execute(sql`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`);
    expect(role.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    await expectPgError(
      withTenant({ storeId: a.storeId }, (tx) => tx.update(auditLogs).set({ action: "tampered" })),
      /permission denied/,
    );
    await expectPgError(withTenant({ storeId: a.storeId }, (tx) => tx.delete(auditLogs)), /permission denied/);
    await expectPgError(db.execute(sql`alter table store_settings disable row level security`), /must be owner/);
  });

  it("the audit log is append-only even for the schema owner with RLS lifted", async () => {
    await twoTenants();
    await asOwner(async (c) => {
      // RLS alone already hides audit rows from UPDATE/DELETE (no policy grants them).
      // Lift it inside a rolled-back transaction to prove the trigger is a second, independent barrier.
      for (const stmt of ["update audit_logs set action = 'x'", "delete from audit_logs"]) {
        await c.query("begin");
        await c.query("alter table audit_logs no force row level security");
        await expect(c.query(stmt)).rejects.toThrow(/append-only/);
        await c.query("rollback");
      }
    });
  });
});

describe("storefront lookup", () => {
  it("resolves by slug case-insensitively and ignores junk", async () => {
    await twoTenants();
    expect((await getStorefront("ALICE-shop"))?.slug).toBe("alice-shop");
    expect(await getStorefront("nope-nope")).toBeNull();
    expect(await getStorefront("../x")).toBeNull();
  });
});
