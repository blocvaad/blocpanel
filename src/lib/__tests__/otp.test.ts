// PANEL-PAY א1 (S546, החלטה 364): הקוד החד-פעמי — crypto.randomInt, רק HMAC נשמר (קשור למנהל ולמטרה), השוואה
// timing-safe, 10 דקות, ועד 5 ניסיונות לקוד. אותו מודול לכניסה (2FA) ולאישור פעולת כסף.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateOtpCode, otpStoredValue, issueOtp, checkOtp, takeOtpTry, otpTriesKey, otpErrorText, OTP_TTL_MS, OTP_MAX_TRIES,
} from "../otp";
import { panelSubkey } from "../panelSecret";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const T0 = Date.parse("2026-11-15T10:00:00Z");
const exp = (ms: number) => new Date(ms).toISOString();

describe("generateOtpCode", () => {
  it("draws from crypto.randomInt's range [0, 1,000,000) and keeps leading zeros", () => {
    const rand = vi.fn((min: number, max: number) => (min === 0 && max === 1_000_000 ? 42 : -1));
    expect(generateOtpCode(rand)).toBe("000042");
    expect(rand).toHaveBeenCalledWith(0, 1_000_000);
    expect(generateOtpCode(() => 999_999)).toBe("999999");
  });
  it("the real generator: always 6 digits, and Math.random is never used", () => {
    const spy = vi.spyOn(Math, "random");
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) { const c = generateOtpCode(); expect(c).toMatch(/^\d{6}$/); seen.add(c); }
    expect(seen.size).toBeGreaterThan(250);
    expect(spy).toHaveBeenCalledTimes(0);
    spy.mockRestore();
  });
});

describe("what is stored", () => {
  it("o1.<purpose>.<64 hex> — the code itself is never in it", () => {
    const s = otpStoredValue(A, "login", "123456");
    expect(s).toMatch(/^o1\.login\.[0-9a-f]{64}$/);
    expect(s).not.toContain("123456");
    expect(otpStoredValue(A, "login", "123456")).toBe(s);   // deterministic for the same admin / purpose / code
  });
  it("bound to the admin, the purpose, the code and the key", () => {
    const s = otpStoredValue(A, "login", "123456");
    expect(otpStoredValue(B, "login", "123456")).not.toBe(s);
    expect(otpStoredValue(A, "money", "123456").split(".")[2]).not.toBe(s.split(".")[2]);
    expect(otpStoredValue(A, "login", "123457")).not.toBe(s);
    const otherKey = panelSubkey("otp", { PANEL_JWT_SECRET: "another-secret-another-secret-123", NODE_ENV: "test" });
    expect(otpStoredValue(A, "login", "123456", otherKey)).not.toBe(s);
  });
  it("issueOtp: a fresh code, its HMAC, and an expiry 10 minutes from now", () => {
    const o = issueOtp({ adminId: A, purpose: "money", nowMs: T0, rand: () => 7 });
    expect(o.code).toBe("000007");
    expect(o.stored).toBe(otpStoredValue(A, "money", "000007"));
    expect(Date.parse(o.expiresAt) - T0).toBe(OTP_TTL_MS);
    expect(OTP_TTL_MS).toBe(600_000);
  });
});

describe("checkOtp", () => {
  const stored = otpStoredValue(A, "money", "482913");
  const ok = { adminId: A, purpose: "money" as const, code: "482913", stored, expiresAt: exp(T0 + OTP_TTL_MS), nowMs: T0 };
  it("the right code, in time → ok", () => {
    expect(checkOtp(ok)).toBe("ok");
    expect(checkOtp({ ...ok, nowMs: T0 + OTP_TTL_MS - 1 })).toBe("ok");
  });
  it("expired at the 10-minute mark (and after); a missing / broken expiry is expired too", () => {
    expect(checkOtp({ ...ok, nowMs: T0 + OTP_TTL_MS })).toBe("expired");
    expect(checkOtp({ ...ok, nowMs: T0 + OTP_TTL_MS + 5 })).toBe("expired");
    expect(checkOtp({ ...ok, expiresAt: null })).toBe("expired");
    expect(checkOtp({ ...ok, expiresAt: "not a date" })).toBe("expired");
  });
  it("a wrong code, or the right code of another admin → wrong", () => {
    expect(checkOtp({ ...ok, code: "482914" })).toBe("wrong");
    expect(checkOtp({ ...ok, adminId: B })).toBe("wrong");
  });
  it("wrong purpose: a login code never approves money, and a money code never logs in", () => {
    expect(checkOtp({ ...ok, purpose: "login" })).toBe("other_purpose");
    const loginStored = otpStoredValue(A, "login", "482913");
    expect(checkOtp({ ...ok, stored: loginStored })).toBe("other_purpose");
    // even if the prefix were forged to "money", the HMAC was made for "login"
    expect(checkOtp({ ...ok, stored: loginStored.replace("o1.login.", "o1.money.") })).toBe("wrong");
  });
  it("not 6 digits → format, before anything else", () => {
    for (const code of ["48291", "4829133", "48291a", "", 482913, null, undefined]) expect(checkOtp({ ...ok, code })).toBe("format");
  });
  it("nothing stored, an old clear-text code (before this change), or garbage → none", () => {
    for (const s of [null, undefined, "", "482913", "o1.money.zz", `o2.money.${"a".repeat(64)}`, 42]) expect(checkOtp({ ...ok, stored: s })).toBe("none");
  });
  it("another PANEL_JWT_SECRET → the stored HMAC does not match", () => {
    const otherKey = panelSubkey("otp", { PANEL_JWT_SECRET: "another-secret-another-secret-123", NODE_ENV: "test" });
    expect(checkOtp({ ...ok, key: otherKey })).toBe("wrong");
  });
});

describe("tries (max 5 per code, through the rate limiter)", () => {
  function limiter() {
    const counts = new Map<string, number>();
    return { counts, limit: async (k: string) => { const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return { success: n <= OTP_MAX_TRIES, remaining: Math.max(0, OTP_MAX_TRIES - n) }; } };
  }
  it("5 tries with 4, 3, 2, 1, 0 left — the 6th is refused", async () => {
    const l = limiter();
    const s = otpStoredValue(A, "money", "111111");
    const got: unknown[] = [];
    for (let i = 0; i < 6; i++) got.push(await takeOtpTry(l, A, "money", s));
    expect(got.slice(0, 5)).toEqual([4, 3, 2, 1, 0].map((remaining) => ({ ok: true, remaining })));
    expect(got[5]).toEqual({ ok: false, reason: "exhausted" });
    expect(OTP_MAX_TRIES).toBe(5);
  });
  it("the counter belongs to the code: a new code gets new tries; another admin / purpose has its own", async () => {
    const l = limiter();
    const s1 = otpStoredValue(A, "money", "111111");
    const s2 = otpStoredValue(A, "money", "222222");
    for (let i = 0; i < 5; i++) await takeOtpTry(l, A, "money", s1);
    expect(await takeOtpTry(l, A, "money", s1)).toEqual({ ok: false, reason: "exhausted" });
    expect(await takeOtpTry(l, A, "money", s2)).toEqual({ ok: true, remaining: 4 });
    expect(otpTriesKey(A, "money", s1)).not.toBe(otpTriesKey(B, "money", s1));
    expect(otpTriesKey(A, "money", s1)).not.toBe(otpTriesKey(A, "login", s1));
    expect(otpTriesKey(A, "money", otpStoredValue(A, "money", "482913"))).not.toContain("482913");
  });
  it("the limiter is down → unavailable (closed: no code is checked without counting)", async () => {
    expect(await takeOtpTry({ limit: async () => { throw new Error("redis down"); } }, A, "login", "x")).toEqual({ ok: false, reason: "unavailable" });
    expect(await takeOtpTry({ limit: async () => ({ success: false }) }, A, "login", "x")).toEqual({ ok: false, reason: "exhausted" });
    // a limiter without a remaining count — still counted, shown as 0 left
    expect(await takeOtpTry({ limit: async () => ({ success: true }) }, A, "login", "x")).toEqual({ ok: true, remaining: 0 });
  });
});

describe("messages", () => {
  it("Hebrew, without the code; how many tries are left", () => {
    expect(otpErrorText("wrong", 3)).toBe("הקוד שגוי. נשארו 3 ניסיונות.");
    expect(otpErrorText("wrong", 1)).toBe("הקוד שגוי. נשאר ניסיון אחד.");
    expect(otpErrorText("wrong", 0)).toContain("נגמרו הניסיונות");
    expect(otpErrorText("expired")).toContain("10 דקות");
    expect(otpErrorText("none")).toContain("שלחו קוד חדש");
    expect(otpErrorText("format")).toBe("הקוד הוא 6 ספרות.");
  });
});

describe("wiring (S546)", () => {
  // הקוד בלבד — בלי הערות (ההערה בראש lib/otp מזכירה את Math.random כדי לומר שאין בו שימוש).
  const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8").replace(/^\s*\/\/.*$/gm, "");
  it("lib/otp: crypto.randomInt and timingSafeEqual; no Math.random", () => {
    const s = src("lib/otp.ts");
    expect(s).toMatch(/import \{[^}]*randomInt[^}]*\} from "crypto"/);
    expect(s).toContain("timingSafeEqual(want, got)");
    expect(s).not.toMatch(/Math\.random/);
  });
  it("the login 2FA uses the shared module: no Math.random, no clear-text code stored, no === / !== on the code", () => {
    const r = src("app/api/auth/2fa/route.ts");
    expect(r).not.toMatch(/Math\.random/);
    expect(r).toContain('issueOtp({ adminId: session.id, purpose: "login" })');
    expect(r).toContain("otp_code: otp.stored");
    expect(r).not.toMatch(/otp_code\s*!==?\s*code|code\s*!==?\s*.*otp_code/);
    expect(r).toContain("checkOtp({ adminId: session.id, purpose: \"login\"");
    expect(r).toContain("takeOtpTry(otpTriesRatelimit, session.id, \"login\", stored)");
  });
});
