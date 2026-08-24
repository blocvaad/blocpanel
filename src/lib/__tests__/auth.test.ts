import { describe, it, expect, beforeEach, vi } from "vitest";

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (cookieStore.has(k) ? { value: cookieStore.get(k) } : undefined),
    set: (k: string, v: string) => { cookieStore.set(k, v); },
    delete: (k: string) => { cookieStore.delete(k); },
  }),
}));

const inserted: any[] = [];
let sessionRow: any = null;
let adminRow: any = null;

vi.mock("../supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = {
        _table: table,
        select: () => chain,
        eq: () => chain,
        insert: (row: any) => { inserted.push({ table, row }); return Promise.resolve({ error: null }); },
        maybeSingle: async () =>
          table === "panel_sessions" ? { data: sessionRow } :
          table === "panel_admins"   ? { data: adminRow } : { data: null },
      };
      return chain;
    },
  },
}));

import {
  signToken, verifyToken, hashToken, getSession, requireFullSession,
  setSessionCookie, clearSessionCookie, auditLog, type PanelAdmin,
} from "../auth";

const ADMIN: PanelAdmin = {
  id: "a1", email: "admin@bloc.co.il", full_name: "Test Admin", role: "admin",
};
const future = () => new Date(Date.now() + 3600_000).toISOString();
const past   = () => new Date(Date.now() - 3600_000).toISOString();

beforeEach(() => {
  cookieStore.clear(); inserted.length = 0;
  sessionRow = null; adminRow = null;
});

describe("token round-trip", () => {
  it("signs a full token and verifies it back with auth_level=mfa", async () => {
    const t = await signToken(ADMIN, "mfa", future());
    const back = await verifyToken(t);
    expect(back?.id).toBe(ADMIN.id);
    expect(back?.auth_level).toBe("mfa");
  });
  it("defaults a pre_mfa token to auth_level=pre_mfa", async () => {
    const t = await signToken(ADMIN, "pre_mfa");
    expect((await verifyToken(t))?.auth_level).toBe("pre_mfa");
  });
  it("never assumes mfa for a pre_mfa token (fail-safe)", async () => {
    const t = await signToken(ADMIN, "pre_mfa");
    expect((await verifyToken(t))?.auth_level).not.toBe("mfa");
  });
  it("rejects a tampered token", async () => {
    const t = await signToken(ADMIN);
    expect(await verifyToken(t + "x")).toBeNull();
    expect(await verifyToken("not.a.jwt")).toBeNull();
  });
  it("hashToken is stable, distinct, and 64-hex", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
    expect(hashToken("abc")).toHaveLength(64);
  });
});

describe("session cookie lifecycle", () => {
  it("getSession returns null with no cookie", async () => {
    expect(await getSession()).toBeNull();
  });
  it("setSessionCookie → getSession recovers the admin", async () => {
    await setSessionCookie(await signToken(ADMIN, "mfa"));
    expect((await getSession())?.id).toBe(ADMIN.id);
  });
  it("clearSessionCookie invalidates the session", async () => {
    await setSessionCookie(await signToken(ADMIN, "mfa"));
    await clearSessionCookie();
    expect(await getSession()).toBeNull();
  });
});

describe("requireFullSession — MFA + revocation gate (P0.2 / P0.4)", () => {
  it("rejects when unauthenticated", async () => {
    expect(await requireFullSession()).toEqual({ ok: false, reason: "unauthenticated" });
  });
  it("rejects a pre_mfa token as mfa_required", async () => {
    await setSessionCookie(await signToken(ADMIN, "pre_mfa"));
    expect(await requireFullSession()).toEqual({ ok: false, reason: "mfa_required" });
  });
  it("rejects when the panel_session row is missing", async () => {
    await setSessionCookie(await signToken(ADMIN, "mfa", future()));
    sessionRow = null;
    const r = await requireFullSession();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("revoked");
  });
  it("rejects when the session row is explicitly revoked", async () => {
    await setSessionCookie(await signToken(ADMIN, "mfa", future()));
    sessionRow = { id: "s1", admin_id: "a1", expires_at: future(), revoked_at: past() };
    const r = await requireFullSession();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("revoked");
  });
  it("rejects when the session is expired", async () => {
    await setSessionCookie(await signToken(ADMIN, "mfa", future()));
    sessionRow = { id: "s1", admin_id: "a1", expires_at: past(), revoked_at: null };
    const r = await requireFullSession();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });
  it("rejects when the admin is disabled", async () => {
    await setSessionCookie(await signToken(ADMIN, "mfa", future()));
    sessionRow = { id: "s1", admin_id: "a1", expires_at: future(), revoked_at: null };
    adminRow = { id: "a1", role: "admin", is_active: false };
    const r = await requireFullSession();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("disabled");
  });
  it("accepts a full, live, active session and uses the DB role", async () => {
    await setSessionCookie(await signToken(ADMIN, "mfa", future()));
    sessionRow = { id: "s1", admin_id: "a1", expires_at: future(), revoked_at: null };
    adminRow = { id: "a1", role: "superadmin", is_active: true };
    const r = await requireFullSession();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.role).toBe("superadmin");
  });
});

describe("auditLog", () => {
  it("writes a panel_audit_logs row with admin identity + action", async () => {
    await auditLog(ADMIN, "BROADCAST", "announcement", undefined, { title: "x" }, "1.2.3.4");
    const row = inserted.find(i => i.table === "panel_audit_logs")?.row;
    expect(row).toMatchObject({ admin_id: "a1", action: "BROADCAST", ip_address: "1.2.3.4" });
  });
});
