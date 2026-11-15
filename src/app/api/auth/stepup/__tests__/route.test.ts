// PANEL-PAY א1 (החלטה 364, C4): POST /api/auth/stepup — שליחת קוד למייל ואימות. הקוד נשמר רק כ-HMAC, שימוש אחד,
// 10 דקות, עד 5 ניסיונות; קוד נכון → עוגיית אישור חתומה, קשורה למנהל ולסשן הזה.
import { describe, it, expect, beforeEach, vi } from "vitest";

const SESSION = { id: "11111111-1111-4111-8111-111111111111", email: "tal@bloc.co.il", full_name: "טל", role: "superadmin", auth_level: "mfa" };
let guardResult: any;
let adminRow: any;
let readError: any = null;
let saveError: any = null;
let consumeLost = false;
const writes: any[] = [];
const audits: any[][] = [];
const sent: Array<{ to: string; code: string }> = [];
let sendOk = true;
let sendAllowed = true;
let limiterDown = false;
const tries = new Map<string, number>();

vi.mock("@/lib/guard", () => ({ guard: async () => guardResult }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/email", () => ({ sendStepUpCode: async (to: string, code: string) => { sent.push({ to, code }); return sendOk ? { ok: true } : { ok: false, error: "x" }; } }));
vi.mock("@/lib/ratelimit", () => ({
  otpRatelimit: { limit: async () => ({ success: sendAllowed }) },
  otpTriesRatelimit: {
    limit: async (k: string) => {
      if (limiterDown) throw new Error("redis down");
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
        if (saveError) return { data: null, error: saveError };
        const cas = q.filters.find((f: any[]) => f[0] === "otp_code");
        const match = !consumeLost && (!cas || adminRow.otp_code === cas[1]);
        writes.push({ table, payload: q.payload, filters: [...q.filters], matched: match });
        if (match) Object.assign(adminRow, q.payload);
        return { data: match ? [{ id: SESSION.id }] : [], error: null };
      };
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { q.filters.push([c, v]); return chain; },
        update: (p: any) => { q.op = "update"; q.payload = p; return chain; },
        maybeSingle: async () => exec(),
        then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
      };
      return chain;
    },
  },
}));

import { POST } from "../route";
import { otpStoredValue } from "@/lib/otp";
import { checkStepUpToken, sessionBinding, readCookie, requireStepUp, STEPUP_COOKIE } from "@/lib/stepUp";

const SESSION_COOKIE = "blocpanel_session=jwt-of-this-login";
const req = (body: any, cookie: string | null = SESSION_COOKIE, ip: string | null = "5.6.7.8, 10.0.0.1"): any => ({
  json: async () => body,
  headers: { get: (n: string) => (n === "cookie" ? cookie : n === "x-forwarded-for" ? ip : null) },
});
const future = () => new Date(Date.now() + 9 * 60_000).toISOString();
const tokenOf = (res: Response) => readCookie((res.headers.get("set-cookie") ?? "").split(";")[0], STEPUP_COOKIE);

beforeEach(() => {
  guardResult = { ok: true, session: { ...SESSION } };
  adminRow = { otp_code: null, otp_expires: null };
  readError = null; saveError = null; consumeLost = false; sendOk = true; sendAllowed = true; limiterDown = false;
  writes.length = 0; audits.length = 0; sent.length = 0; tries.clear();
});

describe("who can ask", () => {
  it("the guard's refusal passes through; a viewer has no money actions (403); a bad body is 400", async () => {
    guardResult = { ok: false, response: new Response(null, { status: 401 }) };
    expect((await POST(req({ action: "send" }))).status).toBe(401);
    guardResult = { ok: true, session: { ...SESSION, role: "viewer" } };
    expect((await POST(req({ action: "send" }))).status).toBe(403);
    guardResult = { ok: true, session: { ...SESSION } };
    expect((await POST(req({ action: "verify", code: "12345" }))).status).toBe(400);
    expect((await POST(req({ action: "nope" }))).status).toBe(400);
    expect(sent).toHaveLength(0);
  });
  it("no session cookie → 401 (the step-up is bound to the session)", async () => {
    expect((await POST(req({ action: "send" }, null))).status).toBe(401);
  });
});

describe("send", () => {
  it("stores only the HMAC (purpose money), 10 minutes; emails the code to the admin; the answer has a masked address, never the code", async () => {
    const res = await POST(req({ action: "send" }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.sent_to).toBe("t•••@bloc.co.il");
    expect(j.dev_code).toBeUndefined();
    expect(JSON.stringify(j)).not.toContain(sent[0].code);
    expect(sent).toEqual([{ to: "tal@bloc.co.il", code: expect.any(String) }]);
    expect(sent[0].code).toMatch(/^\d{6}$/);
    expect(adminRow.otp_code).toBe(otpStoredValue(SESSION.id, "money", sent[0].code));
    expect(adminRow.otp_code).not.toContain(sent[0].code);
    const left = Date.parse(adminRow.otp_expires) - Date.now();
    expect(left).toBeGreaterThan(9 * 60_000);
    expect(left).toBeLessThanOrEqual(10 * 60_000);
    expect(audits.map((a) => a[1])).toEqual(["STEPUP_SENT"]);
    expect(audits[0][5]).toBe("5.6.7.8");
    expect(JSON.stringify(audits)).not.toContain(sent[0].code);
  });
  it("too many sends → 429, nothing stored or sent", async () => {
    sendAllowed = false;
    const res = await POST(req({ action: "send" }));
    expect(res.status).toBe(429);
    expect(writes).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
  it("the code cannot be saved → 503, no email", async () => {
    saveError = { message: "db down" };
    expect((await POST(req({ action: "send" }))).status).toBe(503);
    expect(sent).toHaveLength(0);
  });
  it("outside production, a failed email returns the code so nobody is locked out (like the login)", async () => {
    sendOk = false;
    const j = await (await POST(req({ action: "send" }))).json();
    expect(j.dev_code).toBe(sent[0].code);
  });
});

describe("verify", () => {
  async function sendCode(): Promise<string> {
    await POST(req({ action: "send" }));
    return sent[sent.length - 1].code;
  }
  it("the right code → a signed step-up cookie for this admin and this session (10 minutes); the code is used up", async () => {
    const code = await sendCode();
    const res = await POST(req({ action: "verify", code }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Max-Age=600");
    const tok = tokenOf(res);
    expect(checkStepUpToken({ token: tok, adminId: SESSION.id, sid: sessionBinding("jwt-of-this-login"), purpose: "money", nowMs: Date.now() })).toBe("ok");
    expect(adminRow.otp_code).toBeNull();
    const consume = writes[writes.length - 1];
    expect(consume.filters).toContainEqual(["otp_code", otpStoredValue(SESSION.id, "money", code)]);   // only if still the same code
    expect(audits.map((a) => a[1])).toEqual(["STEPUP_SENT", "STEPUP_VERIFIED"]);
    // the money gate accepts it — with this session's cookie only
    const cookieHeader = `blocpanel_session=jwt-of-this-login; ${STEPUP_COOKIE}=${tok}`;
    expect(requireStepUp(SESSION, { headers: { get: () => cookieHeader } }).ok).toBe(true);
    expect(requireStepUp(SESSION, { headers: { get: () => `blocpanel_session=another-login; ${STEPUP_COOKIE}=${tok}` } }).ok).toBe(false);
  });
  it("single use: the same code a second time → 400, no cookie", async () => {
    const code = await sendCode();
    await POST(req({ action: "verify", code }));
    const again = await POST(req({ action: "verify", code }));
    expect(again.status).toBe(400);
    expect(again.headers.get("set-cookie")).toBeNull();
  });
  it("two requests with one code: the one that loses the conditional clear gets 400 'used', no cookie", async () => {
    const code = await sendCode();
    consumeLost = true;
    const res = await POST(req({ action: "verify", code }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("used");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("wrong code: 4, 3, 2, 1 tries left, the 5th wrong clears the code (STEPUP_LOCKED); after that — send a new one", async () => {
    const code = await sendCode();
    const wrong = code === "000000" ? "000001" : "000000";
    const left: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await POST(req({ action: "verify", code: wrong }));
      expect(r.status).toBe(400);
      left.push((await r.json()).remaining);
    }
    expect(left).toEqual([4, 3, 2, 1, 0]);
    expect(adminRow.otp_code).toBeNull();
    expect(audits.map((a) => a[1])).toContain("STEPUP_LOCKED");
    const late = await POST(req({ action: "verify", code }));     // even the right code — it is gone
    expect(late.status).toBe(400);
    expect(late.headers.get("set-cookie")).toBeNull();
  });
  it("tries exhausted (the limiter refuses) → 429 and the code is cleared, even if it is right", async () => {
    const code = await sendCode();
    // this code's counter is already full (5 tries used elsewhere)
    const stored = otpStoredValue(SESSION.id, "money", code);
    tries.set(`money:${SESSION.id}:${stored.slice(-24)}`, 5);
    const res = await POST(req({ action: "verify", code }));
    expect(res.status).toBe(429);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(adminRow.otp_code).toBeNull();
  });
  it("the limiter is down → 503, the code stays, no cookie", async () => {
    const code = await sendCode();
    limiterDown = true;
    const res = await POST(req({ action: "verify", code }));
    expect(res.status).toBe(503);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(adminRow.otp_code).toBe(otpStoredValue(SESSION.id, "money", code));
  });
  it("expired → 400 'expired', no try used", async () => {
    adminRow = { otp_code: otpStoredValue(SESSION.id, "money", "123456"), otp_expires: new Date(Date.now() - 1000).toISOString() };
    const res = await POST(req({ action: "verify", code: "123456" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("expired");
    expect(tries.size).toBe(0);
  });
  it("a login code never approves money", async () => {
    adminRow = { otp_code: otpStoredValue(SESSION.id, "login", "123456"), otp_expires: future() };
    const res = await POST(req({ action: "verify", code: "123456" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("the read fails → 503 read_failed in Hebrew (not 'no code')", async () => {
    readError = { message: "timeout" };
    const res = await POST(req({ action: "verify", code: "123456" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "לא הצלחנו לבדוק — שום דבר לא השתנה. נסו שוב.", code: "read_failed" });
  });
  it("the code cannot be cleared → 503, no cookie", async () => {
    const code = await sendCode();
    saveError = { message: "db down" };
    const res = await POST(req({ action: "verify", code }));
    expect(res.status).toBe(503);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
