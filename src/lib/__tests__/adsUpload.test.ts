// putSignedImage (PANEL-PAY א2ב, החלטה 372; סקירה #9): ה-PUT לכתובת החתומה — redirect ידני (כתובת אחרת לא מקבלת את
// התמונה או את המפתח), קצב זמן שמבטל, ו-2xx בלבד = נשמר.
import { describe, it, expect } from "vitest";
import { putSignedImage, PUT_TIMEOUT_MS } from "../adsUpload";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const URL0 = "https://x.supabase.co/storage/v1/object/upload/sign/ads/creatives/2026-11/a.webp?token=t";
const body = new Uint8Array([1, 2, 3]).buffer;

describe("putSignedImage", () => {
  it("PUT with redirect manual and no-store, the bytes and the headers; 2xx → ok", async () => {
    const seen: { url: string; init: any }[] = [];
    const r = await putSignedImage(URL0, body, "image/webp", {
      anonKey: "k", fetchImpl: (async (url: string, init: any) => { seen.push({ url, init }); return new Response("{}", { status: 200 }); }) as any,
    });
    expect(r).toEqual({ ok: true });
    expect(seen[0].url).toBe(URL0);
    expect(seen[0].init.method).toBe("PUT");
    expect(seen[0].init.redirect).toBe("manual");
    expect(seen[0].init.cache).toBe("no-store");
    expect(seen[0].init.headers).toEqual({ "content-type": "image/webp", "cache-control": "max-age=31536000", "x-upsert": "false", apikey: "k", authorization: "Bearer k" });
    expect(seen[0].init.signal).toBeDefined();
  });
  it("a redirect (3xx) or any non-2xx → put_rejected with the status — never followed", async () => {
    for (const status of [301, 302, 307, 400, 403, 409, 413, 500]) {
      const r = await putSignedImage(URL0, body, "image/webp", { fetchImpl: (async () => new Response("", { status, headers: status < 400 ? { location: "https://evil.example/" } : {} })) as any });
      expect(r, String(status)).toEqual({ ok: false, status, code: "put_rejected" });
    }
  });
  it("no answer within the timeout → aborted → put_timeout (504)", async () => {
    const r = await putSignedImage(URL0, body, "image/webp", {
      timeoutMs: 20,
      fetchImpl: ((_u: string, init: any) => new Promise((_res, rej) => {
        init.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); });
      })) as any,
    });
    expect(r).toEqual({ ok: false, status: 504, code: "put_timeout" });
  });
  it("the default timeout is 25 s (a hung PUT never runs to maxDuration)", () => {
    expect(PUT_TIMEOUT_MS).toBe(25_000);
    expect(readFileSync(join(process.cwd(), "src", "lib", "adsUpload.ts"), "utf8")).toContain("setTimeout(() => ctrl.abort(), opts.timeoutMs ?? PUT_TIMEOUT_MS)");
  });
  it("a network error → put_network (502)", async () => {
    const r = await putSignedImage(URL0, body, "image/webp", { fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as any });
    expect(r).toEqual({ ok: false, status: 502, code: "put_network" });
  });
});
