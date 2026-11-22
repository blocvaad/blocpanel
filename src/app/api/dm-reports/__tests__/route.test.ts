// MOD-1 (bloc MG-S1179, החלטות 520, 584–585): "נבדק" / "פתיחה מחדש" וקובץ שדווח — דרך bloc החתום בלבד. "נבדק" — dm_reports.manage;
// קובץ — dm_reports.read (שתיהן מנהל וסופר-אדמין). הצלחה רק כש-bloc ענה בצורה הנכונה; ההערה עצמה לא נכנסת ליומן הפאנל; כתובת של
// קובץ שאינה של ה-Supabase שלנו לא עוברת לדפדפן.
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
import { POST as MEDIA } from "../media/route";
import { POST as ONE } from "../one/route";
const R1 = "77777777-7777-4777-8777-777777777771", F1 = "eeee0001-0000-4000-8000-000000000001";
const KEY = "Ab3+" + "k".repeat(39) + "=", IV = "Iv12" + "x".repeat(12);
const req = (body: any): any => ({ json: async () => body, headers: { get: () => "1.2.3.4, 5.6.7.8" } });
const as = (role: string) => ({ id: "44444444-4444-4444-8444-444444444444", email: "tal@bloc.co.il", full_name: "טל", role, auth_level: "mfa" });

beforeEach(() => {
  guardResult = { ok: true, session: as("admin") };
  guardArgs = []; calls.length = 0; audits.length = 0;
  blocAnswer = { ok: true, status: 200, data: { ok: true, changed: true, notified: true, already: false } };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});
const getReq = (qs: string): any => ({ nextUrl: new URL(`https://panel.local/api/dm-reports${qs}`), headers: { get: () => null } });

describe("GET /api/dm-reports and POST /api/dm-reports/one — the data comes through /api (never inside the page)", () => {
  it("the queue: dm_reports.read; the filter from the address to bloc; no-store; not installed — 503; a failure — 502 with the sentence", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, items: [], open_total: 0, truncated: false } };
    let res: any = await GET(getReq(`?status=all&reason=threat&person=${R1}&order=newest&x=1`));
    expect(guardArgs[0]).toEqual({ permission: "dm_reports.read" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ state: "ok", items: [], openTotal: 0, truncated: false });
    expect(calls[0].payload).toEqual({ actor: expect.objectContaining({ role: "admin" }), action: "list", status: "all", order: "newest", reason: "threat", reported_id: R1 });
    blocAnswer = { ok: false, status: 503, code: "sql_missing", error: "x" };
    expect((await GET(getReq("")) as any).status).toBe(503);
    blocAnswer = { ok: false, status: 503, code: "read_failed", error: "x" };
    res = await GET(getReq(""));
    expect(res.status).toBe(502);
    expect((await res.json()).message).toBe("bloc לא הצליח לקרוא כרגע. נסו שוב בעוד רגע.");
  });

  it("one report: dm_reports.read; logged in the panel only when bloc gave it; not found — 404; a bad id — 400 before bloc", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, report: { id: R1, status: "open", reason: "spam", created_at: "x", reviewed_at: null, building: null, reporter: null, reported: null,
      counts: { messages: 0, verified: 0, media: 0 }, has_note: false, note: null, messages: [], others: {}, history: [] } } };
    let res: any = await ONE(req({ id: R1.toUpperCase() }));
    expect(guardArgs[0]).toEqual({ permission: "dm_reports.read" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.json()).report.id).toBe(R1);
    expect(calls[0].payload).toEqual({ actor: expect.any(Object), action: "one", id: R1 });
    expect(audits.map((a) => a[1])).toEqual(["DM_REPORT_VIEW"]);
    blocAnswer = { ok: false, status: 404, code: "not_found", error: "x" };
    res = await ONE(req({ id: R1 }));
    expect(res.status).toBe(404);
    calls.length = 0;
    expect((await ONE(req({ id: "x" })) as any).status).toBe(400);
    expect((await ONE(req({ id: R1, extra: 1 })) as any).status).toBe(400);
    expect(calls).toEqual([]);
    expect(audits).toHaveLength(1);
  });
});

describe("POST /api/dm-reports", () => {
  it("dm_reports.manage; review — the trimmed note and notify to bloc with the staff member; the panel log keeps that there was a note, not the note", async () => {
    const res: any = await POST(req({ action: "review", id: R1, note: "  דיברנו עם הוועד  ", notify: true }));
    expect(guardArgs[0]).toEqual({ permission: "dm_reports.manage" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, action: "review", changed: true, notified: true, already: false });
    expect(calls).toEqual([{ path: "/api/internal/dm-reports", payload: { actor: { id: as("admin").id, email: "tal@bloc.co.il", role: "admin" }, action: "review", id: R1, notify: true, note: "דיברנו עם הוועד" } }]);
    expect(audits).toEqual([[as("admin"), "DM_REPORT_REVIEW", "dm_report", R1, { notify: true, has_note: true, notified: true, already: false }, "1.2.3.4"]]);
    expect(JSON.stringify(audits)).not.toContain("דיברנו");
  });

  it("reopen; an empty note is not sent; strict bodies — 400 before bloc", async () => {
    blocAnswer = { ok: true, status: 200, data: { ok: true, changed: true } };
    const res: any = await POST(req({ action: "reopen", id: R1 }));
    expect(await res.json()).toEqual({ ok: true, action: "reopen", changed: true, notified: null, already: false });
    expect(audits[0][1]).toBe("DM_REPORT_REOPEN");
    calls.length = 0;
    // nothing changed (a colleague checked it first) — no row in the panel log (review #5)
    blocAnswer = { ok: true, status: 200, data: { ok: true, changed: false, notified: false, already: false } };
    await POST(req({ action: "review", id: R1, note: "   ", notify: false }));
    expect(calls[0].payload).toEqual({ actor: expect.any(Object), action: "review", id: R1, notify: false });
    expect(audits).toHaveLength(1);
    calls.length = 0;
    for (const bad of [{ action: "review", id: R1 }, { action: "delete", id: R1 }, { action: "reopen", id: "x" }, { action: "reopen", id: R1, extra: 1 }]) {
      expect((await POST(req(bad)) as any).status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it("a refusal or a failure — the Hebrew sentence, BLOC_ACTION_FAILED; maybe done — BLOC_ACTION_UNKNOWN; an answer of the wrong shape is never a success", async () => {
    blocAnswer = { ok: false, status: 403, code: "forbidden", error: "forbidden" };
    let res: any = await POST(req({ action: "reopen", id: R1 }));
    expect(res.status).toBe(403);
    expect(audits.at(-1)?.[1]).toBe("BLOC_ACTION_FAILED");
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "x" };
    res = await POST(req({ action: "reopen", id: R1 }));
    expect((await res.json()).error).toBe("לא ברור אם הפעולה בוצעה. רעננו את הדף.");
    expect(audits.at(-1)?.[1]).toBe("BLOC_ACTION_UNKNOWN");
    blocAnswer = { ok: true, status: 200, data: { ok: true, changed: true } };
    res = await POST(req({ action: "review", id: R1, notify: true }));
    expect(res.status).toBe(502);
    expect(audits.at(-1)?.[1]).toBe("BLOC_ACTION_UNKNOWN");
    guardResult = { ok: false, response: { status: 403 } };
    calls.length = 0;
    res = await POST(req({ action: "reopen", id: R1 }));
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });
});

describe("POST /api/dm-reports/media", () => {
  const good = { ok: true, url: "https://abc.supabase.co/storage/v1/object/sign/dm-media/a/b?token=t", key: KEY, iv: IV, mime: "video/mp4", kind: "video", size: 1000 };
  it("dm_reports.read; the address and the key of that one file, no-store; logged as DM_REPORT_MEDIA", async () => {
    blocAnswer = { ok: true, status: 200, data: good };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    const res: any = await MEDIA(req({ id: R1, media_id: F1 }));
    expect(guardArgs[0]).toEqual({ permission: "dm_reports.read" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, url: good.url, key: KEY, iv: IV, mime: "video/mp4", kind: "video", size: 1000 });
    expect(calls[0]).toEqual({ path: "/api/internal/dm-reports", payload: { actor: expect.objectContaining({ role: "admin" }), action: "media", id: R1, media_id: F1 } });
    expect(audits).toEqual([[as("admin"), "DM_REPORT_MEDIA", "dm_report", R1, { media_id: F1, kind: "video" }, "1.2.3.4"]]);
  });
  it("an address that is not of our Supabase — 502, nothing reaches the browser, nothing logged as opened; bloc refused — the sentence; a bad body — 400", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    blocAnswer = { ok: true, status: 200, data: { ...good, url: "https://evil.example/storage/v1/object/sign/dm-media/a" } };
    let res: any = await MEDIA(req({ id: R1, media_id: F1 }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain(KEY);
    expect(audits).toEqual([]);
    blocAnswer = { ok: false, status: 410, code: "gone", error: "gone" };
    res = await MEDIA(req({ id: R1, media_id: F1 }));
    expect(res.status).toBe(410);
    expect((await res.json()).error).toContain("הקובץ כבר לא שמור");
    calls.length = 0;
    expect((await MEDIA(req({ id: R1 })) as any).status).toBe(400);
    expect(calls).toEqual([]);
  });
});
