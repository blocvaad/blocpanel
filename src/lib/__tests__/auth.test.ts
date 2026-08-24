import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock next/headers cookie store ────────────────────────────────
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (cookieStore.has(k) ? { value: cookieStore.get(k) } : undefined),
    set: (k: string, v: string) => { cookieStore.set(k, v); },
    delete: (k: string) => { cookieStore.delete(k); },
  }),
}));

// ── Mock Supabase admin client (auditLog target) ──────────────────
const inserted: any[] = [];
vi.mock("../supabase", () => ({
  adminClient: {
    from: () => ({ insert: (row: any) => { inserted.push(row); return Promise.resolve({ error: null }); } }),
  },
}));

import {
  signToken, verifyToken, hashToken, getSession,
  setSessionCookie, clearSessionCookie, auditLog, type PanelAdmin,
} from "../auth";

const ADMIN: PanelAdmin = {
  id: "a1", email: "admin@bloc.co.il", full_name: "Test Admin", role: "admin",
};

beforeEach(() => { cookieStore.clear(); inserted.length = 0; });

describe("token round-trip", () => {
  it("signs and verifies a valid token back to the payload", async () => {
    const t = await signToken(ADMIN);
    const back = await verifyToken(t);
    expect(back?.id).toBe(ADMIN.id);
    expect(back?.email).toBe(ADMIN.email);
    expect(back?.role).toBe("admin");
  });

  it("rejects a tampered token", async () => {
    const t = await signToken(ADMIN);
    expect(await verifyToken(t + "x")).toBeNull();
    expect(await verifyToken("not.a.jwt")).toBeNull();
  });

  it("hashToken is stable and collision-avoidant", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
    expect(hashToken("abc")).toHaveLength(64); // sha256 hex
  });
});

describe("session cookie lifecycle", () => {
  it("getSession returns null with no cookie", async () => {
    expect(await getSession()).toBeNull();
  });

  it("setSessionCookie → getSession recovers the admin", async () => {
    const t = await signToken(ADMIN);
    await setSessionCookie(t);
    const s = await getSession();
    expect(s?.id).toBe(ADMIN.id);
  });

  it("clearSessionCookie invalidates the session", async () => {
    await setSessionCookie(await signToken(ADMIN));
    await clearSessionCookie();
    expect(await getSession()).toBeNull();
  });
});

describe("auditLog", () => {
  it("writes a panel_audit_logs row with admin identity + action", async () => {
    await auditLog(ADMIN, "BROADCAST", "announcement", undefined, { title: "x" }, "1.2.3.4");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      admin_id: "a1", admin_email: "admin@bloc.co.il", action: "BROADCAST",
      entity_type: "announcement", ip_address: "1.2.3.4",
    });
  });
});

// ── Known security gaps (audit P0.4) — pinned as expected failures ──
// These document behaviour we intend to fix. When the fix lands, remove
// `.fails` and the test becomes a passing regression guard.
describe("KNOWN GAP: session assurance (audit P0.2 / P0.4)", () => {
  it.fails("getSession should reject a token once its panel_session is revoked", async () => {
    // Today getSession trusts JWT validity alone — it never consults
    // panel_sessions, so a revoked session's JWT keeps working until expiry.
    await setSessionCookie(await signToken(ADMIN));
    const s = await getSession();
    // Intended contract: a revoked session yields null. Currently returns the admin.
    expect(s).toBeNull();
  });

  it.fails("getSession should carry an MFA assurance flag before privileged use", async () => {
    await setSessionCookie(await signToken(ADMIN));
    const s = (await getSession()) as any;
    // Intended contract: privileged session exposes mfa_verified_at. Not present today.
    expect(s?.mfa_verified_at).toBeTruthy();
  });
});
