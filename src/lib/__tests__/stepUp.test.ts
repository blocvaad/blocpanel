// PANEL-PAY א1 (החלטה 364, C4): האישור לפעולת כסף — עוגייה חתומה (מפתח-משנה של PANEL_JWT_SECRET) עם המנהל, הסשן,
// המטרה ('money') ותוקף של 10 דקות. נפסל: פג, מטרה אחרת, סשן אחר, מנהל אחר, ערך ששונה, מפתח אחר.
import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  issueStepUpToken, checkStepUpToken, sessionBinding, readCookie, stepUpCookieHeader, requireStepUp, stepUpState,
  STEPUP_COOKIE, PANEL_SESSION_COOKIE,
} from "../stepUp";
import { STEPUP_REQUIRED_CODE, STEPUP_REQUIRED_TEXT, STEPUP_TTL_MS } from "../stepUpShared";
import { panelSubkey } from "../panelSecret";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const T0 = Date.parse("2026-11-15T10:00:00Z");
const SID = sessionBinding("session-token-1")!;
const SID2 = sessionBinding("session-token-2")!;

/** אסימון בחתימה אמיתית עם שדות לבחירה — כדי לבדוק אסימון "אמיתי" של מטרה / תוקף אחרים. אותו קלט חתימה כמו ב-lib. */
function craft(admin: string, sid: string, purpose: string, expMs: number, key: Buffer = panelSubkey("stepup")): string {
  const exp = String(expMs).padStart(13, "0");
  const sig = createHmac("sha256", key).update(`blocpanel/stepup/v1|${admin}|${sid}|${purpose}|${exp}`).digest("base64url");
  return `su1.${admin}.${sid}.${purpose}.${exp}.${sig}`;
}
const check = (token: string | null, o: Partial<{ adminId: string; sid: string | null; nowMs: number; key: Buffer }> = {}) =>
  checkStepUpToken({ token, adminId: o.adminId ?? A, sid: o.sid === undefined ? SID : o.sid, purpose: "money", nowMs: o.nowMs ?? T0, key: o.key });

describe("issue → check", () => {
  it("a fresh token for this admin, this session and 'money' is ok for 10 minutes", () => {
    const t = issueStepUpToken({ adminId: A, sid: SID, nowMs: T0 });
    expect(t.token).toMatch(/^su1\.[0-9a-f-]{36}\.[0-9a-f]{32}\.money\.\d{13}\.[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(t.expiresAt)).toBe(T0 + STEPUP_TTL_MS);
    expect(t.maxAgeSec).toBe(600);
    expect(check(t.token)).toBe("ok");
    expect(check(t.token, { nowMs: T0 + STEPUP_TTL_MS - 1 })).toBe("ok");
  });
  it("expiry: at 10 minutes and after → expired", () => {
    const t = issueStepUpToken({ adminId: A, sid: SID, nowMs: T0 }).token;
    expect(check(t, { nowMs: T0 + STEPUP_TTL_MS })).toBe("expired");
    expect(check(t, { nowMs: T0 + 3_600_000 })).toBe("expired");
  });
  it("wrong purpose: a genuinely signed token for another purpose is refused", () => {
    expect(check(craft(A, SID, "login", T0 + 60_000))).toBe("purpose");
    expect(check(craft(A, SID, "admin", T0 + 60_000))).toBe("purpose");
  });
  it("other session: the same admin's token from another login does not count here", () => {
    const t = issueStepUpToken({ adminId: A, sid: SID2, nowMs: T0 }).token;
    expect(check(t)).toBe("session");
    expect(check(issueStepUpToken({ adminId: A, sid: SID, nowMs: T0 }).token, { sid: null })).toBe("session");
  });
  it("other admin: a token issued to B is not A's", () => {
    expect(check(issueStepUpToken({ adminId: B, sid: SID, nowMs: T0 }).token)).toBe("admin");
  });
  it("tampered cookie: any changed field or signature character → signature", () => {
    const t = issueStepUpToken({ adminId: A, sid: SID, nowMs: T0 }).token;
    const parts = t.split(".");
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
    expect(check([...parts.slice(0, 5), flip(parts[5])].join("."))).toBe("signature");
    const later = String(Number(parts[4]) + 3_600_000).padStart(13, "0");
    expect(check([...parts.slice(0, 4), later, parts[5]].join("."))).toBe("signature");      // longer validity, same signature
    expect(check([parts[0], B, ...parts.slice(2)].join("."), { adminId: B })).toBe("signature"); // someone else's id swapped in
    expect(check([parts[0], parts[1], SID2, ...parts.slice(3)].join("."), { sid: SID2 })).toBe("signature");
  });
  it("another PANEL_JWT_SECRET (or the OTP sub-key) → signature", () => {
    const other = panelSubkey("stepup", { PANEL_JWT_SECRET: "another-secret-another-secret-123", NODE_ENV: "test" });
    expect(check(issueStepUpToken({ adminId: A, sid: SID, nowMs: T0, key: other }).token)).toBe("signature");
    expect(check(craft(A, SID, "money", T0 + 60_000, panelSubkey("otp")))).toBe("signature");
  });
  it("missing / not our format (a session JWT is not a step-up) → missing / format", () => {
    expect(check(null)).toBe("missing");
    expect(check("")).toBe("missing");
    expect(check("eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImExIn0.c2ln")).toBe("format");
    expect(check("su1.a.b.money.1.x")).toBe("format");
  });
  it("a validity longer than 10 minutes cannot be issued — a crafted one is refused as future", () => {
    expect(check(craft(A, SID, "money", T0 + STEPUP_TTL_MS + 120_000))).toBe("future");
  });
  it("issue refuses a bad admin id or session binding", () => {
    expect(() => issueStepUpToken({ adminId: "a.b", sid: SID, nowMs: T0 })).toThrow();
    expect(() => issueStepUpToken({ adminId: A, sid: "not-hex", nowMs: T0 })).toThrow();
  });
});

describe("cookies", () => {
  it("sessionBinding: 32 hex, stable, different per session token; no cookie → null", () => {
    expect(SID).toMatch(/^[0-9a-f]{32}$/);
    expect(sessionBinding("session-token-1")).toBe(SID);
    expect(SID2).not.toBe(SID);
    expect(sessionBinding(null)).toBeNull();
    expect(sessionBinding("")).toBeNull();
  });
  it("readCookie finds one cookie among several", () => {
    const h = `theme=dark; ${PANEL_SESSION_COOKIE}=abc.def; ${STEPUP_COOKIE}=su1.x ;other=a%20b`;
    expect(readCookie(h, PANEL_SESSION_COOKIE)).toBe("abc.def");
    expect(readCookie(h, STEPUP_COOKIE)).toBe("su1.x");
    expect(readCookie(h, "other")).toBe("a b");
    expect(readCookie(h, "nope")).toBeNull();
    expect(readCookie(null, STEPUP_COOKIE)).toBeNull();
  });
  it("Set-Cookie: httpOnly, SameSite=Strict, path /, 10 minutes; Secure only when asked (production)", () => {
    const h = stepUpCookieHeader("su1.tok", 600, true);
    expect(h).toBe("blocpanel_stepup=su1.tok; Path=/; Max-Age=600; HttpOnly; SameSite=Strict; Secure");
    expect(stepUpCookieHeader("su1.tok", 600, false)).not.toContain("Secure");
  });
});

describe("requireStepUp (the gate in every money route)", () => {
  const req = (cookie: string | null) => ({ headers: { get: (n: string) => (n.toLowerCase() === "cookie" ? cookie : null) } });
  const good = issueStepUpToken({ adminId: A, sid: SID, nowMs: Date.now() }).token;
  it("without a step-up: 403 { code: 'stepup_required' } with the Hebrew sentence", async () => {
    const r = requireStepUp({ id: A }, req(`${PANEL_SESSION_COOKIE}=session-token-1`));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing");
    expect(r.response.status).toBe(403);
    expect(await r.response.json()).toEqual({ error: STEPUP_REQUIRED_TEXT, code: STEPUP_REQUIRED_CODE });
  });
  it("with this session's fresh step-up → ok", () => {
    expect(requireStepUp({ id: A }, req(`${PANEL_SESSION_COOKIE}=session-token-1; ${STEPUP_COOKIE}=${good}`))).toEqual({ ok: true });
  });
  it("a new login (another session cookie) needs a new step-up; another admin too", () => {
    expect(stepUpState({ id: A }, req(`${PANEL_SESSION_COOKIE}=session-token-2; ${STEPUP_COOKIE}=${good}`))).toBe("session");
    expect(stepUpState({ id: B }, req(`${PANEL_SESSION_COOKIE}=session-token-1; ${STEPUP_COOKIE}=${good}`))).toBe("admin");
    expect(stepUpState({ id: A }, req(`${STEPUP_COOKIE}=${good}`))).toBe("session");
  });
  it("expired → 403 again", () => {
    const r = requireStepUp({ id: A }, req(`${PANEL_SESSION_COOKIE}=session-token-1; ${STEPUP_COOKIE}=${good}`), Date.now() + STEPUP_TTL_MS + 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });
});

describe("wiring", () => {
  it("the signature is compared timing-safe; the step-up has its own sub-key (not the session's secret)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src", "lib", "stepUp.ts"), "utf8");
    expect(src).toContain("timingSafeEqual(want, got)");
    expect(src).toContain('panelSubkey("stepup")');
    expect(src).not.toMatch(/process\.env\.PANEL_JWT_SECRET/);
  });
});

