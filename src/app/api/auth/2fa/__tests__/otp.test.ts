// PANEL-PAY א1 (S546, החלטה 364): קוד הכניסה עובר דרך lib/otp — HMAC בלבד, שימוש אחד (ניקוי מותנה), 10 דקות, עד 5
// ניסיונות לקוד. lib/auth מדומה כולו (בלי jose), כדי שהבדיקה תרוץ בכל סביבה; route.test.ts בודק את הטוקן האמיתי.
import { describe, it, expect, beforeEach, vi } from "vitest";

const ADMIN = { id: "a1", email: "a@x.co", full_name: "A", role: "admin" as const };
let session: any = ADMIN;
let adminRow: any;
let readError: any = null;
let consumeLost = false;
let limiterDown = false;
const tries = new Map<string, number>();
const writes: any[] = [];
const signed: any[] = [];
const cookies: string[] = [];
const codes: string[] = [];

vi.mock("@/lib/auth", () => ({
  getSession: async () => session,
  getSessionToken: async () => "old-pre-mfa",
  signToken: async (p: any, level: string, at: string) => { signed.push({ p, level, at }); return "full-token"; },
  hashToken: (t: string) => `h(${t})`,
  setSessionCookie: async (t: string) => { cookies.push(t); },
}));
vi.mock("@/lib/email", () => ({ send2FACode: async (_to: string, code: string) => { codes.push(code); return { ok: true }; } }));
vi.mock("@/lib/ratelimit", () => ({
  otpRatelimit: { limit: async () => ({ success: true }) },
  otpTriesRatelimit: {
    limit: async (k: string) => {
      if (limiterDown) throw new Error("down");
      const n = (tries.get(k) ?? 0) + 1; tries.set(k, n);
      return { success: n <= 5, remaining: Math.max(0, 5 - n) };
    },
  },
}));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const q: any = { op: "select", filters: [] as any[], payload: null };
      const exec = () => {
        if (q.op === "select") return readError ? { data: null, error: readError } : { data: { ...adminRow }, error: null };
        if (q.op === "insert") { writes.push({ table, op: "insert", payload: q.payload }); return { error: null }; }
        const cas = q.filters.find((f: any[]) => f[0] === "otp_code");
        const match = table !== "panel_admins" || (!(consumeLost && cas) && (!cas || adminRow.otp_code === cas[1]));
        writes.push({ table, op: "update", payload: q.payload, filters: [...q.filters], matched: match });
        if (match && table === "panel_admins") Object.assign(adminRow, q.payload);
        return { data: match ? [{ id: "a1" }] : [], error: null };
      };
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { q.filters.push([c, v]); return chain; },
        update: (p: any) => { q.op = "update"; q.payload = p; return chain; },
        insert: (p: any) => { q.op = "insert"; q.payload = p; return Promise.resolve(exec()); },
        single: async () => exec(),
        then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
      };
      return chain;
    },
  },
}));

import { POST } from "../route";
import { otpStoredValue } from "@/lib/otp";

const req = (body: any, ip: string | null = "9.9.9.9, 10.0.0.2"): any => ({
  json: async () => body, headers: { get: (n: string) => (n === "x-forwarded-for" ? ip : null) },
});
const future = () => new Date(Date.now() + 9 * 60_000).toISOString();

beforeEach(() => {
  session = ADMIN; adminRow = { otp_code: null, otp_expires: null };
  readError = null; consumeLost = false; limiterDown = false;
  tries.clear(); writes.length = 0; signed.length = 0; cookies.length = 0; codes.length = 0;
  process.env.RESEND_API_KEY = "re_test";
});

describe("2FA with the shared OTP module", () => {
  it("send: the row gets o1.login.<HMAC> — the emailed code is not stored anywhere", async () => {
    expect((await POST(req({ action: "send" }))).status).toBe(200);
    expect(codes[0]).toMatch(/^\d{6}$/);
    expect(adminRow.otp_code).toBe(otpStoredValue("a1", "login", codes[0]));
    expect(JSON.stringify(writes)).not.toContain(`"${codes[0]}"`);
  });
  it("verify: the right code mints the full session; the code is cleared only if it is still the same (single use)", async () => {
    await POST(req({ action: "send" }));
    const res = await POST(req({ action: "verify", code: codes[0] }));
    expect(res.status).toBe(200);
    expect(signed[0].level).toBe("mfa");
    expect(cookies).toEqual(["full-token"]);
    const clear = writes.find((w) => w.table === "panel_admins" && w.payload.last_2fa);
    expect(clear.filters).toContainEqual(["otp_code", otpStoredValue("a1", "login", codes[0])]);
    expect(adminRow.otp_code).toBeNull();
    // S988: the session row keeps the first X-Forwarded-For address only (INET column)
    expect(writes.find((w) => w.table === "panel_sessions" && w.op === "insert").payload.ip_address).toBe("9.9.9.9");
    // used — the same code again does nothing
    const again = await POST(req({ action: "verify", code: codes[0] }));
    expect(again.status).toBe(400);
    expect(signed).toHaveLength(1);
  });
  it("two requests with one code: the loser of the conditional clear gets 400 'used' and no session", async () => {
    adminRow = { otp_code: otpStoredValue("a1", "login", "123456"), otp_expires: future() };
    consumeLost = true;
    const res = await POST(req({ action: "verify", code: "123456" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("used");
    expect(signed).toHaveLength(0);
    expect(cookies).toHaveLength(0);
  });
  it("wrong code: says how many tries are left; the 5th wrong clears the code", async () => {
    adminRow = { otp_code: otpStoredValue("a1", "login", "123456"), otp_expires: future() };
    const left: number[] = [];
    for (let i = 0; i < 5; i++) left.push((await (await POST(req({ action: "verify", code: "654321" }))).json()).remaining);
    expect(left).toEqual([4, 3, 2, 1, 0]);
    expect(adminRow.otp_code).toBeNull();
    expect(signed).toHaveLength(0);
  });
  it("a money (step-up) code never logs in; an expired code is refused without using a try", async () => {
    adminRow = { otp_code: otpStoredValue("a1", "money", "123456"), otp_expires: future() };
    expect((await POST(req({ action: "verify", code: "123456" }))).status).toBe(400);
    adminRow = { otp_code: otpStoredValue("a1", "login", "123456"), otp_expires: new Date(Date.now() - 1).toISOString() };
    const res = await POST(req({ action: "verify", code: "123456" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("expired");
    expect(tries.size).toBe(0);
    expect(signed).toHaveLength(0);
  });
  it("the tries limiter is down → 503 (closed); the read fails → 503 — never a session", async () => {
    adminRow = { otp_code: otpStoredValue("a1", "login", "123456"), otp_expires: future() };
    limiterDown = true;
    expect((await POST(req({ action: "verify", code: "123456" }))).status).toBe(503);
    limiterDown = false;
    readError = { message: "timeout" };
    expect((await POST(req({ action: "verify", code: "123456" }))).status).toBe(503);
    expect(signed).toHaveLength(0);
  });
});
