// bloc SAFETY-1 (MG-S1241, החלטות 676–677) — המסך של הדיווחים על תוכן בפאנל, מרונדר לשרת (כמו dmReports.test.tsx).
// התור: לא הותקן / טוען / נכשל / ריק / ריק בסינון — מצבים שונים; שורה — הסוג, הבניין, מי כתב, הסיבות, מצב ההסתרה; אף פעם לא תוכן ולא
// מי דיווח; הסינון בקישורים. הפריט: התוכן עכשיו, העותקים, הדיווחים; ההחלטות רק למי שמנהל; "להעביר לוועד" לא בשיחה על מודעה.
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentReportsView, CrDetailView, CrRow, actionFromReply, detailFromReply, queueFromReply, UNCLEAR_TEXT } from "../ContentReportsClient";
import { CR_EMPTY_FILTERED_TEXT, CR_EMPTY_TEXT, CR_FAILED_TEXT, CR_PRIVACY_TEXT, CR_SQL_MISSING_TEXT, crFilterOf, type CrItem, type CrReport } from "@/lib/contentReports";

const NOW = Date.parse("2026-11-25T10:00:00Z");
const M1 = "cccc0001-0000-4000-8000-000000000001", M2 = "cccc0002-0000-4000-8000-000000000002";
const B1 = "c0f1cb42-8e52-4a4e-a8d7-5563c10d6a2e", DANA = "0b9d1c3e-7f6a-4b5c-9d8e-1f2a3b4c5d6e";
const auto: CrItem = {
  source: "chat", source_id: M1, building: { id: B1, name: "הרצל 12" }, author: { id: DANA, name: "דנה לוי" }, author_open: 4,
  reports: 3, open: 3, reasons: { offensive: 2, harassment: 1 }, notes: 1, first_at: "2026-11-25T08:00:00Z", last_at: "2026-11-25T08:00:00Z", status: "open", hidden: "auto",
};
const thread: CrItem = { ...auto, source: "market_comment", source_id: M2, author: null, author_open: null, reports: 1, open: 0, reasons: { spam: 1 }, notes: 0, status: "dismissed", hidden: null };
const report: CrReport = {
  item: auto,
  reports: [{ reason: "offensive", note: "שוב ושוב", at: "2026-11-25T08:00:00Z", status: "open" }, { reason: "harassment", note: null, at: "2026-11-25T07:00:00Z", status: "open" }],
  snapshots: ["מילה גסה", "מילה גסה מאוד"],
  current: { text: "מילה גסה (נערך)", has_image: true, link: null },
};
const view = (data: Parameters<typeof ContentReportsView>[0]["data"], sp: Record<string, string> = {}, canManage = true) =>
  renderToStaticMarkup(createElement(ContentReportsView, { data, filter: crFilterOf(sp), now: NOW, canManage, onDone: () => {}, onRetry: () => {} }));

describe("the queue", () => {
  it("not installed / loading / failed / empty / empty under a filter are different screens — a failure never looks like no reports", () => {
    expect(view({ state: "missing" })).toContain(CR_SQL_MISSING_TEXT);
    const loading = view({ state: "loading" });
    expect(loading).toContain('data-cr-loading=""');
    expect(loading).not.toContain(CR_EMPTY_TEXT);
    const failed = view({ state: "error", message: "" });
    expect(failed).toContain(CR_FAILED_TEXT);
    expect(failed).toContain("נסו שוב");
    expect(failed).not.toContain(CR_EMPTY_TEXT);
    expect(view({ state: "error", message: "bloc לא הצליח לקרוא כרגע." })).toContain("bloc לא הצליח לקרוא כרגע.");
    expect(view({ state: "ok", items: [], openTotal: 0, truncated: false })).toContain(CR_EMPTY_TEXT);
    expect(view({ state: "ok", items: [], openTotal: 2, truncated: false }, { source: "market" })).toContain(CR_EMPTY_FILTERED_TEXT);
    expect(view({ state: "ok", items: [], openTotal: 2, truncated: false }, { status: "closed" })).toContain(CR_EMPTY_FILTERED_TEXT);
  });

  it("a row: the kind, the building, who wrote (and how many open reports on them), the reasons, hidden — never the content or who reported", () => {
    const out = view({ state: "ok", items: [auto, thread], openTotal: 1, truncated: true });
    expect(out).toContain(CR_PRIVACY_TEXT);
    expect(out).toContain("פתוחים (1)");
    expect(out).toContain("הודעה בצ&#x27;אט הבניין");
    expect(out).toContain("<bdi>דנה לוי · 4 דיווחים פתוחים על מה שכתב/ה</bdi>");
    expect(out).toContain("<bdi>מי שכתב — חשבון שנמחק</bdi>");
    expect(out).toContain("<bdi>הרצל 12</bdi>");
    expect(out).toContain("3 דיווחים · 2 פוגעני או גס · 1 הטרדה או בריונות · לפני שעתיים");
    expect(out).toContain("מוסתר אוטומטית (3 דיווחים)");
    expect(out).toContain("עם הערה");
    expect(out).toContain('data-cr-row="dismissed"');
    expect(out).toContain("מוצגים 1,000 הדיווחים האחרונים");
    expect(out).toContain("פתיחה (נרשמת ביומן)");
    expect(out).not.toContain("מילה גסה");
    expect(out).not.toContain("שוב ושוב");
  });

  it("the filters are links that keep the rest; the open count only beside the unfiltered list; 44px targets", () => {
    const out = view({ state: "ok", items: [auto], openTotal: 1, truncated: false }, { source: "post", order: "oldest" });
    expect(out).toContain('href="/content-reports?status=closed&amp;source=post&amp;order=oldest"');
    expect(out).toContain('href="/content-reports?order=oldest"');
    expect(out).toContain('href="/content-reports?source=market_comment&amp;order=oldest"');
    expect(out).not.toContain("פתוחים (1)");
    expect(out).toMatch(/aria-current="page"[^>]*>פתוחים</);
    expect(out).toMatch(/min-height:44px/);
  });

  it("an opened row shows the item loading inside it (the content comes only from the POST that is logged)", () => {
    const out = renderToStaticMarkup(createElement(CrRow, { i: auto, now: NOW, canManage: true, open: true, onToggle: () => {}, onDone: () => {} }));
    expect(out).toContain('data-cr-detail-loading=""');
    expect(out).toContain('aria-expanded="true"');
    expect(out).toContain("סגירה");
  });
});

describe("one item", () => {
  const detail = (item: CrItem, canManage: boolean, o: { fail?: string | null; busy?: "hide" | "restore" | "refer" | null; rep?: CrReport } = {}) =>
    renderToStaticMarkup(createElement(CrDetailView, { item, report: o.rep ?? { ...report, item }, canManage, note: "", busy: o.busy ?? null, fail: o.fail ?? null, now: NOW, onNote: () => {}, onAct: () => {} }));

  it("the content now, the copies from the moment of the report (edited between reports), the reports with their notes", () => {
    const out = detail(auto, true);
    expect(out).toContain("התוכן עכשיו · עם תמונה");
    expect(out).toContain("<bdi>מילה גסה (נערך)</bdi>");
    expect(out).toContain("נערך בין דיווח לדיווח");
    expect((out.match(/data-cr-snapshot=""/g) ?? []).length).toBe(2);
    expect(out).toContain('data-cr-report="offensive"');
    expect(out).toContain("פוגעני או גס · לפני שעתיים");
    expect(out).toContain("&quot;<bdi>שוב ושוב</bdi>&quot;");
  });

  it("decisions only for who manages; auto-hidden → keep hidden / show again, no referral (the committee would not see it); refer only outside a private thread", () => {
    const out = detail(auto, true);
    expect(out).toContain("להשאיר מוסתר");
    expect(out).toContain("להחזיר ולהציג");
    expect(out).not.toContain('data-cr-refer=""');
    expect(out).toContain('data-cr-no-refer=""');
    expect(detail({ ...auto, hidden: null }, true)).toContain('data-cr-refer=""');
    expect(out).toContain('maxLength="300"');
    expect(detail({ ...auto, hidden: null }, true)).toContain("להסתיר לכולם");
    expect(detail({ ...auto, hidden: null }, true)).toContain("תקין, להשאיר");
    expect(detail({ ...auto, hidden: "staff" }, true)).toContain("מוסתר — לסגור את הדיווחים");
    const viewer = detail(auto, false);
    expect(viewer).not.toContain('data-cr-actions=""');
    expect(viewer).toContain("<bdi>מילה גסה (נערך)</bdi>");
    const priv = detail(thread, true, { rep: { ...report, item: thread, current: null } });
    expect(priv).not.toContain('data-cr-refer=""');
    expect(priv).toContain('data-cr-private=""');
    expect(priv).toContain("הודעה בשיחה על מודעה — התוכן רק בעותק מרגע הדיווח.");
    expect(detail(auto, true, { rep: { ...report, current: null } })).toContain("נמחק מאז הדיווח. העותקים למטה.");
  });

  it("busy and a failure: the buttons wait, the sentence of bloc shows", () => {
    const out = detail({ ...auto, hidden: null }, true, { busy: "hide", fail: "אין ועד פעיל בבניין הזה." });
    expect((out.match(/disabled=""/g) ?? []).length).toBe(3);
    expect(out).toContain("אין ועד פעיל בבניין הזה.");
  });
});

describe("the replies", () => {
  it("the queue reply: ok → the items; missing → missing; anything else → error with the sentence", () => {
    expect(queueFromReply(200, { state: "ok", items: [auto], openTotal: 1, truncated: false })).toMatchObject({ state: "ok", openTotal: 1, items: [{ source_id: M1 }] });
    expect(queueFromReply(503, { state: "missing" })).toEqual({ state: "missing" });
    expect(queueFromReply(502, { state: "error", message: "x" })).toEqual({ state: "error", message: "x" });
    expect(queueFromReply(200, { state: "ok", items: "nope" })).toEqual({ state: "error", message: "" });
    expect(queueFromReply(500, { state: "ok", items: [auto], openTotal: 1, truncated: false })).toEqual({ state: "error", message: "" });
    expect(queueFromReply(403, { error: "אין הרשאה" })).toEqual({ state: "error", message: "אין הרשאה" });
  });
  it("the item reply: only an ok with the known shape; not found / failed — the sentence", () => {
    expect(detailFromReply(true, { state: "ok", report })).toMatchObject({ state: "ok", report: { snapshots: ["מילה גסה", "מילה גסה מאוד"] } });
    expect(detailFromReply(false, { state: "not_found" })).toEqual({ state: "error", message: "אין דיווחים על הפריט הזה. רעננו את הרשימה." });
    expect(detailFromReply(false, { state: "error", message: "bloc לא זמין" })).toEqual({ state: "error", message: "bloc לא זמין" });
    expect(detailFromReply(true, { state: "ok", report: { item: auto } })).toEqual({ state: "error", message: "הפתיחה נכשלה. נסו שוב." });
    expect(detailFromReply(true, null)).toEqual({ state: "error", message: "הפתיחה נכשלה. נסו שוב." });
    expect(detailFromReply(false, { state: "ok", report })).toEqual({ state: "error", message: "הפתיחה נכשלה. נסו שוב." });
  });
  it("the action reply: done only when bloc said ok; otherwise its sentence or 'unclear'", () => {
    // what really happened: changed / closed / notified
    expect(actionFromReply(true, { ok: true, changed: true, closed: 3, notified: true }, "hide")).toEqual({ done: "הפריט מוסתר לכולם, ומי שכתב קיבל הודעה." });
    expect(actionFromReply(true, { ok: true, changed: false, closed: 0, notified: false }, "hide")).toEqual({ done: "הפריט כבר היה מוסתר — לא השתנה דבר." });
    expect(actionFromReply(true, { ok: true, changed: true, closed: 3, notified: false }, "hide")).toEqual({ done: "הפריט מוסתר לכולם." });
    expect(actionFromReply(true, { ok: true, changed: true, closed: 1, notified: false }, "restore")).toEqual({ done: "הדיווחים נסגרו, והפריט נשאר מוצג." });
    expect(actionFromReply(true, { ok: true, changed: true, closed: 0, notified: true }, "refer")).toEqual({ done: "נשלח לוועד של הבניין. הדיווחים עוד פתוחים — רעננו." });
    expect(actionFromReply(true, { ok: false }, "hide")).toEqual({ fail: UNCLEAR_TEXT });
    expect(actionFromReply(false, { error: "שיחה של שניים" }, "refer")).toEqual({ fail: "שיחה של שניים" });
    expect(actionFromReply(false, null, "restore")).toEqual({ fail: UNCLEAR_TEXT });
  });
});
