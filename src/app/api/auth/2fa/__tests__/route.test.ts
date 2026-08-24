import { describe, it, expect, beforeEach, vi } from "vitest";

// Session returned to the route (pre_mfa admin being challenged).
let currentSession: any = null;
let adminOtpRow: any = null;
const inserts: any[] = [];
const updates: any[] = [];
const cookieSet: any[] = [];

vi.mock("@/lib/auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getSession: async () => currentSession,
    getSessionToken: async () => "old-pre-mfa-token",
    setSessionCookie: async (t: string) => { cookieSet.push(t); },
    // keep real signToken/hashToken so we exercise real assurance encoding
  };
});

vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = {
        _table: table,
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: adminOtpRow }),
        insert: (row: any) => { inserts.push({ table, row }); return Promise.resolve({ error: null }); },
        update: (row: any) => { updates.push({ table, row }); return chain; },
      };
      return chain;
    },
  },
}));

// Rate limit + resend: always allow / no-op
vi.mock("@/lib/ratelimit", () => ({ otpRatelimit: { limit: async () => ({ success: true }) } }));
vi.mock("resend", () => ({ Resend: class { emails = { send: async () => ({ error: null }) }; } }));

import { POST } from "../route";
import { verifyToken } from "@/lib/auth";

const reqWith = (body: any): any => ({ json: async () => body, headers: { get: () => null } });

beforeEach(() => {
  currentSession = null; adminOtpRow = null;
  inserts.length = 0; updates.length = 0; cookieSet.length = 0;
});

describe("POST /api/auth/2fa — verify mints a full session", () => {
  it("401 without a (pre-MFA) session", async () => {
    currentSession = null;
    expect((await POST(reqWith({ action: "verify", code: "123456" }))).status).toBe(401);
  });

  it("rejects a wrong OTP code", async () => {
    currentSession = { id: "a1", email: "a@x.co", full_name: "A", role: "admin" };
    adminOtpRow = { otp_code: "111111", otp_expires: new Date(Date.now() + 60000).toISOString() };
    const res = await POST(reqWith({ action: "verify", code: "999999" }));
    expect(res.status).toBe(400);
  });

  it("rejects an expired OTP", async () => {
    currentSession = { id: "a1", email: "a@x.co", full_name: "A", role: "admin" };
    adminOtpRow = { otp_code: "123456", otp_expires: new Date(Date.now() - 1000).toISOString() };
    expect((await POST(reqWith({ action: "verify", code: "123456" }))).status).toBe(400);
  });

  it("on correct OTP: issues a fresh mfa token, revokes the old session, sets cookie", async () => {
    currentSession = { id: "a1", email: "a@x.co", full_name: "A", role: "admin" };
    adminOtpRow = { otp_code: "123456", otp_expires: new Date(Date.now() + 60000).toISOString() };
    const res = await POST(reqWith({ action: "verify", code: "123456" }));
    expect(res.status).toBe(200);

    // A new panel_sessions row with auth_level mfa was inserted.
    const newSession = inserts.find(i => i.table === "panel_sessions");
    expect(newSession?.row.auth_level).toBe("mfa");
    expect(newSession?.row.mfa_verified_at).toBeTruthy();

    // The old pre-MFA session was revoked.
    const revoke = updates.find(u => u.table === "panel_sessions" && u.row.revoked_at);
    expect(revoke).toBeTruthy();

    // A new cookie was set, and its token decodes to auth_level mfa.
    expect(cookieSet).toHaveLength(1);
    const decoded = await verifyToken(cookieSet[0]);
    expect(decoded?.auth_level).toBe("mfa");
    expect(decoded?.id).toBe("a1");
  });
});
