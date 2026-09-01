// blocpanel RBAC tests (audit §88).
//
// The plan flagged that blocpanel shipped with effectively no test suite, and
// asked specifically for critical tests around viewer mutation, role
// escalation, and permission isolation. permissions.ts is the authorization
// source of truth (`can()` is the gate; the UI hiding a button never is), and
// it is pure — so these run with no mocks and pin the matrix down hard.

import { describe, it, expect } from "vitest";
import { can, permissionsFor, type PanelRole, type Permission } from "@/lib/permissions";

const ALL_PERMISSIONS: Permission[] = [
  "broadcast.send",
  "buildings.read",
  "buildings.modify",
  "payments.read",
  "payments.create",
  "tenants.read",
  "tenants.modify",
  "management.approve",
  "admins.manage",
  "security.manage",
];

const MUTATIONS: Permission[] = [
  "broadcast.send",
  "buildings.modify",
  "payments.create",
  "tenants.modify",
  "management.approve",
  "admins.manage",
  "security.manage",
];

const READS: Permission[] = ["buildings.read", "payments.read", "tenants.read"];

describe("can() — viewer is strictly read-only", () => {
  it("grants every read permission to viewer", () => {
    for (const p of READS) expect(can("viewer", p)).toBe(true);
  });

  it("denies EVERY mutation to viewer (§88 viewer mutation)", () => {
    for (const p of MUTATIONS) expect(can("viewer", p)).toBe(false);
  });
});

describe("can() — admin has operational writes but not platform control", () => {
  it("grants operational mutations to admin", () => {
    for (const p of ["broadcast.send", "buildings.modify", "payments.create", "tenants.modify", "management.approve"] as Permission[]) {
      expect(can("admin", p)).toBe(true);
    }
  });

  it("denies platform-control permissions to admin (§88 role escalation)", () => {
    // Only superadmin may manage other admins or platform security.
    expect(can("admin", "admins.manage")).toBe(false);
    expect(can("admin", "security.manage")).toBe(false);
  });
});

describe("can() — superadmin has everything", () => {
  it("grants all permissions to superadmin", () => {
    for (const p of ALL_PERMISSIONS) expect(can("superadmin", p)).toBe(true);
  });
});

describe("can() — fails safe", () => {
  it("denies when role is null/undefined (no session → no access)", () => {
    expect(can(null, "buildings.read")).toBe(false);
    expect(can(undefined, "buildings.read")).toBe(false);
  });

  it("denies for an unknown role string (defensive, no matrix entry)", () => {
    expect(can("root" as unknown as PanelRole, "security.manage")).toBe(false);
    expect(can("" as unknown as PanelRole, "buildings.read")).toBe(false);
  });
});

describe("permission isolation — privilege ordering holds", () => {
  it("viewer ⊂ admin ⊂ superadmin (each role's grants are a superset of the weaker one)", () => {
    const v = new Set(permissionsFor("viewer"));
    const a = new Set(permissionsFor("admin"));
    const s = new Set(permissionsFor("superadmin"));
    for (const p of v) expect(a.has(p)).toBe(true);
    for (const p of a) expect(s.has(p)).toBe(true);
    // strictly increasing
    expect(a.size).toBeGreaterThan(v.size);
    expect(s.size).toBeGreaterThan(a.size);
  });

  it("the two platform-control permissions are superadmin-exclusive", () => {
    for (const role of ["viewer", "admin"] as PanelRole[]) {
      expect(can(role, "admins.manage")).toBe(false);
      expect(can(role, "security.manage")).toBe(false);
    }
    expect(can("superadmin", "admins.manage")).toBe(true);
    expect(can("superadmin", "security.manage")).toBe(true);
  });
});
