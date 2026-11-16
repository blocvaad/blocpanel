// PANEL-PAY א2ב: lib/adsUi — הצלחה במסכי הפרסומות רק עם ok === true; תשובה לא ברורה היא "ייתכן שבוצע" (ואחרי יצירה — בלי
// "שמירה" שנייה); תיבת התמונה בכל מצב של העלאה; תמונה שלא מהבאקט של bloc; מה דף הקמפיין אומר אחרי יצירה / שכפול.
import { describe, it, expect } from "vitest";
import {
  readAdsAnswer, readUploadAnswer, connectionFailure, lockedAfter, adsImageBase, isOurAdImage, imageBoxState, duplicateHref,
  campaignArrival, ADS_UNCLEAR_TEXT, ADS_FAILED_TEXT, ADS_CONNECTION_TEXT, ADS_REFRESH_CODES, UPLOAD_FAILED_TEXT, IMAGE_NOT_OURS_TEXT,
  IMAGE_EMPTY_TEXT, IMAGE_EMPTY_HINT, IMAGE_UPLOADING_TEXT, IMAGE_DONE_TEXT, IMAGE_OURS_TEXT, IMAGE_FOREIGN_TEXT, IMAGE_FOREIGN_HINT,
  IMAGE_KEPT_TEXT, DUPLICATE_OK_TEXT, DUPLICATE_NO_CREATIVES_TEXT, DUPLICATE_CREATIVES_UNKNOWN_TEXT, CREATED_TEXT, RECHECK_TEXT,
} from "../adsUi";

const res = (status: number) => ({ ok: status >= 200 && status < 300, status });

describe("readAdsAnswer — success only with ok === true", () => {
  it("200 + ok: true → the data", () => {
    expect(readAdsAnswer(res(200), { ok: true, id: "x" })).toEqual({ ok: true, data: { ok: true, id: "x" } });
  });
  it("200 without ok === true (empty, null, a string, ok: 'true', an array) → unclear, never success", () => {
    for (const body of [{}, null, "ok", { ok: "true" }, { id: "x" }, [{ ok: true }]]) {
      expect(readAdsAnswer(res(200), body), JSON.stringify(body)).toEqual({ ok: false, status: 200, error: ADS_UNCLEAR_TEXT, code: "unclear", unclear: true });
    }
  });
  it("an error with the server's sentence and code; unclear for the maybe-done codes only", () => {
    expect(readAdsAnswer(res(409), { error: "החוזה של הקמפיין הסתיים.", code: "contract_ended" }))
      .toEqual({ ok: false, status: 409, error: "החוזה של הקמפיין הסתיים.", code: "contract_ended", unclear: false });
    for (const code of ["TIMEOUT", "NETWORK", "bad_shape", "failed"]) {
      expect(readAdsAnswer(res(502), { error: "ייתכן שבוצע", code }), code).toMatchObject({ unclear: true });
    }
    expect(readAdsAnswer(res(503), { error: "x", code: "sql_missing" })).toMatchObject({ unclear: false });
  });
  it("a 400 of the schema: error, or the first issue's message", () => {
    expect(readAdsAnswer(res(400), { error: "שם המפרסם: לפחות 2 תווים" })).toMatchObject({ error: "שם המפרסם: לפחות 2 תווים" });
    expect(readAdsAnswer(res(400), { issues: [{ message: "תאריך לא תקין" }] })).toMatchObject({ error: "תאריך לא תקין" });
    expect(readAdsAnswer(res(400), { issues: [{}] })).toMatchObject({ error: ADS_FAILED_TEXT });
    expect(readAdsAnswer(res(400), {})).toEqual({ ok: false, status: 400, error: ADS_FAILED_TEXT, code: "", unclear: false });
  });
  it("a 5xx without a sentence (e.g. Vercel's 504 page — not JSON) → maybe done, not \"try again\"", () => {
    expect(readAdsAnswer(res(504), null)).toEqual({ ok: false, status: 504, error: ADS_UNCLEAR_TEXT, code: "unclear", unclear: true });
    expect(readAdsAnswer(res(500), { code: "x" })).toEqual({ ok: false, status: 500, error: ADS_UNCLEAR_TEXT, code: "x", unclear: true });
    expect(readAdsAnswer(res(499), null)).toMatchObject({ unclear: false });
  });
  it("the connection dropped → maybe done", () => {
    expect(connectionFailure()).toEqual({ ok: false, status: 0, error: ADS_CONNECTION_TEXT, code: "connection", unclear: true });
    expect(ADS_REFRESH_CODES.has("connection")).toBe(true);
    expect(ADS_CONNECTION_TEXT).toContain("ייתכן שהפעולה בוצעה");
    expect(ADS_UNCLEAR_TEXT).toContain("ייתכן שהפעולה בוצעה");
  });
  it("lockedAfter: only a create (or a duplicate) after an unclear answer", () => {
    const unclear = { ok: false, unclear: true };
    expect(lockedAfter(unclear, true)).toBe(true);
    expect(lockedAfter(unclear, false)).toBe(false);
    expect(lockedAfter({ ok: false, unclear: false }, true)).toBe(false);
    expect(lockedAfter({ ok: false }, true)).toBe(false);
    expect(lockedAfter({ ok: true, unclear: true }, true)).toBe(false);
    for (const t of Object.values(RECHECK_TEXT)) expect(t).toMatch(/^הרשימה רועננה\. בדקו אם/);
  });
});

describe("readUploadAnswer", () => {
  it("ok + an https url → the url", () => {
    expect(readUploadAnswer(res(200), { ok: true, url: "https://x.supabase.co/storage/v1/object/public/ads/a.png" }))
      .toEqual({ ok: true, url: "https://x.supabase.co/storage/v1/object/public/ads/a.png" });
  });
  it("200 without ok, without a url, or an http url → failed (bad_shape), never an image", () => {
    for (const body of [{ url: "https://a/b.png" }, { ok: true }, { ok: true, url: "http://a/b.png" }, { ok: true, url: "https://a b" }, null]) {
      expect(readUploadAnswer(res(200), body), JSON.stringify(body)).toEqual({ ok: false, error: UPLOAD_FAILED_TEXT, code: "bad_shape" });
    }
  });
  it("a 200 that carries an error but not ok — still \"ההעלאה נכשלה\" (never the body's text as if it were a refusal)", () => {
    expect(readUploadAnswer(res(200), { ok: false, error: "something odd" })).toEqual({ ok: false, error: UPLOAD_FAILED_TEXT, code: "bad_shape" });
  });
  it("an error: the server's sentence and code; no sentence → \"ההעלאה נכשלה\"", () => {
    expect(readUploadAnswer(res(415), { error: "אפשר להעלות רק JPEG, PNG או WebP." })).toEqual({ ok: false, error: "אפשר להעלות רק JPEG, PNG או WebP.", code: "" });
    expect(readUploadAnswer(res(502), { error: UPLOAD_FAILED_TEXT, code: "put_rejected" })).toEqual({ ok: false, error: UPLOAD_FAILED_TEXT, code: "put_rejected" });
    expect(readUploadAnswer(res(504), null)).toEqual({ ok: false, error: UPLOAD_FAILED_TEXT, code: "" });
  });
});

describe("whose image is it (decision 373)", () => {
  const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
  it("adsImageBase: the project URL (trailing slashes trimmed) + the ads bucket; not https / a path → null", () => {
    expect(adsImageBase("https://abc.supabase.co")).toBe(BASE);
    expect(adsImageBase(" https://abc.supabase.co// ")).toBe(BASE);
    for (const u of ["", null, undefined, "http://abc.supabase.co", "https://abc.supabase.co/x", "abc.supabase.co"]) expect(adsImageBase(u), String(u)).toBeNull();
  });
  it("isOurAdImage: under the base (host in any case) and more than the base; unknown base → null", () => {
    expect(isOurAdImage(`${BASE}creatives/2026-11/a.webp`, BASE)).toBe(true);
    expect(isOurAdImage(`${BASE.replace("abc", "ABC")}creatives/a.webp`, BASE)).toBe(true);
    expect(isOurAdImage(BASE, BASE)).toBe(false);
    expect(isOurAdImage("https://cdn.example.com/a.webp", BASE)).toBe(false);
    expect(isOurAdImage("https://abc.supabase.co/storage/v1/object/public/avatars/a.webp", BASE)).toBe(false);
    expect(isOurAdImage("", BASE)).toBe(false);
    expect(isOurAdImage(null, BASE)).toBe(false);
    expect(isOurAdImage("https://cdn.example.com/a.webp", null)).toBeNull();
  });
  it("isOurAdImage (review #11): bloc's rule — same origin, the exact path, no query / hash / traversal / credentials", () => {
    for (const u of [
      `${BASE.replace("/ads/", "/ADS/")}creatives/a.webp`,                 // the path is case-sensitive in storage
      `${BASE}creatives/a.webp?x=1`, `${BASE}creatives/a.webp#x`,          // query / hash
      `${BASE}../avatars/a.webp`, `${BASE}%2e%2e/avatars/a.webp`, `${BASE}creatives//a.webp`, `${BASE}creatives/%5Ca.webp`,   // out of the bucket after the URL resolves dots; // ; an encoded \\
      `https://user:pw@abc.supabase.co/storage/v1/object/public/ads/creatives/a.webp`,
      `https://abc.supabase.co.evil.example/storage/v1/object/public/ads/creatives/a.webp`,   // a look-alike host
      `http://abc.supabase.co/storage/v1/object/public/ads/creatives/a.webp`, "not a url", `${BASE}%E0%A4%A`,
    ]) expect(isOurAdImage(u, BASE), u).toBe(false);
    expect(isOurAdImage(` ${BASE}creatives/2026-11/a.webp `, BASE)).toBe(true);
    // dots that resolve INSIDE the bucket are inside it — bloc (URL-normalized) agrees
    expect(isOurAdImage(`${BASE}creatives/../x/a.webp`, BASE)).toBe(true);
    // dots the URL does not resolve (inside an encoded segment) but the decoded path has — refused, as bloc does
    expect(isOurAdImage(`${BASE}a%2F..%2Fb.webp`, BASE)).toBe(false);
    // https only, even when the project URL itself is http (bloc's safeHttps)
    const HTTP_BASE = BASE.replace("https:", "http:");
    expect(isOurAdImage(`${HTTP_BASE}creatives/a.webp`, HTTP_BASE)).toBe(false);
  });
});

describe("imageBoxState — what the image box says", () => {
  const BASE = "https://abc.supabase.co/storage/v1/object/public/ads/";
  const OURS = `${BASE}creatives/2026-11/a.webp`;
  const box = (o: Partial<Parameters<typeof imageBoxState>[0]>) => imageBoxState({ url: "", upload: { phase: "idle" }, refusal: null, base: BASE, ...o });
  it("no image yet — the recommended format; button \"העלאת תמונה\"", () => {
    expect(box({})).toEqual({ tone: "empty", title: IMAGE_EMPTY_TEXT, detail: IMAGE_EMPTY_HINT, file: null, button: "העלאת תמונה", busy: false });
    // the size isolated left-to-right (else "1080×1350" shows reversed in a right-to-left line)
    expect(IMAGE_EMPTY_HINT).toContain("\u20661080×1350\u2069");
  });
  it("uploading — busy, the file name, \"מעלים…\" (over everything else)", () => {
    expect(box({ url: OURS, upload: { phase: "uploading", name: "pizza.jpg" }, refusal: IMAGE_NOT_OURS_TEXT }))
      .toEqual({ tone: "busy", title: IMAGE_UPLOADING_TEXT, detail: null, file: "pizza.jpg", button: "מעלים…", busy: true });
    expect(box({ upload: { phase: "uploading", name: "" } }).file).toBeNull();
  });
  it("bloc refused the image (image_not_ours) — the sentence, red", () => {
    expect(box({ url: "https://cdn.example.com/a.webp", refusal: IMAGE_NOT_OURS_TEXT }))
      .toEqual({ tone: "error", title: IMAGE_NOT_OURS_TEXT, detail: null, file: null, button: "החלפת התמונה", busy: false });
  });
  it("the upload failed — the reason; with an earlier image: it did not change", () => {
    expect(box({ upload: { phase: "failed", error: UPLOAD_FAILED_TEXT } }))
      .toEqual({ tone: "error", title: UPLOAD_FAILED_TEXT, detail: null, file: null, button: "העלאת תמונה", busy: false });
    expect(box({ url: OURS, upload: { phase: "failed", error: UPLOAD_FAILED_TEXT } }).detail).toBe(IMAGE_KEPT_TEXT);
  });
  it("an old creative's outside image — warn: not shown to tenants, upload it", () => {
    expect(box({ url: "https://cdn.example.com/a.webp" }))
      .toEqual({ tone: "warn", title: IMAGE_FOREIGN_TEXT, detail: IMAGE_FOREIGN_HINT, file: null, button: "החלפת התמונה", busy: false });
    expect(box({ url: "https://cdn.example.com/a.webp", upload: { phase: "done", name: "x.jpg" } }).tone).toBe("warn");
  });
  it("uploaded now — ✓ with the name; an existing image of ours — \"שמורה ב-bloc\"; unknown base — no warning", () => {
    expect(box({ url: OURS, upload: { phase: "done", name: "pizza.jpg" } }))
      .toEqual({ tone: "ok", title: IMAGE_DONE_TEXT, detail: null, file: "pizza.jpg", button: "החלפת התמונה", busy: false });
    expect(box({ url: OURS, upload: { phase: "done", name: "" } }).file).toBeNull();
    expect(box({ url: OURS })).toEqual({ tone: "ok", title: IMAGE_OURS_TEXT, detail: null, file: null, button: "החלפת התמונה", busy: false });
    expect(box({ url: "https://cdn.example.com/a.webp", base: null }).tone).toBe("ok");
    expect(box({ url: "   " }).tone).toBe("empty");
  });
});

describe("after a duplicate or a create — the campaign page says what happened", () => {
  it("duplicateHref: all copied → ?copied=1; otherwise the creatives' fate in the URL", () => {
    expect(duplicateHref("33333333-3333-4333-8333-333333333333", "ok")).toBe("/ads/campaigns/33333333-3333-4333-8333-333333333333?copied=1");
    expect(duplicateHref("c1", "failed")).toBe("/ads/campaigns/c1?copied=1&creatives=failed");
    expect(duplicateHref("c1", undefined)).toBe("/ads/campaigns/c1?copied=1&creatives=unknown");
    // review #6: bloc skipped ads with an outside image — the count goes with the URL (a positive integer, capped)
    expect(duplicateHref("c1", "ok", 2)).toBe("/ads/campaigns/c1?copied=1&skipped=2");
    expect(duplicateHref("c1", "failed", 1)).toBe("/ads/campaigns/c1?copied=1&creatives=failed&skipped=1");
    for (const s of [0, -1, 1.5, "2", null, undefined, NaN]) expect(duplicateHref("c1", "ok", s), String(s)).toBe("/ads/campaigns/c1?copied=1");
    expect(duplicateHref("c1", "ok", 5000)).toBe("/ads/campaigns/c1?copied=1&skipped=1000");
    expect(duplicateHref("c1", "weird")).toBe("/ads/campaigns/c1?copied=1&creatives=unknown");
    expect(duplicateHref("a/b", "ok")).toBe("/ads/campaigns/a%2Fb?copied=1");
  });
  it("ADS-2א v2 — campaignArrival after the wizard's \"פרסום\": running now, or scheduled for its start date; anything else — nothing", async () => {
    const { PUBLISHED_TEXT, SCHEDULED_TEXT } = await import("../adsUi");
    expect(campaignArrival({ published: "1" })).toEqual({ tone: "ok", text: PUBLISHED_TEXT });
    expect(campaignArrival({ published: ["scheduled", "1"] })).toEqual({ tone: "ok", text: SCHEDULED_TEXT });
    expect(campaignArrival({ published: "yes" })).toBeNull();
    expect(PUBLISHED_TEXT).toBe("הקמפיין פורסם ופעיל.");
    expect(SCHEDULED_TEXT).toContain("מתוזמן");
    // a duplicate wins over a publish flag (it is the new draft's page)
    expect(campaignArrival({ copied: "1", published: "1" })?.text).toBe(DUPLICATE_OK_TEXT);
  });
  it("campaignArrival: copied (ok / failed / unknown / anything else), created, nothing", () => {
    expect(campaignArrival({ copied: "1" })).toEqual({ tone: "ok", text: DUPLICATE_OK_TEXT });
    expect(campaignArrival({ copied: "1", creatives: "failed" })).toEqual({ tone: "warn", text: DUPLICATE_NO_CREATIVES_TEXT });
    expect(campaignArrival({ copied: "1", creatives: "unknown" })).toEqual({ tone: "warn", text: DUPLICATE_CREATIVES_UNKNOWN_TEXT });
    expect(campaignArrival({ copied: "1", creatives: "ok" })).toEqual({ tone: "warn", text: DUPLICATE_CREATIVES_UNKNOWN_TEXT });
    expect(campaignArrival({ copied: ["1", "0"], creatives: ["failed"] })).toEqual({ tone: "warn", text: DUPLICATE_NO_CREATIVES_TEXT });
    expect(campaignArrival({ created: "1" })).toEqual({ tone: "ok", text: CREATED_TEXT });
    expect(campaignArrival({ copied: "1", created: "1" })?.text).toBe(DUPLICATE_OK_TEXT);
    expect(campaignArrival({})).toBeNull();
    expect(campaignArrival({ copied: "0", created: "yes" })).toBeNull();
  });
  it("the sentences: copied without the ads says so; unknown never says they were copied", () => {
    expect(DUPLICATE_NO_CREATIVES_TEXT).toContain("בלי הפרסומות");
    expect(DUPLICATE_CREATIVES_UNKNOWN_TEXT).toContain("לא ידוע");
    expect(DUPLICATE_CREATIVES_UNKNOWN_TEXT).not.toContain("עם הפרסומות");
  });
});

describe("review #6: the campaign page after a copy that skipped ads with an outside image", () => {
  it("all copied but some skipped → a warning that says how many and what to do; with failed / unknown — both sentences", () => {
    const one = campaignArrival({ copied: "1", skipped: "1" });
    expect(one?.tone).toBe("warn");
    expect(one?.text).toContain("פרסומת אחת עם תמונה מאתר אחר לא הועתקה");
    const many = campaignArrival({ copied: "1", creatives: "failed", skipped: "3" });
    expect(many?.tone).toBe("warn");
    expect(many?.text).toContain("ההעתקה שלהן נכשלה");
    expect(many?.text).toContain("3 פרסומות עם תמונה מאתר אחר לא הועתקו");
    for (const sk of ["0", "-2", "x", "1.5", "1001"]) expect(campaignArrival({ copied: "1", skipped: sk })?.tone, sk).toBe("ok");
  });
});

// ── ADS-2א: איזו תמונה בסטורי / בקרוסלה נדחתה (מהשרת, או מהנתיב של zod) — כדי לסמן אותה; ושורת המידות לפי הפורמט ──
describe("ADS-2א — the refused frame reaches the screen", () => {
  const res = (status: number) => ({ ok: status < 400, status });
  it("frame from the panel's answer (bloc's frames.N…): 0..4 only", () => {
    expect(readAdsAnswer(res(400), { error: "תמונה 3…", code: "image_not_ours", frame: 2 })).toMatchObject({ ok: false, code: "image_not_ours", frame: 2 });
    for (const frame of [5, -1, 1.5, "2", null]) {
      const r = readAdsAnswer(res(400), { error: "x", code: "invalid", frame });
      expect(r.ok === false && "frame" in r, String(frame)).toBe(false);
    }
  });
  it("frame from the panel's own schema (the first issue's path frames.N…)", () => {
    const r = readAdsAnswer(res(400), { error: "תמונה 2 — תיאור התמונה: לפחות 2 תווים", issues: [{ message: "x", path: ["frames", 1, "image_alt"] }] });
    expect(r).toMatchObject({ ok: false, error: "תמונה 2 — תיאור התמונה: לפחות 2 תווים", frame: 1 });
    const other = readAdsAnswer(res(400), { error: "x", issues: [{ message: "x", path: ["headline"] }] });
    expect(other.ok === false && "frame" in other).toBe(false);
    const big = readAdsAnswer(res(400), { error: "x", issues: [{ message: "x", path: ["frames", 7] }] });
    expect(big.ok === false && "frame" in big).toBe(false);
  });
  it("a success never carries a frame; an unclear answer neither", () => {
    expect(readAdsAnswer(res(200), { ok: true, id: "x", frame: 1 })).toEqual({ ok: true, data: { ok: true, id: "x", frame: 1 } });
    expect(readAdsAnswer(res(200), { frame: 1 })).toEqual({ ok: false, status: 200, error: ADS_UNCLEAR_TEXT, code: "unclear", unclear: true });
  });
  it("the empty image box says the format's size (default — the card's)", () => {
    expect(imageBoxState({ url: "", upload: { phase: "idle" }, refusal: null, base: null }).detail).toBe(IMAGE_EMPTY_HINT);
    expect(imageBoxState({ url: "", upload: { phase: "idle" }, refusal: null, base: null, hint: "הכי טוב 9:16" }).detail).toBe("הכי טוב 9:16");
    expect(imageBoxState({ url: "https://x.example/a.png", upload: { phase: "idle" }, refusal: null, base: null, hint: "h" }).detail).toBeNull();
  });
});
