// MOD-1 (bloc החלטה 520) — lib/dmMediaClient: קובץ שדווח נפתח בדפדפן של איש הצוות בלבד: בקשה לפאנל (נרשם), הורדת המוצפן ישירות,
// AES-GCM עם ה-AAD של bloc (קובץ שהוחלף / מזהה אחר — לא נפתח), ו-blob רק עם סוג בטוח.
import { describe, it, expect } from "vitest";
import { MEDIA_BROKEN, MEDIA_OPEN_FAILED, decryptDmFile, fileAad, openReportedMedia } from "../dmMediaClient";

const R1 = "77777777-7777-4777-8777-777777777771", F1 = "eeee0001-0000-4000-8000-000000000001";
const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/** כמו bloc (lib/dm/crypto encryptFile): מפתח אקראי, IV אקראי, AAD של הקובץ. */
async function encrypt(plain: Uint8Array, mediaId: string) {
  const k = globalThis.crypto.getRandomValues(new Uint8Array(32)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await globalThis.crypto.subtle.importKey("raw", ab(k), { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: ab(iv), additionalData: ab(fileAad(mediaId)) }, key, ab(plain));
  return { data: ct, key: toB64(k), iv: toB64(iv) };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("opening a reported file", () => {
  it("the panel (logged), the encrypted file straight from storage, decrypted with the AAD of bloc; a blob of the safe type only", async () => {
    const plain = new Uint8Array([1, 2, 3, 4, 5]);
    const e = await encrypt(plain, F1);
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    let blob: Blob | null = null;
    const fetchImpl = async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      if (url === "/api/dm-reports/media") return json(200, { ok: true, url: "https://x.supabase.co/storage/v1/object/sign/dm-media/a/b?token=t", key: e.key, iv: e.iv, mime: "image/png", kind: "image", size: 5 });
      return new Response(e.data, { status: 200 });
    };
    const r = await openReportedMedia(R1, F1, { fetchImpl, makeUrl: (b) => { blob = b; return "blob:panel/1" } });
    expect(r).toEqual({ ok: true, url: "blob:panel/1", kind: "image", mime: "image/png" });
    expect(seen[0]).toMatchObject({ url: "/api/dm-reports/media", init: { method: "POST", credentials: "include", body: JSON.stringify({ id: R1, media_id: F1 }) } });
    expect(seen[1]).toMatchObject({ url: "https://x.supabase.co/storage/v1/object/sign/dm-media/a/b?token=t", init: { credentials: "omit", cache: "no-store" } });
    expect(blob!.type).toBe("image/png");
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(plain);
  });

  it("a file swapped or under another id does not open (AAD); gone from storage; the panel refused; a strange type; no connection", async () => {
    const e = await encrypt(new Uint8Array([9, 9]), "eeee0002-0000-4000-8000-000000000002");
    const meta = { ok: true, url: "https://x.supabase.co/storage/v1/object/sign/dm-media/a/b", key: e.key, iv: e.iv, mime: "image/png", kind: "image", size: 2 };
    const run = (panel: Response | (() => never), file?: Response) => openReportedMedia(R1, F1, {
      fetchImpl: async (url: string) => { if (url === "/api/dm-reports/media") { if (typeof panel === "function") panel(); return panel as Response } return file ?? new Response(e.data) },
      makeUrl: () => "blob:x",
    });
    expect(await run(json(200, meta))).toEqual({ ok: false, error: MEDIA_BROKEN });
    expect(await run(json(200, meta), new Response("", { status: 404 }))).toEqual({ ok: false, error: "הקובץ כבר לא שמור: הוא נמחק מהשיחה, או שעבר זמן השמירה." });
    expect(await run(json(200, meta), new Response("", { status: 500 }))).toEqual({ ok: false, error: MEDIA_OPEN_FAILED });
    expect(await run(json(200, meta), new Response("", { status: 400 }))).toEqual({ ok: false, error: "הקישור לקובץ פג לפני שההורדה התחילה. נסו לפתוח שוב." });
    expect(await run(json(410, { error: "הקובץ כבר לא שמור" }))).toEqual({ ok: false, error: "הקובץ כבר לא שמור" });
    expect(await run(json(200, { ...meta, mime: "image/svg+xml" }))).toEqual({ ok: false, error: MEDIA_OPEN_FAILED });
    expect(await run(() => { throw new Error("offline") })).toEqual({ ok: false, error: "אין חיבור. נסו שוב." });
  });

  it("decrypt: the right key and id open; a wrong id throws", async () => {
    const e = await encrypt(new Uint8Array([7]), F1);
    expect(new Uint8Array(await decryptDmFile({ data: e.data, key: e.key, iv: e.iv, mediaId: F1 }))).toEqual(new Uint8Array([7]));
    await expect(decryptDmFile({ data: e.data, key: e.key, iv: e.iv, mediaId: R1 })).rejects.toBeTruthy();
  });
});
