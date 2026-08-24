import { describe, it, expect, vi } from "vitest";

// Do NOT set PANEL_JWT_SECRET: let both this test and the middleware use the
// same dev default secret, so signed tokens verify. (Setting it here would
// race the middleware's module-load read of the env and break verification.)
vi.mock("@/lib/ratelimit", () => ({
  apiRatelimit: { limit: vi.fn(async () => ({ success: true })) },
  loginRatelimit: { limit: vi.fn(async () => ({ success: true })) },
  otpRatelimit: { limit: vi.fn(async () => ({ success: true })) },
}));

import { SignJWT } from "jose";
import { middleware } from "../middleware";

// Must match the middleware's dev fallback secret.
const SECRET = new TextEncoder().encode("dev_only_insecure_secret_do_not_use_in_prod");

async function tokenWith(authLevel: string | undefined) {
  const b: any = { id: "a1", email: "a@x.co", full_name: "A", role: "admin" };
  if (authLevel !== undefined) b.auth_level = authLevel;
  return new SignJWT(b).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(SECRET);
}

function req(pathname: string, token?: string): any {
  return {
    nextUrl: { pathname },
    url: `https://panel.bloc.co.il${pathname}`,
    headers: { get: () => null },
    cookies: { get: (_k: string) => (token ? { value: token } : undefined) },
  };
}

const isBlocked = (res: any) => res.status === 401 || res.status === 429;
const isRedirect = (res: any) =>
  res.status === 307 || res.status === 308 || Boolean(res.headers?.get?.("location"));

describe("middleware — MFA enforcement (P0.2)", () => {
  it("blocks a protected API route with NO token (401)", async () => {
    expect((await middleware(req("/api/broadcast"))).status).toBe(401);
  });

  it("blocks a protected API route with a pre_mfa token (401)", async () => {
    expect((await middleware(req("/api/broadcast", await tokenWith("pre_mfa")))).status).toBe(401);
  });

  it("blocks a legacy token (no auth_level) on a protected route", async () => {
    expect((await middleware(req("/api/stats", await tokenWith(undefined)))).status).toBe(401);
  });

  it("ALLOWS a pre_mfa token to reach the 2FA challenge", async () => {
    const res = await middleware(req("/api/auth/2fa", await tokenWith("pre_mfa")));
    expect(isBlocked(res)).toBe(false);
    expect(isRedirect(res)).toBe(false);
  });

  it("ALLOWS a pre_mfa token to reach logout", async () => {
    const res = await middleware(req("/api/auth/logout", await tokenWith("pre_mfa")));
    expect(isBlocked(res)).toBe(false);
    expect(isRedirect(res)).toBe(false);
  });

  it("ALLOWS a full mfa token on a protected API route", async () => {
    const res = await middleware(req("/api/broadcast", await tokenWith("mfa")));
    expect(isBlocked(res)).toBe(false);
    expect(isRedirect(res)).toBe(false);
  });

  it("skips auth entirely for /api/auth/login", async () => {
    expect(isBlocked(await middleware(req("/api/auth/login")))).toBe(false);
  });

  it("redirects a pre_mfa token on a page route to /login", async () => {
    expect(isRedirect(await middleware(req("/overview", await tokenWith("pre_mfa"))))).toBe(true);
  });

  it("redirects a page route with no token to /login", async () => {
    expect(isRedirect(await middleware(req("/overview")))).toBe(true);
  });
});
