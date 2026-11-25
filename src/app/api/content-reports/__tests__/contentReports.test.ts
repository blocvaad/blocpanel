// bloc SAFETY-1 (MG-S1241, החלטות 676–677): הדיווחים על תוכן בפאנל — דרך bloc החתום בלבד.
//   • התור: content_reports.read; הסינון מהכתובת ל-bloc; no-store; לא הותקן — 503; כשל — 502 עם המשפט (לא "אין דיווחים").
//   • פריט: content_reports.read; POST (נרשם); ביומן הפאנל רק כש-bloc נתן אותו; לא נמצא — 404; מזהה / סוג לא תקינים — 400 לפני bloc.
//   • פעולות: content_reports.manage; הצלחה רק כש-bloc ענה בצורה הנכונה; ההערה עצמה לא נכנסת ליומן הפאנל; private / no_committee — המשפט.
//   • הבדיקה של מה ש-bloc מחזיר: מי דיווח לא יכול לעבור (אין לו שדה), קישור — רק נתיב פנימי, עותק עד 1,200.
import { describe, it, expect, beforeEach, vi } from "vitest";

let guardResult: any;
let guardArgs: any[] = [];
const calls: Array<{ path: string; payload: any }> = [];
const audits: any[][] = [];
let blocAnswer: any;

vi.mock("@/lib/guard", () => ({ guard: async (...a: any[]) => { guardArgs = a; return guardResult; } }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("no direct db"); } } }));

import { GET, POST } from "../route";
import { POST as ONE } from "../one/route";
import { crFilterOf, crApiUrl, crListBody, parseCrList, parseCrReport, reasonsText, authorLine, hiddenText, crFailure } from "@/lib/contentReports";

const M1 = "cccc0001-0000-4000-8000-000000000001";
const B1 = "c0f1cb42-8e52-4a4e-a8d7-5563c10d6a2e";
const DANA = "0b9d1c3e-7f6a-4b5c-9d8e-1f2a3b4c5d6e";
const req = (body: any): any => ({ json: async () => body, headers: { get: () => "1.2.3.4, 5.6.7.8" } });
const getReq = (qs: string): any => ({ nextUrl: new URL(`https://panel.local/api/content-reports${qs}`), headers: { get: () => null } });
const as = (role: string) => ({ id: "44444444-4444-4444-8444-444444444444", email: "tal@bloc.co.il", full_name: "טל", role, auth_level: "mfa" });
const ITEM = {
  source: "chat", source_id: M1, building: { id: B1, name: "הרצל 12" }, author: { id: DANA, name: "דנה לוי" }, author_open: 4,
  reports: 3, open: 3, reasons: { offensive: 2, harassment: 1 }, notes: 1, first_at: "2026-11-25T08:00:00Z", last_at: "2026-11-25T09:30:00Z", status: "open", hidden: "auto",
};

beforeEach(() => {
  guardResult = { ok: true, session: as("admin") };
  guardArgs = []; calls.length = 0; audits.length = 0;
  blocAnswer = { ok: true, status: 200, data: { ok: true, action: "hide", changed: true, closed: 3, notified: true } };
});

describe("GET /api/content-reports — the queue", () => {
  it("content_reports.read; the filter from the address; no-store; not installed — 503; a failure — 502 with the sentence", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, items: [ITEM], open_total: 1, truncated: false } };
    let res: any = await GET(getReq("?status=all&source=market_comment&order=oldest&x=1"));
    expect(guardArgs[0]).toEqual({ permission: "content_reports.read" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ state: "ok", openTotal: 1, truncated: false });
    expect(body.items[0]).toMatchObject({ source: "chat", hidden: "auto", author: { id: DANA, name: "דנה לוי" } });
    expect(calls[0]).toEqual({ path: "/api/internal/content-reports", payload: { actor: expect.objectContaining({ role: "admin" }), action: "list", status: "all", order: "oldest", source: "market_comment" } });
    blocAnswer = { ok: false, status: 503, code: "sql_missing", error: "x" };
    expect(((await GET(getReq(""))) as any).status).toBe(503);
    blocAnswer = { ok: false, status: 503, code: "read_failed", error: "x" };
    res = await GET(getReq(""));
    expect(res.status).toBe(502);
    expect((await res.json()).message).toBe("bloc לא הצליח לקרוא כרגע. נסו שוב בעוד רגע.");
    blocAnswer = { ok: true, status: 200, data: { ok: true, items: "nope" } };
    expect(((await GET(getReq(""))) as any).status).toBe(502);
  });
  it("a viewer is stopped by the guard (no bloc call)", async () => {
    guardResult = { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: 403 }) };
    expect(((await GET(getReq(""))) as any).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/content-reports/one — one item", () => {
  it("content_reports.read; POST; logged in the panel only when bloc gave it; 404; a bad body — 400 before bloc", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, report: { item: ITEM, reports: [{ reason: "offensive", note: "שוב", at: "2026-11-25T09:30:00Z", status: "open" }],
      snapshots: ["מילה גסה"], current: { text: "מילה גסה (נערך)", has_image: false, link: "/chat" } } } };
    let res: any = await ONE(req({ source: "chat", id: M1.toUpperCase() }));
    expect(guardArgs[0]).toEqual({ permission: "content_reports.read" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()).report.snapshots).toEqual(["מילה גסה"]);
    expect(calls[0].payload).toEqual({ actor: expect.any(Object), action: "one", source: "chat", id: M1 });
    expect(audits.map((a) => [a[1], a[2], a[3], a[4]])).toEqual([["CONTENT_REPORT_VIEW", "content_report", M1, { source: "chat", building_id: B1 }]]);
    blocAnswer = { ok: false, status: 404, code: "not_found", error: "x" };
    res = await ONE(req({ source: "chat", id: M1 }));
    expect(res.status).toBe(404);
    expect(audits).toHaveLength(1);
    calls.length = 0;
    for (const body of [{ source: "story", id: M1 }, { source: "chat", id: "x" }, { source: "chat", id: M1, reporter_id: DANA }]) {
      expect(((await ONE(req(body))) as any).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/content-reports — the decisions", () => {
  it("hide: content_reports.manage; to bloc with the note; logged without the note; the answer", async () => {
    const res: any = await POST(req({ action: "hide", source: "chat", id: M1, note: " קללות " }));
    expect(guardArgs[0]).toEqual({ permission: "content_reports.manage" });
    expect(calls[0].payload).toEqual({ actor: expect.any(Object), action: "hide", source: "chat", id: M1, note: "קללות" });
    expect(await res.json()).toEqual({ ok: true, action: "hide", changed: true, closed: 3, notified: true });
    expect(audits).toEqual([[expect.any(Object), "CONTENT_REPORT_HIDE", "content_report", M1, { source: "chat", has_note: true, closed: 3, notified: true }, "1.2.3.4"]]);
    expect(JSON.stringify(audits)).not.toContain("קללות");
  });
  it("nothing changed — not logged as a decision; a strange answer — 502 unknown, logged as unknown", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, changed: false, closed: 0, notified: false } };
    await POST(req({ action: "restore", source: "post", id: M1 }));
    expect(audits).toHaveLength(0);
    blocAnswer = { ok: true, status: 200, data: { ok: true } };
    const res: any = await POST(req({ action: "refer", source: "post", id: M1 }));
    expect(res.status).toBe(502);
    expect(audits.map((a) => a[1])).toEqual(["BLOC_ACTION_UNKNOWN"]);
  });
  it("bloc refuses: private / no committee — the sentence; a bad body — 400 before bloc", async () => {
    blocAnswer = { ok: false, status: 409, code: "private", error: "private" };
    let res: any = await POST(req({ action: "refer", source: "market_comment", id: M1 }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("שיחה של שניים");
    blocAnswer = { ok: false, status: 409, code: "no_committee", error: "x" };
    res = await POST(req({ action: "refer", source: "chat", id: M1 }));
    expect((await res.json()).error).toContain("אין ועד פעיל");
    blocAnswer = { ok: false, status: 409, code: "hidden", error: "x" };
    res = await POST(req({ action: "refer", source: "chat", id: M1 }));
    expect([res.status, (await res.json()).error]).toEqual([409, expect.stringContaining("הוועד לא רואה אותו")]);
    calls.length = 0;
    for (const body of [{ action: "delete", source: "chat", id: M1 }, { action: "hide", source: "chat", id: M1, note: "x".repeat(301) }, { action: "hide", source: "chat", id: M1, extra: 1 }]) {
      expect(((await POST(req(body))) as any).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("lib/contentReports — what bloc returns, and the words", () => {
  it("the list: only the known shape; unknown source / bad id dropped; no reporter field ever", () => {
    const l = parseCrList({ ok: true, items: [ITEM, { ...ITEM, source: "story" }, { ...ITEM, source_id: "x" }, { ...ITEM, reporter_id: DANA }], open_total: 2, truncated: true });
    expect(l?.items).toHaveLength(2);
    expect(Object.keys(l!.items[1])).not.toContain("reporter_id");
    expect(l).toMatchObject({ openTotal: 2, truncated: true });
    expect(parseCrList({ ok: false })).toBeNull();
    expect(parseCrList({ ok: false, items: [ITEM] })).toBeNull();
  });
  it("one: a link only when it is an inner path; copies cut at 1,200 and at most 5", () => {
    const r = parseCrReport({ ok: true, report: { item: ITEM, reports: [], snapshots: ["א".repeat(1500), "b", "c", "d", "e", "f"], current: { text: "x", has_image: true, link: "https://evil.example" } } });
    expect(r?.current?.link).toBeNull();
    expect(r?.snapshots).toHaveLength(5);
    expect(r?.snapshots[0]).toHaveLength(1200);
    expect(parseCrReport({ ok: true, report: { item: ITEM, reports: [], snapshots: [], current: { text: "x", link: "//evil" } } })?.current?.link).toBeNull();
    expect(parseCrReport({ ok: true, report: { item: ITEM, reports: [], snapshots: [], current: null } })?.current).toBeNull();
  });
  it("the filter and the words", () => {
    expect(crFilterOf({ status: "closed", source: "market", order: "oldest" })).toEqual({ status: "closed", source: "market", order: "oldest" });
    expect(crFilterOf({ status: "weird", source: "story" })).toEqual({ status: "open", source: null, order: "newest" });
    expect(crApiUrl({ status: "open", source: null, order: "newest" })).toBe("/api/content-reports?status=open&order=newest");
    // no source → no source key (bloc's strict schema takes a kind or nothing, not null)
    expect(crListBody(crFilterOf({}))).toEqual({ action: "list", status: "open", order: "newest" });
    expect(reasonsText({ reports: 3, reasons: { offensive: 2, harassment: 1 } })).toBe("3 דיווחים · 2 פוגעני או גס · 1 הטרדה או בריונות");
    expect(authorLine({ author: { id: DANA, name: "דנה" }, author_open: 4 })).toBe("דנה · 4 דיווחים פתוחים על מה שכתב/ה");
    expect(authorLine({ author: null, author_open: null })).toBe("מי שכתב — חשבון שנמחק");
    expect(hiddenText("auto")).toBe("מוסתר אוטומטית (3 דיווחים)");
    expect(crFailure({ status: 503, code: "write_failed", error: "x" }, "read").error).toContain("לא נרשמה ביומן");
  });
});
