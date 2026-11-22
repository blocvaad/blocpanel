// MOD-1 (bloc MG-S1179, החלטות 520, 584–585) — המסכים של הדיווחים על הודעות פרטיות, מרונדרים לשרת (כמו storiesQueue.test.tsx).
// התור: חסר SQL / נכשל / ריק / ריק בסינון / רשימה — מצבים שונים; אף פעם לא תוכן ברשימה; יעד לבדיקה; סינון בקישורים.
// הדיווח: טקסט רק של הודעה שאומתה; קבצים — כפתור, ונפתחים רק אצל איש הצוות; "נבדק" / "להחזיר לתור" לפי ההרשאה; ההיסטוריה.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
import { DmReportsQueueView } from "../DmReportsQueue";
import { ALREADY_CHECKED_TEXT, DmReportDetailView, MEDIA_HINT, NOTE_HINT, ReportStatusView, noteAfter, reportFromReply, reviewBody, reviewDoneText, type DmReportDetailProps } from "../DmReportView";
import { queueApiUrl, queueFromReply } from "../DmReportsQueueClient";
import { DM_EMPTY_FILTERED_TEXT, DM_EMPTY_TEXT, DM_FAILED_TEXT, DM_PRIVACY_TEXT, DM_SQL_MISSING_TEXT, DM_UNVERIFIED_TEXT, dmFilterOf, type DmReport, type DmReportItem } from "@/lib/dmReports";
import type { DmQueueData } from "@/lib/dmReportsServer";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const R1 = "77777777-7777-4777-8777-777777777771", R2 = "77777777-7777-4777-8777-777777777772";
const NOA = "0b9d1c3e-7f6a-4b5c-9d8e-1f2a3b4c5d6e", AVI = "1c8e2d4f-6a7b-4c5d-8e9f-0a1b2c3d4e5f", B1 = "c0f1cb42-8e52-4a4e-a8d7-5563c10d6a2e";
const M1 = "cccc0001-0000-4000-8000-000000000001", M2 = "cccc0002-0000-4000-8000-000000000002", F1 = "eeee0001-0000-4000-8000-000000000001";
const SECRET = "אני אחכה לך בחניה";
const open: DmReportItem = {
  id: R1, status: "open", reason: "threat", created_at: "2026-11-21T22:00:00Z", reviewed_at: null, building: { id: B1, name: "הרצל 12" },
  reporter: { id: NOA, name: "נועה לוי" }, reported: { id: AVI, name: "אבי כהן" }, counts: { messages: 2, verified: 1, media: 1 }, has_note: true,
};
const done: DmReportItem = { ...open, id: R2, status: "reviewed", reason: "spam", created_at: "2026-11-20T08:00:00Z", reviewed_at: "2026-11-22T09:00:00Z", has_note: false, reporter: null };
const q = (data: DmQueueData, sp: Record<string, string> = {}) => renderToStaticMarkup(createElement(DmReportsQueueView, { data, filter: dmFilterOf(sp), now: NOW }));

describe("the queue", () => {
  it("not installed / failed / empty / empty under a filter are different screens — a failed read never looks like no reports", () => {
    expect(q({ state: "missing" })).toContain(DM_SQL_MISSING_TEXT);
    const failed = q({ state: "error", message: "bloc לא הצליח לקרוא כרגע." });
    expect(failed).toContain(DM_FAILED_TEXT);
    expect(failed).toContain("bloc לא הצליח לקרוא כרגע.");
    expect(failed).toContain("נסו שוב");
    expect(failed).not.toContain(DM_EMPTY_TEXT);
    expect(q({ state: "ok", items: [], openTotal: 0, truncated: false })).toContain(DM_EMPTY_TEXT);
    expect(q({ state: "ok", items: [], openTotal: 3, truncated: false }, { reason: "spam" })).toContain(DM_EMPTY_FILTERED_TEXT);
  });

  it("a row: who was reported, by whom, where, why, the target, the counts — no text of any message", () => {
    const out = q({ state: "ok", items: [open, done], openTotal: 1, truncated: true });
    expect(out).toContain(DM_PRIVACY_TEXT);
    expect(out).toContain("פתוחים (1)");
    expect(out).toContain("אבי כהן");
    expect(out).toContain("המדווח/ת: <bdi>נועה לוי</bdi>");
    expect(out).toContain("המדווח/ת: <bdi>חשבון שנמחק</bdi>");
    expect(out).toMatch(/<bdi[^>]*>אבי כהן<\/bdi>/);
    expect(out).toContain("הרצל 12");
    expect(out).toContain("איום או הפחדה");
    expect(out).toContain("באיחור של שעתיים");
    expect(out).toContain('data-dm-sla="late"');
    expect(out).toContain("נבדק לפני 3 שעות");
    expect(out).toContain("2 הודעות · אחת אומתה · קובץ אחד");
    expect(out).toContain("עם הערה");
    expect(out).toContain(`href="/dm-reports/${R1}"`);
    expect(out).toContain("כאן: 1 באיחור.");
    expect(out).toContain('data-dm-truncated=""');
    expect(out).not.toContain(SECRET);
  });

  it("the filters are links that keep the rest of the filter", () => {
    const out = q({ state: "ok", items: [open], openTotal: 1, truncated: false }, { reason: "threat", person: AVI, order: "newest" });
    expect(out).toContain(`href="/dm-reports?status=reviewed&amp;reason=threat&amp;person=${AVI}&amp;order=newest"`);
    expect(out).toContain(`href="/dm-reports?person=${AVI}&amp;order=newest"`);
    expect(out).toContain(`href="/dm-reports?reason=threat&amp;order=newest"`);
    expect(out).toContain('data-dm-clear="person"');
    expect(out).not.toContain('data-dm-clear="building"');
    // the open count is all the open reports — not shown beside a filtered list (review #13); the active chip is marked (review #12)
    expect(out).not.toContain("פתוחים (1)");
    expect(out).toMatch(/aria-current="true"[^>]*data-dm-reason="threat"/);
    expect(out).toMatch(/min-height:44px/);
  });

  it("loading and a failure with a retry button (the data comes from /api, not in the page)", () => {
    const loading = renderToStaticMarkup(createElement(DmReportsQueueView, { data: { state: "loading" }, filter: dmFilterOf({}), now: NOW }));
    expect(loading).toContain('data-dm-loading=""');
    expect(loading).not.toContain(DM_EMPTY_TEXT);
    const failed = renderToStaticMarkup(createElement(DmReportsQueueView, { data: { state: "error", message: "" }, filter: dmFilterOf({}), now: NOW, onRetry: () => {} }));
    expect(failed).toContain('data-dm-retry=""');
    expect(queueApiUrl(dmFilterOf({ reason: "spam", person: AVI }))).toBe(`/api/dm-reports?status=open&order=oldest&reason=spam&person=${AVI}`);
    expect(queueFromReply(200, { state: "ok", items: [open], openTotal: 1, truncated: false })).toMatchObject({ state: "ok", openTotal: 1, items: [{ id: R1 }] });
    expect(queueFromReply(503, { state: "missing" })).toEqual({ state: "missing" });
    expect(queueFromReply(502, { state: "error", message: "bloc לא ענה" })).toEqual({ state: "error", message: "bloc לא ענה" });
    expect(queueFromReply(200, { items: "x" })).toEqual({ state: "error", message: "" });
  });
});

const report: DmReport = {
  ...open, note: "שלח לי הודעות באמצע הלילה",
  messages: [
    { id: M1, at: "2026-11-21T20:00:00Z", from: "reported", verified: true, text: SECRET, media: [{ id: F1, kind: "image", mime: "image/jpeg", size: 204800 }] },
    { id: M2, at: "2026-11-21T20:01:00Z", from: "reported", verified: false, text: null, media: [] },
  ],
  others: { about_reported: 2, by_reporter: 0 },
  history: [
    { action: "viewed", at: "2026-11-22T11:00:00Z", by: "tal@bloc.co.il", note: null, redacted: false, notified: null },
    { action: "viewed", at: "2026-11-22T10:00:00Z", by: "tal@bloc.co.il", note: null, redacted: false, notified: null },
    { action: "reopened", at: "2026-11-22T09:30:00Z", by: "owner@bloc.co.il", note: null, redacted: false, notified: null },
    { action: "reviewed", at: "2026-11-22T09:00:00Z", by: "dana@bloc.co.il", note: "דיברנו עם הוועד", redacted: false, notified: true },
  ],
};
const d = (over: Partial<DmReportDetailProps> = {}) => renderToStaticMarkup(createElement(DmReportDetailView, {
  report, canManage: true, now: NOW, busy: false, error: null, done: null, note: "", notify: true, opened: {},
  onNote: () => {}, onNotify: () => {}, onReview: () => {}, onReopen: () => {}, onOpenMedia: () => {}, onCloseMedia: () => {}, ...over,
}));

describe("one report", () => {
  it("who and where, with links; the note; a verified text as sent, an unverified one without text; a file is a button, not content", () => {
    const out = d();
    expect(out).toContain(`href="/tenants/${AVI}"`);
    expect(out).toContain(`href="/tenants/${NOA}"`);
    expect(out).toContain(`href="/buildings/${B1}"`);
    expect(out).toContain(`href="/dm-reports?status=all&amp;person=${AVI}"`);
    expect(out).toContain("עוד 2 דיווחים עליו/ה");
    expect(out).toContain("שלח לי הודעות באמצע הלילה");
    expect(out).toContain(SECRET);
    expect(out).toContain(DM_UNVERIFIED_TEXT);
    expect(out).toContain(NOTE_HINT);
    expect(out).toContain('data-dm-verified="no"');
    expect(out).toContain("לפתוח תמונה (200KB)");
    expect(out).toContain(MEDIA_HINT);
    expect(out).not.toContain("<img");
    expect(out).toContain("באיחור של שעתיים");
  });

  it("an opened file shows inline (a blob address only); a failure says why; video and audio get players", () => {
    expect(d({ opened: { [F1]: { state: "open", url: "blob:panel/1", kind: "image" } } })).toContain('<img src="blob:panel/1"');
    expect(d({ opened: { [F1]: { state: "loading" } } })).toContain("פותחים…");
    expect(d({ opened: { [F1]: { state: "error", error: "הקובץ כבר לא שמור" } } })).toContain("הקובץ כבר לא שמור");
    const vid = { ...report, messages: [{ ...report.messages[0], media: [{ id: F1, kind: "video" as const, mime: "video/mp4", size: 1 }] }] };
    expect(d({ report: vid, opened: { [F1]: { state: "open", url: "blob:v", kind: "video" } } })).toContain('<video src="blob:v" controls=""');
  });

  it("open + manage: the check form (note, notify on by default); checked: reopen; no permission: no actions", () => {
    const out = d();
    expect(out).toContain('data-dm-review=""');
    expect(out).toContain('checked=""');
    expect(out).toContain("לשלוח למדווח/ת הודעה שהדיווח נבדק");
    expect(out).not.toContain("data-dm-reopen");
    const checked = d({ report: { ...report, status: "reviewed", reviewed_at: "2026-11-22T09:00:00Z" } });
    expect(checked).toContain("data-dm-reopen");
    expect(checked).not.toContain("data-dm-review-go");
    const viewer = d({ canManage: false });
    expect(viewer).not.toContain("data-dm-review");
    expect(viewer).not.toContain("data-dm-reopen");
    // the reporter's account is gone — no notice to offer (review #17)
    const noReporter = d({ report: { ...report, reporter: null } });
    expect(noReporter).not.toContain("data-dm-review-notify");
    expect(noReporter).toContain('data-dm-no-reporter=""');
  });

  it("the report screen states: loading, not found, not installed, failed with a retry", () => {
    const st = (s: Parameters<typeof ReportStatusView>[0]["s"]) => renderToStaticMarkup(createElement(ReportStatusView, { s, onRetry: () => {} }));
    expect(st({ state: "loading" })).toContain('data-dm-report-loading=""');
    expect(st({ state: "not_found" })).toContain("הדיווח לא נמצא");
    expect(st({ state: "missing" })).toContain(DM_SQL_MISSING_TEXT);
    expect(st({ state: "error", message: "הפתיחה לא נרשמה ביומן" })).toContain('data-dm-retry=""');
    expect(reportFromReply(404, { state: "not_found" }, 1)).toEqual({ state: "not_found" });
    expect(reportFromReply(200, { state: "ok", report }, 5)).toEqual({ state: "ok", report, now: 5 });
    expect(reportFromReply(502, { state: "error", message: "x" }, 1)).toEqual({ state: "error", message: "x" });
    expect(reportFromReply(200, { state: "ok" }, 1).state).toBe("error");
  });

  it("the history: who opened (views in a row collapse), who checked and what they wrote, who reopened; a failed history says so", () => {
    const out = d();
    // the staff email is isolated in an RTL line (an email first must not turn the line left-to-right)
    expect(out).toContain('<div dir="rtl"><bdi dir="ltr">tal@bloc.co.il</bdi> פתח/ה את הדיווח (פעמיים)');
    expect(out).toContain('<bdi dir="ltr">owner@bloc.co.il</bdi> החזיר/ה את הדיווח לתור');
    expect(out).toContain('<bdi dir="ltr">dana@bloc.co.il</bdi> סימן/ה שנבדק · עם הודעה למדווח/ת');
    expect(out).toContain("&quot;דיברנו עם הוועד&quot;");
    expect(d({ report: { ...report, history: null } })).toContain("ההיסטוריה לא נטענה. הדיווח עצמו כן.");
    expect(d({ report: { ...report, history: [] } })).toContain("אין עדיין רישום.");
  });

  it("what happened shows by the button (the head of a long page is off the phone screen); already checked by someone else is a warning, and the note stays", () => {
    const ok = d({ done: "הדיווח סומן כנבדק." });
    expect(ok.indexOf("הדיווח סומן כנבדק.")).toBeGreaterThan(ok.indexOf("data-dm-review-go"));
    const warns = (h: string) => h.split("#eab308").length;
    // as it is after the reload: the report is checked (by the colleague), the form is gone — the note that was not saved is shown
    const checked = { ...report, status: "reviewed" as const, reviewed_at: "2026-11-22T11:00:00Z" };
    const already = d({ report: checked, done: ALREADY_CHECKED_TEXT, note: "דיברנו עם הוועד" });
    expect(warns(already)).toBeGreaterThan(warns(d({ report: checked })));
    expect(warns(ok)).toBe(warns(d({})));
    expect(already).toContain("ההערה שלך, שלא נשמרה:");
    expect(already).toContain(">דיברנו עם הוועד</div>");
    expect(d({ report: checked })).not.toContain("data-dm-unsaved-note");
    expect(d({ report: checked, note: "   " })).not.toContain("data-dm-unsaved-note");
    const err = d({ error: "לא ברור אם הפעולה בוצעה. רעננו את הדף." });
    expect(err.indexOf('role="alert"')).toBeGreaterThan(err.indexOf("data-dm-review-go"));
  });

  it("after a check — what happened, honestly", () => {
    expect(reviewDoneText(true, true, true)).toBe("הדיווח סומן כנבדק, והמדווח/ת קיבל/ה הודעה.");
    expect(reviewDoneText(true, true, false)).toBe("הדיווח סומן כנבדק, אבל ההודעה למדווח/ת לא נשלחה.");
    expect(reviewDoneText(true, false, false)).toBe("הדיווח סומן כנבדק.");
    expect(reviewDoneText(false, true, null)).toBe(ALREADY_CHECKED_TEXT);
    expect(reviewDoneText(true, true, false, true)).toBe("הדיווח סומן כנבדק. המדווח/ת כבר קיבל/ה הודעה בבדיקה הקודמת, אז לא נשלחה עוד אחת.");
  });

  it("what a check sends: a notice only when asked and the reporter still has an account; the note trimmed, only when written", () => {
    const withReporter = { id: R1, reporter: { id: NOA, name: "נועה לוי" } }, gone = { id: R1, reporter: null };
    expect(reviewBody(withReporter, "  דיברנו עם הוועד  ", true)).toEqual({ action: "review", id: R1, notify: true, note: "דיברנו עם הוועד" });
    expect(reviewBody(withReporter, "   ", false)).toEqual({ action: "review", id: R1, notify: false });
    expect(reviewBody(gone, "", true)).toEqual({ action: "review", id: R1, notify: false });
  });

  it("the note goes only when something was saved; already checked by someone else — it stays (review #5)", () => {
    expect(noteAfter(true, "דיברנו")).toBe("");
    expect(noteAfter(false, "דיברנו")).toBe("דיברנו");
  });
});
