import { describe, expect, it } from "vitest";
import { getSession, register } from "@/server/auth/service";
import { AppError } from "@/server/lib/errors";
import { listMyStores, requireStoreAccess } from "@/server/stores/service";
import {
  acceptInvitation,
  changeMemberRole,
  getInvitation,
  inviteMember,
  listTeam,
  removeMember,
  revokeInvitation,
} from "@/server/team/service";
import { outbox } from "../support/db";
import { makeStore, makeUser } from "../support/factories";

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

function inviteLink() {
  const m = [...outbox].reverse().find((x) => x.tag === "store_invitation")!;
  const url = new URL(m.text.match(/https?:\/\/\S+/)![0]);
  return { storeId: url.searchParams.get("store")!, token: url.searchParams.get("token")! };
}

async function setup() {
  const owner = await makeUser();
  const { storeId } = await makeStore(owner.userId, { name: "متجر الفريق" });
  return { owner, storeId };
}

describe("invitations", () => {
  it("invites by email; the invitee registers with that email and joins with the role", async () => {
    const { owner, storeId } = await setup();
    await inviteMember(owner.userId, storeId, { email: "Staff@Example.com", role: "orders" });
    const { token } = inviteLink();
    expect(await getInvitation(storeId, token)).toMatchObject({ email: "staff@example.com", role: "orders", storeName: "متجر الفريق" });

    const staff = await register({ name: "موظف", email: "staff@example.com", password: "correct horse battery", acceptTerms: true });
    await acceptInvitation(staff.userId, storeId, token);
    const access = await requireStoreAccess(staff.userId, storeId, "orders.write");
    expect(access.role).toBe("orders");
    expect((await getSession(staff.sessionToken))?.user.emailVerified).toBe(true);
    expect((await listMyStores(staff.userId)).map((s) => s.id)).toEqual([storeId]);
    // Single use.
    await expectCode(acceptInvitation(staff.userId, storeId, token), "invalid_token");
  });

  it("refuses acceptance by a different account, a wrong store id, or after revocation", async () => {
    const { owner, storeId } = await setup();
    await inviteMember(owner.userId, storeId, { email: "right@example.com", role: "viewer" });
    const { token } = inviteLink();
    const intruder = await makeUser({ email: "wrong@example.com" });
    await expectCode(acceptInvitation(intruder.userId, storeId, token), "wrong_account");

    const other = await setup();
    expect(await getInvitation(other.storeId, token)).toBeNull();

    const [invitation] = (await listTeam(owner.userId, storeId)).invitations;
    await revokeInvitation(owner.userId, storeId, invitation.id);
    const right = await makeUser({ email: "right@example.com" });
    await expectCode(acceptInvitation(right.userId, storeId, token), "invalid_token");
  });

  it("re-inviting replaces the previous link", async () => {
    const { owner, storeId } = await setup();
    await inviteMember(owner.userId, storeId, { email: "x@example.com", role: "viewer" });
    const first = inviteLink().token;
    await inviteMember(owner.userId, storeId, { email: "x@example.com", role: "support" });
    const second = inviteLink().token;
    expect(await getInvitation(storeId, first)).toBeNull();
    expect((await getInvitation(storeId, second))?.role).toBe("support");
    expect((await listTeam(owner.userId, storeId)).invitations).toHaveLength(1);
  });

  it("cannot invite existing members, owners, or (as a manager) other managers", async () => {
    const { owner, storeId } = await setup();
    await expectCode(inviteMember(owner.userId, storeId, { email: owner.email, role: "viewer" }), "validation");
    await expectCode(inviteMember(owner.userId, storeId, { email: "a@example.com", role: "owner" }), "validation");

    await inviteMember(owner.userId, storeId, { email: "mgr@example.com", role: "manager" });
    const mgr = await makeUser({ email: "mgr@example.com" });
    await acceptInvitation(mgr.userId, storeId, inviteLink().token);
    await expectCode(inviteMember(mgr.userId, storeId, { email: "b@example.com", role: "manager" }), "forbidden");
    await expect(inviteMember(mgr.userId, storeId, { email: "b@example.com", role: "products" })).resolves.toBeUndefined();
  });

  it("only team managers can invite, and not into another store", async () => {
    const { owner, storeId } = await setup();
    await inviteMember(owner.userId, storeId, { email: "v@example.com", role: "viewer" });
    const viewer = await makeUser({ email: "v@example.com" });
    await acceptInvitation(viewer.userId, storeId, inviteLink().token);
    await expectCode(inviteMember(viewer.userId, storeId, { email: "c@example.com", role: "viewer" }), "forbidden");
    const other = await setup();
    await expectCode(inviteMember(owner.userId, other.storeId, { email: "c@example.com", role: "viewer" }), "not_found");
  });
});

describe("members", () => {
  async function withMember(role: "manager" | "orders") {
    const ctx = await setup();
    await inviteMember(ctx.owner.userId, ctx.storeId, { email: `${role}@example.com`, role });
    const member = await makeUser({ email: `${role}@example.com` });
    await acceptInvitation(member.userId, ctx.storeId, inviteLink().token);
    const team = await listTeam(ctx.owner.userId, ctx.storeId);
    const memberRow = team.members.find((m) => m.userId === member.userId)!;
    const ownerRow = team.members.find((m) => m.role === "owner")!;
    return { ...ctx, member, memberRow, ownerRow };
  }

  it("changes roles and removes members, revoking their access", async () => {
    const { owner, storeId, member, memberRow } = await withMember("orders");
    await changeMemberRole(owner.userId, storeId, memberRow.id, "products");
    await expect(requireStoreAccess(member.userId, storeId, "products.write")).resolves.toBeTruthy();
    await removeMember(owner.userId, storeId, memberRow.id);
    await expectCode(requireStoreAccess(member.userId, storeId), "not_found");
  });

  it("protects the owner and managers", async () => {
    const { storeId, member, memberRow, ownerRow } = await withMember("manager");
    await expectCode(removeMember(member.userId, storeId, ownerRow.id), "forbidden");
    await expectCode(changeMemberRole(member.userId, storeId, ownerRow.id, "viewer"), "forbidden");
    await expectCode(changeMemberRole(member.userId, storeId, memberRow.id, "viewer"), "forbidden");
  });

  it("a removed member can be re-invited", async () => {
    const { owner, storeId, member, memberRow } = await withMember("orders");
    await removeMember(owner.userId, storeId, memberRow.id);
    await inviteMember(owner.userId, storeId, { email: "orders@example.com", role: "viewer" });
    await acceptInvitation(member.userId, storeId, inviteLink().token);
    expect((await requireStoreAccess(member.userId, storeId)).role).toBe("viewer");
  });
});
