import { describe, it, expect, beforeEach, vi } from "vitest";

let currentSession: any = { id: "a1", email: "talyohala1@gmail.com", full_name: "טל", role: "superadmin" };
const updates: any[] = [];
let sendResult: any = { ok: true };
const sentTo: string[] = [];

vi.mock("@/lib/auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getSession: async () => currentSession,
    getSessionToken: async () => "tok",
    setSessionCookie: async () => {},
  };
});
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: () => {
      const chain: any = {
        select: () => chain, eq: () => chain,
        single: async () => ({ data: {} }),
        update: (row: any) => { updates.push(row); return chain; },
        insert: () => Promise.resolve({ error: null }),
      };
      return chain;
    },
  },
}));
vi.mock("@/lib/ratelimit", () => ({ otpRatelimit: { limit: async () => ({ success: true }) } }));
// Mock the central email helper (mirrors how bloc centralizes sending).
vi.mock("@/lib/email", () => ({
  send2FACode: async (to: string) => { sentTo.push(to); return sendResult; },
}));

import { POST } from "../route";
const reqSend = (): any => ({ json: async () => ({ action: "send" }), headers: { get: () => null } });

beforeEach(() => {
  updates.length = 0; sentTo.length = 0; sendResult = { ok: true };
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.PANEL_2FA_FALLBACK_EMAIL;
});

describe("2FA send — recipient + dev fallback", () => {
  it("sends the OTP to the admin's own email by default", async () => {
    currentSession = { id: "a1", email: "talyohala1@gmail.com", full_name: "טל", role: "superadmin" };
    const res = await POST(reqSend());
    expect(res.status).toBe(200);
    expect(sentTo[0]).toBe("talyohala1@gmail.com");
  });

  it("routes to PANEL_2FA_FALLBACK_EMAIL when set", async () => {
    process.env.PANEL_2FA_FALLBACK_EMAIL = "blocvaad@gmail.com";
    const res = await POST(reqSend());
    expect(res.status).toBe(200);
    expect(sentTo[0]).toBe("blocvaad@gmail.com");
  });

  it("stores an OTP code + expiry on the admin row", async () => {
    await POST(reqSend());
    const otpUpdate = updates.find(u => u.otp_code);
    expect(otpUpdate?.otp_code).toMatch(/^\d{6}$/);
    expect(otpUpdate?.otp_expires).toBeTruthy();
  });

  it("in non-production, returns dev_otp when email send fails (no lockout)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    sendResult = { ok: false, error: "domain not verified" };
    const res = await POST(reqSend());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.dev_otp).toMatch(/^\d{6}$/);
    vi.unstubAllEnvs();
  });

  it("500s (no code leak) when send fails in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    sendResult = { ok: false, error: "domain not verified" };
    const res = await POST(reqSend());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.dev_otp).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
