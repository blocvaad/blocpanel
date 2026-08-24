// Explicit panel RBAC (audit P0.5). Authorization lives here, not scattered
// as inline `role === "viewer"` checks across routes. API handlers call
// `can(role, permission)` — the UI hiding a button is never the gate.

export type PanelRole = "superadmin" | "admin" | "viewer";

export type Permission =
  | "broadcast.send"
  | "buildings.read"
  | "buildings.modify"
  | "payments.read"
  | "payments.create"
  | "tenants.read"
  | "tenants.modify"
  | "management.approve"
  | "admins.manage"
  | "security.manage";

// viewer: read-only everywhere. admin: operational writes. superadmin: all.
const MATRIX: Record<PanelRole, Permission[]> = {
  viewer: [
    "buildings.read",
    "payments.read",
    "tenants.read",
  ],
  admin: [
    "broadcast.send",
    "buildings.read",
    "buildings.modify",
    "payments.read",
    "payments.create",
    "tenants.read",
    "tenants.modify",
    "management.approve",
  ],
  superadmin: [
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
  ],
};

export function can(role: PanelRole | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (MATRIX[role] ?? []).includes(permission);
}

/** Permissions granted to a role — handy for asserting the matrix in tests. */
export function permissionsFor(role: PanelRole): readonly Permission[] {
  return MATRIX[role] ?? [];
}
