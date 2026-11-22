// bloc החלטה 589 (הבעלים, 22/11, "נלך לפי ההמלצות שלך"): ה-service worker של הפאנל לא שומר עותק של דפים או נתונים.
// הקובץ עצמו (public/sw.js) רץ כאן בסביבה מבודדת: ניווט — רק מהרשת, ובלי רשת דף "אין חיבור" (לא עותק ישן); כל השאר —
// לא נוגע (/api/, קבצים, דומיינים אחרים, POST); בהפעלה — כל מה שנשמר בגרסה הקודמת נמחק.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const SRC = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

function load(online = true, status = 200) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const deleted: string[] = [];
  let claimed = false;
  let skipped = false;
  const fetched: string[] = [];
  const caches = {
    keys: async () => ["blocpanel-v1", "workbox-precache"],
    delete: async (k: string) => { deleted.push(k); return true; },
    open: async () => { throw new Error("the service worker must not store anything"); },
    match: async () => { throw new Error("the service worker must not read a stored copy"); },
  };
  const self = { addEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = f; }, skipWaiting: () => { skipped = true; }, clients: { claim: async () => { claimed = true; } } };
  const fetch = async (req: { url: string }) => { fetched.push(req.url); if (!online) throw new TypeError("Failed to fetch"); return new Response("<html>הדף</html>", { status }); };
  vm.runInNewContext(SRC, { self, caches, fetch, Response, Promise });
  return { listeners, deleted, fetched, claimed: () => claimed, skipped: () => skipped };
}
function fetchEvent(url: string, mode: string, method = "GET") {
  let responded: Promise<Response> | null = null;
  return { e: { request: { url, mode, method }, respondWith: (p: Promise<Response>) => { responded = p; } }, responded: () => responded };
}

describe("the panel service worker keeps no copies (589)", () => {
  it("on install: takes over at once (the old version that kept copies does not wait for every tab to close)", () => {
    const sw = load();
    expect(sw.skipped()).toBe(false);
    sw.listeners.install({});
    expect(sw.skipped()).toBe(true);
  });

  it("on activate: every stored copy of the old version is deleted", async () => {
    const sw = load();
    let wait: Promise<unknown> | null = null;
    sw.listeners.activate({ waitUntil: (p: Promise<unknown>) => { wait = p; } });
    await wait;
    expect(sw.deleted.sort()).toEqual(["blocpanel-v1", "workbox-precache"]);
    expect(sw.claimed()).toBe(true);
  });

  it("a page: from the network; offline — the offline page (503, no-store, Hebrew), never an old copy", async () => {
    let sw = load(true);
    let ev = fetchEvent("https://panel.bloc.co.il/tenants/123", "navigate");
    sw.listeners.fetch(ev.e);
    const ok = await ev.responded()!;
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("הדף");
    sw = load(false);
    ev = fetchEvent("https://panel.bloc.co.il/dm-reports/r1", "navigate");
    sw.listeners.fetch(ev.e);
    const off = await ev.responded()!;
    expect(off.status).toBe(503);
    expect(off.headers.get("Cache-Control")).toBe("no-store");
    const html = await off.text();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("אין חיבור");
  });

  it("a page the server answers with an error (404 / 500 / a sign-in redirect) — passed on as is, not the offline page", async () => {
    for (const status of [404, 500, 302]) {
      const sw = load(true, status);
      const ev = fetchEvent("https://panel.bloc.co.il/buildings/b1", "navigate");
      sw.listeners.fetch(ev.e);
      const r = await ev.responded()!;
      expect(r.status).toBe(status);
      expect(await r.text()).toContain("הדף");
    }
  });

  it("anything that is not a page is left to the browser: /api/, files, other domains, POST", () => {
    const sw = load(true);
    for (const [url, mode, method] of [
      ["https://panel.bloc.co.il/api/dm-reports", "cors", "GET"],
      ["https://panel.bloc.co.il/api/dm-reports/one", "cors", "POST"],
      ["https://panel.bloc.co.il/_next/static/chunks/app.js", "no-cors", "GET"],
      ["https://abc.supabase.co/storage/v1/object/sign/dm-media/a/b?token=t", "cors", "GET"],
      ["https://panel.bloc.co.il/overview", "navigate", "POST"],
    ] as const) {
      const ev = fetchEvent(url, mode, method);
      sw.listeners.fetch(ev.e);
      expect(ev.responded(), url).toBeNull();
    }
    expect(sw.fetched).toEqual([]);
  });

  it("the file never stores or reads a copy", () => {
    expect(SRC).not.toMatch(/caches\.open|caches\.match|\.put\(/);
  });
});
