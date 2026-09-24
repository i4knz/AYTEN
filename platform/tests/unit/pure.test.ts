import { describe, expect, it } from "vitest";
import { passwordProblem } from "@/server/auth/password";
import { isUuid, uuidv7 } from "@/server/lib/ids";
import { PERMISSIONS, roleHas, ROLE_PERMISSIONS } from "@/server/stores/permissions";
import { normalizeSaPhone } from "@/server/stores/schemas";
import { RESERVED_SLUGS, slugProblem, suggestSlug, SLUG_PATTERN } from "@/server/stores/slug";

describe("slug rules", () => {
  it.each(["abc", "my-store", "store-2", "a1b2c3", "x".repeat(40)])("accepts %s", (s) => {
    expect(slugProblem(s)).toBeNull();
  });

  it.each(["ab", "-abc", "abc-", "a--b", "My-Store", "متجر", "has space", "under_score", "x".repeat(41)])(
    "rejects %s",
    (s) => {
      expect(slugProblem(s)).not.toBeNull();
    },
  );

  it("rejects reserved names", () => {
    for (const s of ["admin", "www", "api", "salla", "ayten"]) expect(slugProblem(s)).toMatch(/محجوز/);
  });

  it("suggests valid slugs from Arabic names", () => {
    expect(suggestSlug("متجر الورد")).toBe("mtjr-wrd");
    expect(suggestSlug("عطور نجد")).toBe("atwr-njd");
    for (const name of ["ا", "!!!", "متجر", "Admin", "شركة الأمل للتجارة ١٢٣", "Café Déjà Vu"]) {
      const s = suggestSlug(name);
      expect(SLUG_PATTERN.test(s), `${name} → ${s}`).toBe(true);
      expect(RESERVED_SLUGS.has(s)).toBe(false);
    }
  });
});

describe("password policy", () => {
  it("requires length and rejects common or trivial passwords", () => {
    expect(passwordProblem("short")).toMatch(/10/);
    expect(passwordProblem("1234567890")).toMatch(/شائعة/);
    expect(passwordProblem("zzzzzzzzzzzz")).not.toBeNull();
    expect(passwordProblem("merchant@example.com", "merchant@example.com")).not.toBeNull();
    expect(passwordProblem("correct horse battery")).toBeNull();
  });
});

describe("uuidv7", () => {
  it("is a valid, time-ordered v7 UUID", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(a[19]);
    expect(a < b).toBe(true);
  });
});

describe("role permissions", () => {
  it("gives the owner everything and nobody else billing.manage", () => {
    expect([...ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
    for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
      if (role !== "owner") expect(roleHas(role, "billing.manage"), role).toBe(false);
    }
  });

  it("only owner and manager can manage the team or settings", () => {
    const allowed = (p: "team.manage" | "settings.write") =>
      Object.entries(ROLE_PERMISSIONS)
        .filter(([, perms]) => perms.includes(p))
        .map(([r]) => r)
        .sort();
    expect(allowed("team.manage")).toEqual(["manager", "owner"]);
    expect(allowed("settings.write")).toEqual(["manager", "owner"]);
  });

  it("read-only roles cannot write", () => {
    for (const role of ["viewer", "support"] as const) {
      expect(ROLE_PERMISSIONS[role].some((p) => p.endsWith(".write") || p.endsWith(".manage"))).toBe(false);
    }
  });
});

describe("Saudi phone normalization", () => {
  it.each([
    ["0501234567", "+966501234567"],
    ["+966 50 123 4567", "+966501234567"],
    ["00966501234567", "+966501234567"],
    ["٠٥٠١٢٣٤٥٦٧", "+966501234567"],
  ])("%s → %s", (input, out) => {
    expect(normalizeSaPhone(input)).toBe(out);
  });

  it.each(["0112345678", "050123", "+971501234567"])("rejects %s", (input) => {
    expect(normalizeSaPhone(input)).toBeNull();
  });
});
