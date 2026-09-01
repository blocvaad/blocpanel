// blocpanel guard() + requireFullSession tests (audit §88).
//
// This is the real authorization chokepoint for every privileged panel route:
//   guard() -> requireFullSession() (session live/unrevoked/MFA/active-admin)
//            -> can(role, permission)
// §88 asked specifically for: MFA bypass, session revocation, disabled admin,
// role escalation. Each maps to a case below. We sign real JWTs with the dev
// secret and mock only the two edges requireFullSession touches: the cookie jar
// (next/headers) and the DB (adminClient). The logic in between runs for real.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

// Same dev fallback secret auth.ts uses when PANEL_JWT_SECRET is unset.
const SECRET = new TextEncoder().encode("dev_only_insecure_secret_do_not_use_in_prod");

let cookieToken: string | undefined;

// panel_sessions row + panel_admins row the mocked adminClient will return.
let sessionRow: { id: string; admin_id: string; expires_at: string; revoked_at: string | null } | null;
let adminRow: { id: string; role: string; is_active: boolean } | null;

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (_k: string) => (cookieToken ? { value: cookieToken } : undefined) }),
}));

vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "panel_sessions" ? { data: sessionRow } : { data: adminRow },
        }),
      }),
    }),
  },
}));

import { guard } from "@/lib/guard";

const FUTURE = () => new Date(Date.now() + 3600_000).toISOString();
const PAST   = () => new Date(Date.now() - 3600_000).toISOString();

async function signToken(opts: { role?: string; authLevel?: string | undefined } = {}) {
  const b: any = { id: "a1", email: "a@x.co", full_name: "A", role: opts.role ?? "admin" };
  if (opts.authLevel !== undefined) b.auth_level = opts.authLevel;
  else b.auth_level = "mfa";
  return new SignJWT(b).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(SECRET);
}

beforeEach(() => {
  cookieToken = undefined;
  sessionRow = { id: "s1", admin_id: "a1", expires_at: FUTURE(), revoked_at: null };
  adminRow   = { id: "a1", role: "admin", is_active: true };
});

describe("guard — session assurance (§88)", () => {
  it("no cookie -> 401 unauthenticated", async () => {
    const g = await guard();
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(401);
  });

  it("MFA BYPASS: a pre_mfa token cannot reach a privileged route -> 401", async () => {
    cookieToken = await signToken({ authLevel: "pre_mfa" });
    const g = await guard();
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(401);
  });

  it("token with NO auth_level is treated as pre_mfa (old tokens can't skip MFA) -> 401", async () => {
    cookieToken = await new SignJWT({ id: "a1", email: "a@x.co", full_name: "A", role: "admin" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(SECRET);
    const g = await guard();
    expect(g.ok).toBe(false);
  });

  it("REVOKED session -> 401", async () => {
    cookieToken = await signToken();
    sessionRow = { id: "s1", admin_id: "a1", expires_at: FUTURE(), revoked_at: PAST() };
    const g = await guard();
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(401);
  });

  it("session missing from DB -> 401 (revoked)", async () => {
    cookieToken = await signToken();
    sessionRow = null;
    const g = await guard();
    expect(g.ok).toBe(false);
  });

  it("EXPIRED session -> 401", async () => {
    cookieToken = await signToken();
    sessionRow = { id: "s1", admin_id: "a1", expires_at: PAST(), revoked_at: null };
    const g = await guard();
    expect(g.ok).toBe(false);
  });

  it("DISABLED admin -> 401 (deactivation takes effect immediately)", async () => {
    cookieToken = await signToken();
    adminRow = { id: "a1", role: "admin", is_active: false };
    const g = await guard();
    expect(g.ok).toBe(false);
  });

  it("valid full session -> ok", async () => {
    cookieToken = await signToken();
    const g = await guard();
    expect(g.ok).toBe(true);
  });
});

describe("guard — authorization (§88 role escalation)", () => {
  it("trusts DB role over token role: token says superadmin, DB says viewer", async () => {
    cookieToken = await signToken({ role: "superadmin" });   // forged/stale token role
    adminRow = { id: "a1", role: "viewer", is_active: true }; // real role in DB
    const g = await guard({ permission: "security.manage" });
    expect(g.ok).toBe(false); // viewer cannot manage security, regardless of token
    if (!g.ok) expect(g.response.status).toBe(403);
  });

  it("viewer is denied a mutation permission -> 403", async () => {
    cookieToken = await signToken({ role: "viewer" });
    adminRow = { id: "a1", role: "viewer", is_active: true };
    const g = await guard({ permission: "payments.create" });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(403);
  });

  it("admin is denied a superadmin-only role gate -> 403", async () => {
    cookieToken = await signToken({ role: "admin" });
    adminRow = { id: "a1", role: "admin", is_active: true };
    const g = await guard({ role: "superadmin" });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(403);
  });

  it("superadmin passes a security.manage permission gate", async () => {
    cookieToken = await signToken({ role: "superadmin" });
    adminRow = { id: "a1", role: "superadmin", is_active: true };
    const g = await guard({ permission: "security.manage" });
    expect(g.ok).toBe(true);
  });
});
