// MOD-1 (bloc MG-S1179, החלטות 584–587) — lib/dmReports: מה שעובר מ-bloc לדפדפן (רק הצורה הנכונה), הסינון בכתובת, הזמנים והיעד
// לבדיקה, ההיסטוריה, והתשובות של הפעולות והכשלים.
import { describe, it, expect } from "vitest";
import {
  DM_SLA_HOURS, agoText, collapseHistory, countsText, dmActionAnswer, dmActionSchema, dmFailure, dmFilterOf, dmListBody, dmMediaSchema, dmQueueHref, dmSla,
  historyText, initialsOf, parseDmList, parseDmMedia, parseDmReport, safeMime, sizeText, slaOf, spanText, whenText, type DmFilter,
} from "../dmReports";

const R1 = "77777777-7777-4777-8777-777777777771";
const NOA = "0b9d1c3e-7f6a-4b5c-9d8e-1f2a3b4c5d6e", AVI = "1c8e2d4f-6a7b-4c5d-8e9f-0a1b2c3d4e5f";
const B1 = "c0f1cb42-8e52-4a4e-a8d7-5563c10d6a2e";
const M1 = "cccc0001-0000-4000-8000-000000000001", F1 = "eeee0001-0000-4000-8000-000000000001";
const KEY = "Ab3+" + "k".repeat(39) + "=", IV = "Iv12" + "x".repeat(12);
const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-22T12:00:00Z");
const item = {
  id: R1, status: "open", reason: "threat", created_at: "2026-11-22T06:00:00Z", reviewed_at: null,
  building: { id: B1, name: "הרצל 12" }, reporter: { id: NOA, name: "נועה לוי" }, reported: { id: AVI, name: "אבי כהן" },
  counts: { messages: 3, verified: 2, media: 1 }, has_note: true,
};

describe("what bloc returns — only the right shape", () => {
  it("the list: items with known fields only; a strange answer is a failure, not an empty queue", () => {
    const l = parseDmList({ ok: true, items: [item, { id: "x" }, { ...item, id: "77777777-7777-4777-8777-777777777772", status: "weird", reason: "nope", reporter: { id: "bad" }, building: null, counts: null, extra: "<b>" }], open_total: 7, truncated: true });
    expect(l?.items.map((i) => [i.id, i.status, i.reason, i.reporter?.name ?? null, i.building])).toEqual([
      [R1, "open", "threat", "נועה לוי", { id: B1, name: "הרצל 12" }],
      ["77777777-7777-4777-8777-777777777772", "open", "other", null, null],
    ]);
    expect(l?.items[1].counts).toEqual({ messages: 0, verified: 0, media: 0 });
    expect(l?.openTotal).toBe(7);
    expect(l?.truncated).toBe(true);
    expect(JSON.stringify(l)).not.toContain("<b>");
    expect(parseDmList({ ok: false, items: [] })).toBeNull();
    expect(parseDmList({ ok: true })).toBeNull();
    expect(parseDmList(null)).toBeNull();
  });

  it("one report: text only of a verified message, files only of a verified message with a safe type, the history of our four actions", () => {
    const r = parseDmReport({ ok: true, report: {
      ...item, note: "  בלילה  ",
      messages: [
        { id: M1, at: "2026-11-21T20:00:00Z", from: "reported", verified: true, text: "אני אחכה לך", media: [{ id: F1, kind: "image", mime: "image/jpeg", size: 99 }, { id: F1, kind: "image", mime: "image/svg+xml", size: 1 }] },
        { id: "cccc0002-0000-4000-8000-000000000002", at: "x", from: "reporter", verified: false, text: "לא אמור להופיע", media: [{ id: F1, kind: "image", mime: "image/png", size: 1 }] },
      ],
      others: { about_reported: 2, by_reporter: -1 },
      history: [{ action: "viewed", at: "t", by: "a@b.co" }, { action: "deleted", at: "t", by: "x" }, { action: "reviewed", at: "t2", by: "", note: "בדקנו", notified: true }],
    } });
    expect(r?.note).toBe("בלילה");
    expect(r?.messages.map((m) => [m.verified, m.text, m.media.length])).toEqual([[true, "אני אחכה לך", 1], [false, null, 0]]);
    expect(r?.messages[0].media[0]).toEqual({ id: F1, kind: "image", mime: "image/jpeg", size: 99 });
    expect(r?.others).toEqual({ about_reported: 2, by_reporter: null });
    expect(r?.history?.map((h) => [h.action, h.by, h.note, h.notified])).toEqual([["viewed", "a@b.co", null, null], ["reviewed", "צוות bloc", "בדקנו", true]]);
    expect(parseDmReport({ ok: true, report: { ...item, messages: [], history: "x" } })?.history).toBeNull();
    expect(parseDmReport({ ok: true, report: { ...item } })).toBeNull();
    expect(parseDmReport({ ok: true })).toBeNull();
  });

  it("a file: an https signed address of our Supabase in the dm-media bucket, a 32-byte key and a 12-byte iv, a safe type — anything else never reaches the browser", () => {
    const ok = { ok: true, url: "https://abc.supabase.co/storage/v1/object/sign/dm-media/a/b?token=t", key: KEY, iv: IV, mime: "image/jpeg; q=1", kind: "image", size: 10 };
    expect(parseDmMedia(ok, "https://abc.supabase.co")).toEqual({ url: ok.url, key: KEY, iv: IV, mime: "image/jpeg", kind: "image", size: 10 });
    expect(parseDmMedia(ok, null)).not.toBeNull();
    expect(parseDmMedia(ok, "https://other.supabase.co")).toBeNull();
    expect(parseDmMedia({ ...ok, url: "http://abc.supabase.co/storage/v1/object/sign/dm-media/a" }, null)).toBeNull();
    expect(parseDmMedia({ ...ok, url: "https://abc.supabase.co/storage/v1/object/public/chat/a" }, null)).toBeNull();
    expect(parseDmMedia({ ...ok, url: "https://abc.supabase.co/x/storage/v1/object/sign/dm-media/a" }, null)).toBeNull();
    expect(parseDmMedia({ ...ok, url: "javascript:alert(1)" }, null)).toBeNull();
    expect(parseDmMedia({ ...ok, mime: "image/svg+xml" }, null)).toBeNull();
    expect(parseDmMedia({ ...ok, mime: "text/html", kind: "video" }, null)).toBeNull();
    expect(parseDmMedia({ ...ok, key: "short" }, null)).toBeNull();
    expect(parseDmMedia({ ...ok, iv: "A".repeat(15) }, null)).toBeNull();
    expect(parseDmMedia({ ...ok, ok: false }, null)).toBeNull();
    expect(safeMime("audio", "audio/mp4;codecs=mp4a")).toBe("audio/mp4");
    expect(safeMime("image", "image/svg+xml")).toBeNull();
  });
});

describe("the filter in the address", () => {
  it("defaults: open, oldest first; only known values; the links write only what differs", () => {
    const d = dmFilterOf({});
    expect(d).toEqual({ status: "open", reason: null, building: null, person: null, order: "oldest" });
    expect(dmQueueHref(d)).toBe("/dm-reports");
    const f = dmFilterOf({ status: "all", reason: "threat", building: B1.toUpperCase(), person: [AVI, "x"], order: "newest" });
    expect(f).toEqual({ status: "all", reason: "threat", building: B1, person: AVI, order: "newest" });
    expect(dmFilterOf({ status: "deleted", reason: "x", building: "1; drop", order: "sideways" })).toEqual(d);
    expect(dmQueueHref(d, { status: "reviewed", reason: "spam" })).toBe("/dm-reports?status=reviewed&reason=spam");
    expect(dmQueueHref(f, { person: null, order: "oldest" })).toBe(`/dm-reports?status=all&reason=threat&building=${B1}`);
    expect(dmListBody(f)).toEqual({ action: "list", status: "all", order: "newest", reason: "threat", building_id: B1, reported_id: AVI });
    expect(dmListBody(d)).toEqual({ action: "list", status: "open", order: "oldest" });
  });
});

describe("times and the review target", () => {
  it("Hebrew spans; ago; the target by reason — ok, soon after half, late after all; a checked report has none", () => {
    expect([0.5, 1, 2, 5, 23, 24, 48, 72].map((h) => spanText(h * HOUR))).toEqual(["פחות משעה", "שעה", "שעתיים", "5 שעות", "23 שעות", "יום", "יומיים", "3 ימים"]);
    expect(agoText("2026-11-22T11:59:30Z", NOW)).toBe("עכשיו");
    expect(agoText("2026-11-22T09:00:00Z", NOW)).toBe("לפני 3 שעות");
    expect(agoText("nope", NOW)).toBe("");
    expect(whenText("2026-11-21T21:58:00Z")).toBe("21.11.26 · 23:58");
    expect(whenText("2026-07-01T21:05:00Z")).toBe("02.07.26 · 00:05");
    expect(whenText("x")).toBe("");
    expect(DM_SLA_HOURS).toEqual({ threat: 12, harassment: 24, spam: 72, other: 72 });
    expect(slaOf(12, "2026-11-22T11:00:00Z", NOW)).toEqual({ level: "ok", text: "נשארו 11 שעות" });
    expect(slaOf(12, "2026-11-22T06:00:00Z", NOW)).toEqual({ level: "soon", text: "נשארו 6 שעות" });
    expect(slaOf(12, "2026-11-21T22:00:00Z", NOW)).toEqual({ level: "late", text: "באיחור של שעתיים" });
    expect(slaOf(12, "2026-11-22T00:00:00Z", NOW)?.level).toBe("late");
    expect(slaOf(12, "x", NOW)).toBeNull();
    // the verb agrees with the span (review #11)
    expect(slaOf(2, "2026-11-22T11:00:00Z", NOW)?.text).toBe("נשארה שעה");
    expect(slaOf(1, "2026-11-22T11:30:00Z", NOW)?.text).toBe("נשארה פחות משעה");
    expect(slaOf(36, "2026-11-22T00:00:00Z", NOW)?.text).toBe("נשאר יום");
    expect(slaOf(72, "2026-11-22T11:00:00Z", NOW)?.text).toBe("נשארו יומיים");
    expect(slaOf(4, "2026-11-22T10:00:00Z", NOW)?.text).toBe("נשארו שעתיים");
    expect(dmSla({ status: "open", reason: "threat", created_at: "2026-11-22T06:00:00Z" }, NOW)?.level).toBe("soon");
    expect(dmSla({ status: "open", reason: "spam", created_at: "2026-11-22T06:00:00Z" }, NOW)?.level).toBe("ok");
    expect(dmSla({ status: "open", reason: "harassment", created_at: "2026-11-20T12:00:00Z" }, NOW)).toEqual({ level: "late", text: "באיחור של יום" });
    expect(dmSla({ status: "reviewed", reason: "threat", created_at: "2026-11-01T00:00:00Z" }, NOW)).toBeNull();
  });

  it("counts, sizes, initials", () => {
    expect(countsText({ messages: 0, verified: 0, media: 0 })).toBe("בלי הודעות מצורפות");
    expect(countsText({ messages: 1, verified: 1, media: 0 })).toBe("הודעה אחת · אומתה");
    expect(countsText({ messages: 1, verified: 0, media: 0 })).toBe("הודעה אחת · לא אומתה");
    expect(countsText({ messages: 3, verified: 3, media: 1 })).toBe("3 הודעות · כולן אומתו · קובץ אחד");
    expect(countsText({ messages: 3, verified: 0, media: 2 })).toBe("3 הודעות · אף אחת לא אומתה · 2 קבצים");
    expect(countsText({ messages: 3, verified: 2, media: 0 })).toBe("3 הודעות · 2 אומתו");
    expect(countsText({ messages: 3, verified: 1, media: 0 })).toBe("3 הודעות · אחת אומתה");
    expect([0, 500, 2048, 5 * 1024 * 1024].map(sizeText)).toEqual(["", "1KB", "2KB", "5.0MB"]);
    expect([initialsOf("נועה לוי"), initialsOf(" אבי "), initialsOf("")]).toEqual(["נל", "א", "?"]);
  });
});

describe("the history", () => {
  it("views in a row by the same person collapse; the text says who did what", () => {
    const h = collapseHistory([
      { action: "viewed", at: "3", by: "a@b.co", note: null, redacted: false, notified: null },
      { action: "viewed", at: "2", by: "a@b.co", note: null, redacted: false, notified: null },
      { action: "reviewed", at: "1", by: "c@d.co", note: "בדקנו", redacted: false, notified: true },
      { action: "viewed", at: "0", by: "a@b.co", note: null, redacted: false, notified: null },
    ]);
    expect(h.map((x) => [x.action, x.times])).toEqual([["viewed", 2], ["reviewed", 1], ["viewed", 1]]);
    // views in a row by two people are two lines
    expect(collapseHistory([
      { action: "viewed", at: "2", by: "a@b.co", note: null, redacted: false, notified: null },
      { action: "viewed", at: "1", by: "c@d.co", note: null, redacted: false, notified: null },
    ]).map((x) => [x.by, x.times])).toEqual([["a@b.co", 1], ["c@d.co", 1]]);
    expect(historyText(h[0])).toBe("a@b.co פתח/ה את הדיווח (פעמיים)");
    expect(historyText({ ...h[0], times: 3 })).toBe("a@b.co פתח/ה את הדיווח (3 פעמים)");
    expect(historyText(h[1])).toBe("c@d.co סימן/ה שנבדק · עם הודעה למדווח/ת");
    expect(historyText({ ...h[1], notified: false })).toBe("c@d.co סימן/ה שנבדק · בלי הודעה למדווח/ת");
    expect(historyText({ ...h[2], action: "media" })).toBe("a@b.co פתח/ה קובץ מהדיווח");
    expect(historyText({ ...h[2], action: "reopened" })).toBe("a@b.co החזיר/ה את הדיווח לתור");
  });
});

describe("the actions", () => {
  it("strict bodies; success only with ok and changed (and notified on a check); failures in Hebrew by kind", () => {
    expect(dmActionSchema.safeParse({ action: "review", id: R1, notify: true, note: "x" }).success).toBe(true);
    expect(dmActionSchema.safeParse({ action: "review", id: R1 }).success).toBe(false);
    expect(dmActionSchema.safeParse({ action: "review", id: R1, notify: true, note: "א".repeat(501) }).success).toBe(false);
    expect(dmActionSchema.safeParse({ action: "reopen", id: R1, extra: 1 }).success).toBe(false);
    expect(dmActionSchema.safeParse({ action: "delete", id: R1 }).success).toBe(false);
    expect(dmMediaSchema.safeParse({ id: R1, media_id: "x" }).success).toBe(false);
    expect(dmActionAnswer("review", { ok: true, changed: true, notified: false, already: true })).toEqual({ changed: true, notified: false, already: true });
    expect(dmActionAnswer("review", { ok: true, changed: true })).toBeNull();
    expect(dmActionAnswer("reopen", { ok: true, changed: false })).toEqual({ changed: false, notified: null, already: false });
    expect(dmActionAnswer("reopen", { ok: true })).toBeNull();
    expect(dmFailure({ status: 504, code: "TIMEOUT", error: "x" }, "action")).toMatchObject({ code: "TIMEOUT", error: "לא ברור אם הפעולה בוצעה. רעננו את הדף." });
    expect(dmFailure({ status: 504, code: "TIMEOUT", error: "x" }, "read")).toMatchObject({ error: "הקריאה מ-bloc נכשלה. נסו שוב." });
    expect(dmFailure({ status: 502, code: "REJECTED", error: "האבחנה" }, "read")).toEqual({ status: 502, code: "REJECTED", error: "האבחנה" });
    expect(dmFailure({ status: 403, code: "forbidden", error: "x" }, "read").error).toBe("אין הרשאה לדיווחים על הודעות פרטיות.");
    expect(dmFailure({ status: 404, code: "not_found", error: "x" }, "read").status).toBe(404);
    expect(dmFailure({ status: 410, code: "gone", error: "x" }, "read").error).toContain("הקובץ כבר לא שמור");
    expect(dmFailure({ status: 503, code: "sql_missing", error: "x" }, "read").error).toContain("SQL 237");
    expect(dmFailure({ status: 503, code: "write_failed", error: "x" }, "read").error).toBe("הפתיחה לא נרשמה ביומן, ולכן התוכן לא מוצג. נסו שוב בעוד רגע.");
    expect(dmFailure({ status: 503, code: "write_failed", error: "x" }, "action").error).toBe("לא נשמר: היומן לא נכתב, ולכן הדיווח נשאר כמו שהיה. נסו שוב בעוד רגע.");
    // a file: not in this report / not of its message / gone — each says what happened (review #10)
    expect(dmFailure({ status: 404, code: "not_found", error: "x" }, "media").error).toBe("הקובץ הזה לא נמצא בדיווח.");
    expect(dmFailure({ status: 409, code: "mismatch", error: "x" }, "media").error).toBe("הקובץ לא שייך להודעה שבדיווח, ולכן הוא לא נפתח.");
    expect(dmFailure({ status: 404, code: "not_found", error: "x" }, "read").error).toBe("הדיווח כבר לא קיים (דיווחים נשמרים 12 חודשים). חזרו לרשימה.");
    expect(dmFailure({ status: 500, code: "x", error: "x" }, "media").error).toBe("הקריאה מ-bloc נכשלה. נסו שוב.");
  });
});

// the type is used by the page; a compile-time check that the defaults stay a full filter
const _f: DmFilter = dmFilterOf({});
void _f;
