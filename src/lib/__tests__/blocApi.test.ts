import { describe, it, expect, vi } from "vitest";
import { signPanelRequest, blocConfig, callBloc, hostOf, panelHosts, PANEL_SIG_HEADER, PANEL_TS_HEADER } from "../blocApi";
import { PANEL_SESSION_CODE, PANEL_SESSION_ENDED } from "../panelSession";

// אותו וקטור בדיוק נבדק ב-bloc (tests/lib/panelSignature.test.ts).
const SECRET = "bloc-panel-test-secret-0123456789abcdef";
const VECTOR = "c37d5887f2f09366ea9eb62ba2942bd02bba96ad4710e5a40726f4e0bdac9997";
const CFG = { url: "https://www.blocvaad.co.il", secret: SECRET };

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("blocApi — signing", () => {
  it("matches the shared vector", () => {
    expect(signPanelRequest(SECRET, "1790000000000", '{"action":"cancel","request_id":"x"}')).toBe(VECTOR);
  });
  it("config: https URL + strong secret, or nothing", () => {
    expect(blocConfig({ BLOC_APP_URL: "https://www.blocvaad.co.il/", PANEL_ACTION_SECRET: SECRET })).toEqual(CFG);
    expect(blocConfig({ BLOC_APP_URL: "http://www.blocvaad.co.il", PANEL_ACTION_SECRET: SECRET, NODE_ENV: "production" })).toBeNull();
    expect(blocConfig({ BLOC_APP_URL: "https://www.blocvaad.co.il", PANEL_ACTION_SECRET: "short" })).toBeNull();
    expect(blocConfig({})).toBeNull();
  });
  it("UI-R5c-1: the vercel.app origin is a valid target; the Vercel bypass key is read only when set", () => {
    expect(blocConfig({ BLOC_APP_URL: "https://bloc-azure.vercel.app", PANEL_ACTION_SECRET: SECRET })).toEqual({ url: "https://bloc-azure.vercel.app", secret: SECRET });
    expect(blocConfig({ BLOC_APP_URL: "https://bloc-azure.vercel.app", PANEL_ACTION_SECRET: SECRET, BLOC_PROTECTION_BYPASS: " byp-123 " }))
      .toEqual({ url: "https://bloc-azure.vercel.app", secret: SECRET, bypass: "byp-123" });
  });
});

describe("blocApi — callBloc", () => {
  it("not configured → 503 without a request", async () => {
    const f = vi.fn();
    expect(await callBloc("/api/internal/committee", {}, { config: null, fetchImpl: f })).toMatchObject({ ok: false, status: 503, code: "NOT_CONFIGURED" });
    expect(f).not.toHaveBeenCalled();
  });
  it("signs the exact body with a timestamp, no redirects followed", async () => {
    const f = vi.fn(async () => res(200, { ok: true, id: "r1" }));
    const r = await callBloc("/api/internal/committee", { action: "cancel", request_id: "x" }, { config: CFG, fetchImpl: f, now: () => 1790000000000 });
    expect(r).toEqual({ ok: true, status: 200, data: { ok: true, id: "r1" } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.blocvaad.co.il/api/internal/committee");
    const h = init.headers as Record<string, string>;
    expect(h[PANEL_TS_HEADER]).toBe("1790000000000");
    expect(h[PANEL_SIG_HEADER]).toBe(VECTOR);
    expect(init.redirect).toBe("manual");
    expect(h["user-agent"]).toMatch(/^blocpanel\//);
    expect(h["x-vercel-protection-bypass"]).toBeUndefined();
  });
  it("UI-R5c-1: with a bypass key, it travels in the Vercel header (the signature still signs only the body)", async () => {
    const f = vi.fn(async () => res(200, { ok: true }));
    await callBloc("/api/internal/broadcast", { action: "delete" }, { config: { ...CFG, bypass: "byp-123" }, fetchImpl: f, now: () => 1790000000000 });
    const h = (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(h["x-vercel-protection-bypass"]).toBe("byp-123");
    expect(h[PANEL_SIG_HEADER]).toBe(signPanelRequest(SECRET, "1790000000000", '{"action":"delete"}'));
  });
  it("UI-R5c-1: Vercel Deployment Protection on the vercel.app origin is named, with the fix", async () => {
    const gate = async () => new Response("<html>Authentication Required</html>", { status: 401, headers: { server: "Vercel", "content-type": "text/html" } });
    const r = await callBloc("/api/internal/broadcast", {}, { config: CFG, fetchImpl: gate });
    expect(r).toMatchObject({ ok: false, status: 502, code: "ORIGIN_PROTECTED", error: expect.stringContaining("BLOC_PROTECTION_BYPASS") });
    // 401 עם תשובה של bloc — לא שער של Vercel. הטקסט נשמר, אבל לא כ-401 (הדפדפן היה מבין "ההתחברות לפאנל הסתיימה").
    expect(await callBloc("/api/internal/broadcast", {}, { config: CFG, fetchImpl: async () => res(401, { error: "אין הרשאה", code: "UNAUTH" }, { server: "Vercel" }) }))
      .toEqual({ ok: false, status: 502, code: "UNAUTH", error: "אין הרשאה" });
  });
  it("404 without a code = signature rejected; 404 with a code = a real answer", async () => {
    expect(await callBloc("/api/internal/committee", {}, { config: CFG, fetchImpl: async () => res(404, { error: "Not found" }) }))
      .toMatchObject({ ok: false, code: "REJECTED" });
    expect(await callBloc("/api/internal/committee", {}, { config: CFG, fetchImpl: async () => res(404, { error: "אין בקשה פתוחה", code: "NOT_PENDING" }) }))
      .toEqual({ ok: false, status: 404, code: "NOT_PENDING", error: "אין בקשה פתוחה" });
  });
  it("a Cloudflare block (1010 / bot challenge) is named as such — the request never reached bloc", async () => {
    const cf = (status: number, body: string) => async () => new Response(body, { status, headers: { server: "cloudflare", "content-type": "text/plain" } });
    expect(await callBloc("/api/internal/committee", {}, { config: CFG, fetchImpl: cf(403, "error code: 1010") }))
      .toMatchObject({ ok: false, code: "EDGE_BLOCKED", error: expect.stringContaining("1010") });
    expect(await callBloc("/api/internal/committee", {}, { config: CFG, fetchImpl: cf(403, "<html>Just a moment...</html>") }))
      .toMatchObject({ ok: false, code: "EDGE_BLOCKED", error: expect.stringContaining("vercel.app") });
    // תשובת JSON של bloc דרך Cloudflare — לא חסימה
    expect(await callBloc("/api/internal/committee", {}, { config: CFG, fetchImpl: async () => new Response(JSON.stringify({ error: "ביצוע מיידי — סופר-אדמין בלבד" }), { status: 403, headers: { server: "cloudflare" } }) }))
      .toMatchObject({ ok: false, status: 403, error: "ביצוע מיידי — סופר-אדמין בלבד" });
  });
  it("redirect and network errors are explained", async () => {
    expect(await callBloc("/api/internal/committee", {}, { config: CFG, fetchImpl: async () => new Response(null, { status: 308, headers: { location: "https://www.x" } }) }))
      .toMatchObject({ ok: false, code: "REDIRECT" });
    expect(await callBloc("/api/internal/committee", {}, { config: CFG, fetchImpl: async () => { throw new Error("down"); } }))
      .toMatchObject({ ok: false, status: 504, code: "NETWORK" });
  });
});

// LINK-1: "Unauthorized" באנגלית במחיקת הודעה. 401 שחוזר מהצד השני אף פעם לא מגיע לדפדפן כ-401 — ונאמר מה הוא,
// עם הכתובת שהפאנל פנה אליה.
describe("blocApi — LINK-1: a 401 from the far side says what it is", () => {
  const BLOC = { url: "https://bloc-azure.vercel.app", secret: SECRET };
  const call = (answer: () => Promise<Response>, extra: Record<string, unknown> = {}) =>
    callBloc("/api/internal/broadcast", { action: "delete" }, { config: BLOC, fetchImpl: answer, selfHosts: [], ...extra });

  it("bloc's proxy (NO_SESSION) = the deployment at that address doesn't know the panel channel", async () => {
    const r = await call(async () => res(401, { error: "Unauthorized", code: "NO_SESSION" }, { server: "Vercel" }));
    expect(r).toMatchObject({ ok: false, status: 502, code: "OLD_BLOC" });
    const e = (r as { error: string }).error;
    expect(e).toContain("bloc-azure.vercel.app");
    expect(e).toContain("Domains");
    expect(e).toContain("Redeploy");
    expect(e).not.toContain("Unauthorized");
  });

  it("the panel's own 401 (PANEL_SESSION) = BLOC_APP_URL points at the panel", async () => {
    const r = await call(async () => res(401, { error: PANEL_SESSION_ENDED, code: PANEL_SESSION_CODE }));
    expect(r).toMatchObject({ ok: false, status: 502, code: "SELF_URL" });
    expect((r as { error: string }).error).toMatch(/מצביע על הפאנל עצמו/);
    expect((r as { error: string }).error).toContain("bloc-azure.vercel.app");
  });

  it("any other 401 (an older panel, another site) = not bloc's answer; never a raw English word", async () => {
    for (const answer of [
      async () => res(401, { error: "Unauthorized" }),
      async () => new Response("Unauthorized", { status: 401, headers: { server: "nginx", "content-type": "text/plain" } }),
    ]) {
      const r = await call(answer);
      expect(r).toMatchObject({ ok: false, status: 502, code: "UPSTREAM_401" });
      expect((r as { error: string }).error).toContain("bloc-azure.vercel.app");
      expect((r as { error: string }).error).not.toContain("Unauthorized");
    }
  });

  it("Vercel's protection page is still named as such (not swallowed by the 401 branch)", async () => {
    const r = await call(async () => new Response("<html>Authentication Required</html>", { status: 401, headers: { server: "Vercel", "content-type": "text/html" } }));
    expect(r).toMatchObject({ ok: false, status: 502, code: "ORIGIN_PROTECTED" });
  });

  it("BLOC_APP_URL = one of the panel's own addresses → said before anything is sent", async () => {
    const f = vi.fn();
    const r = await callBloc("/api/internal/broadcast", { action: "delete" }, {
      config: { url: "https://blocpanel.vercel.app", secret: SECRET }, fetchImpl: f, selfHosts: ["blocpanel.vercel.app"],
    });
    expect(r).toMatchObject({ ok: false, status: 503, code: "SELF_URL" });
    expect((r as { error: string }).error).toContain("blocpanel.vercel.app");
    expect(f).not.toHaveBeenCalled();
    // כתובת אחרת — נשלח כרגיל
    const g = vi.fn(async () => res(200, { ok: true }));
    expect(await callBloc("/api/internal/broadcast", {}, { config: BLOC, fetchImpl: g, selfHosts: ["blocpanel.vercel.app"] })).toMatchObject({ ok: true });
    expect(g).toHaveBeenCalledTimes(1);
  });

  it("the panel's own addresses come from Vercel's system variables; hosts compare without case, protocol or path", () => {
    expect(panelHosts({ VERCEL_URL: "blocpanel-k3j4-team.vercel.app", VERCEL_BRANCH_URL: " blocpanel-git-main-team.vercel.app ", VERCEL_PROJECT_PRODUCTION_URL: "BlocPanel.vercel.app" }))
      .toEqual(["blocpanel-k3j4-team.vercel.app", "blocpanel-git-main-team.vercel.app", "blocpanel.vercel.app"]);
    expect(panelHosts({})).toEqual([]);
    expect(panelHosts({ VERCEL_URL: "   ", VERCEL_BRANCH_URL: "" })).toEqual([]);
    expect(hostOf("  https://bloc-azure.vercel.app  ")).toBe("bloc-azure.vercel.app");
    expect(hostOf("https://Bloc-Azure.vercel.app/")).toBe("bloc-azure.vercel.app");
    expect(hostOf("http://localhost:3000")).toBe("localhost:3000");
    expect(hostOf("Not A Host")).toBe("not a host");   // לא כתובת — משווים כמו שהיא, בלי רישיות
  });

  it("a rejected signature names the address it went to", async () => {
    const r = await call(async () => res(404, { error: "Not found" }));
    expect(r).toMatchObject({ ok: false, status: 502, code: "REJECTED" });
    expect((r as { error: string }).error).toContain("bloc-azure.vercel.app");
  });

  it("the address sits in a bidi isolate (RTL sentence, LTR host)", async () => {
    const r = await call(async () => res(401, { error: "Unauthorized", code: "NO_SESSION" }));
    expect((r as { error: string }).error).toContain("\u2068bloc-azure.vercel.app\u2069");
  });
});
