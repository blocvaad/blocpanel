import { describe, it, expect } from "vitest";
import { can, permissionsFor, type PanelRole } from "../permissions";

describe("panel RBAC — viewer is read-only", () => {
  const writes = [
    "broadcast.send",
    "buildings.modify",
    "payments.create",
    "tenants.modify",
    "management.approve",
    "admins.manage",
    "security.manage",
  ] as const;

  it.each(writes)("viewer cannot %s", (perm) => {
    expect(can("viewer", perm)).toBe(false);
  });

  const reads = ["buildings.read", "payments.read", "tenants.read"] as const;
  it.each(reads)("viewer can %s", (perm) => {
    expect(can("viewer", perm)).toBe(true);
  });
});

describe("panel RBAC — admin", () => {
  it("can send broadcasts and do operational writes", () => {
    expect(can("admin", "broadcast.send")).toBe(true);
    expect(can("admin", "buildings.modify")).toBe(true);
    expect(can("admin", "payments.create")).toBe(true);
    expect(can("admin", "management.approve")).toBe(true);
  });

  it("cannot manage admins or security (superadmin-only)", () => {
    expect(can("admin", "admins.manage")).toBe(false);
    expect(can("admin", "security.manage")).toBe(false);
  });
});

describe("panel RBAC — superadmin", () => {
  it("has every permission the matrix defines", () => {
    const all = new Set<string>();
    (["viewer", "admin", "superadmin"] as PanelRole[]).forEach(r =>
      permissionsFor(r).forEach(p => all.add(p))
    );
    for (const perm of all) {
      expect(can("superadmin", perm as any)).toBe(true);
    }
  });
});

describe("panel RBAC — hardening", () => {
  it("denies everything for a missing/undefined role", () => {
    expect(can(undefined, "buildings.read")).toBe(false);
    expect(can(null, "broadcast.send")).toBe(false);
  });

  it("monotonic-ish: admin ⊇ viewer read grants", () => {
    for (const perm of permissionsFor("viewer")) {
      expect(can("admin", perm)).toBe(true);
    }
  });
});
