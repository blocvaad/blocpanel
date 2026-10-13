// LINK-1 — "Unauthorized" באנגלית במחיקת הודעה. 401 של הפאנל עצמו: בעברית, עם קוד, וכפתור להתחברות מחדש
// רק עליו. 401 שמגיע מ-bloc לא מגיע לדפדפן כ-401 (lib/__tests__/blocApi.test.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { PANEL_SESSION_CODE, PANEL_SESSION_ENDED } from "../panelSession";

let authResult: any;
vi.mock("@/lib/auth", () => ({ requireFullSession: async () => authResult }));
vi.mock("@/lib/ratelimit", () => ({ apiRatelimit: { limit: async () => ({ success: true }) } }));

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("guard — the panel's own 401", () => {
  let guard: any;
  beforeEach(async () => { ({ guard } = await import("../guard")); });

  it("every session failure is Hebrew, carries PANEL_SESSION, and is a 401", async () => {
    const seen: Record<string, string> = {};
    for (const reason of ["unauthenticated", "mfa_required", "revoked", "expired", "disabled"]) {
      authResult = { ok: false, reason };
      const g = await guard({ permission: "broadcast.manage" });
      expect(g.ok).toBe(false);
      expect(g.response.status).toBe(401);
      const body = await g.response.json();
      expect(body.code).toBe(PANEL_SESSION_CODE);
      expect(body.error).not.toMatch(/Unauthorized/i);
      expect(body.error).toMatch(/[֐-׿]/);
      seen[reason] = body.error;
    }
    expect(seen.unauthenticated).toBe(PANEL_SESSION_ENDED);
  });

  it("a live session is unchanged; a missing permission is a 403, not a session ending", async () => {
    authResult = { ok: true, session: { id: "a1", email: "ops@bloc.co.il", role: "viewer" } };
    expect(await guard()).toMatchObject({ ok: true });
    const g = await guard({ permission: "broadcast.manage" });
    expect(g.ok).toBe(false);
    expect(g.response.status).toBe(403);
    expect((await g.response.json()).code).toBeUndefined();
  });
});

describe("middleware — the panel's own 401", () => {
  let middleware: any;
  beforeEach(async () => { ({ middleware } = await import("../../middleware")); });
  const api = (cookie?: string) => new NextRequest("https://panel.test/api/broadcast", {
    method: "DELETE", headers: cookie ? { cookie: `blocpanel_session=${cookie}` } : {},
  });

  it("no session cookie on an API call → Hebrew + PANEL_SESSION (not 'Unauthorized')", async () => {
    const r = await middleware(api());
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: PANEL_SESSION_ENDED, code: PANEL_SESSION_CODE });
  });

  it("an invalid or expired token → the same answer", async () => {
    const r = await middleware(api("not-a-jwt"));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: PANEL_SESSION_ENDED, code: PANEL_SESSION_CODE });
  });

  it("a password-only (pre-MFA) token on an API call → 'נדרש אימות דו-שלבי' with the code", async () => {
    const secret = new TextEncoder().encode(process.env.PANEL_JWT_SECRET as string);
    const tok = await new SignJWT({ auth_level: "pre_mfa" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(secret);
    const r = await middleware(api(tok));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "נדרש אימות דו-שלבי", code: PANEL_SESSION_CODE });
  });

  it("pages still go to the sign-in screen", async () => {
    const r = await middleware(new NextRequest("https://panel.test/broadcast"));
    expect(r.status).toBeGreaterThanOrEqual(300);
    expect(r.status).toBeLessThan(400);
    expect(r.headers.get("location")).toBe("https://panel.test/login");
  });
});

describe("LINK-1 wiring", () => {
  const files = (dir: string): string[] => readdirSync(join(SRC, dir)).flatMap((n) => {
    const p = join(dir, n);
    if (n === "__tests__" || n === ".harness" || n === "node_modules") return [];
    return statSync(join(SRC, p)).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

  it("no answer in the panel says 'Unauthorized' in English", () => {
    const offenders = files(".").filter((f) => /["'`]Unauthorized["'`]/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("the broadcast screens offer to sign in again on the panel's own 401, and only there", () => {
    const sent = read("components/ui/SentBroadcasts.tsx");
    expect(sent.match(/<ApiErrorBanner error=\{a\.error\} login=\{a\.login\} \/>/g)).toHaveLength(4);
    expect(sent).not.toMatch(/<Banner tone="error">\{a\.error\}<\/Banner>/);
    expect(sent).toContain("setLogin(r.status === 401)");
    const form = read("components/ui/BroadcastForm.tsx");
    expect(form.match(/<ApiErrorBanner error=\{error\} login=\{login\} \/>/g)).toHaveLength(2);
    expect(form).toContain("setLogin(r.status === 401)");
    const kit = read("components/ui/broadcastKit.tsx");
    expect(kit).toMatch(/login \? <a href="\/login"[^>]*>להתחברות<\/a> : undefined/);
  });

  it("the edge middleware imports only the dependency-free session module (no node crypto via blocApi)", () => {
    const mw = read("middleware.ts");
    expect(mw).toContain('from "@/lib/panelSession"');
    expect(mw).not.toMatch(/blocApi|from "@\/lib\/guard"|from "@\/lib\/auth"/);
    expect(read("lib/panelSession.ts")).not.toMatch(/^import /m);
  });
});
