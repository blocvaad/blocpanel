import { describe, it, expect, vi } from "vitest";
import { signPanelRequest, blocConfig, callBloc, PANEL_SIG_HEADER, PANEL_TS_HEADER } from "../blocApi";

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
      .toMatchObject({ ok: false, code: "EDGE_BLOCKED" });
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
