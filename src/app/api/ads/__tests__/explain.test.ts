// bloc ADS-1b — /api/ads/explain: "למה המשתמש הזה לא רואה פרסומת?" — קריאה לכל מי שרואה פרסומות (ads.read),
// דרך bloc (חתום), בלי לגעת ב-DB מכאן; נרשם ביומן (מי בדק את מי), בלי התשובה; שגיאה של bloc — כמו שהיא.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { EXPLAIN_SLOT_UNSUPPORTED_TEXT } from "@/lib/adsExplain";

let guardResult: any;
const calls: any[] = [];
const audits: any[] = [];
let blocAnswer: any;

vi.mock("@/lib/guard", () => ({ guard: async (opts: any) => (typeof guardResult === "function" ? guardResult(opts) : guardResult) }));
vi.mock("@/lib/auth", () => ({ auditLog: async (...a: any[]) => { audits.push(a); } }));
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => { calls.push({ path, payload }); return blocAnswer; } }));
vi.mock("@/lib/supabase", () => ({ adminClient: { from: () => { throw new Error("the panel does not read the DB here"); } } }));

let POST: any;
const VIEWER = { id: "v-1", email: "viewer@bloc.co.il", role: "viewer" };
const req = (body: any, ip: string | null = null): any => ({ json: async () => body, headers: { get: (h: string) => (h === "x-forwarded-for" ? ip : null) } });

beforeEach(async () => {
  ({ POST } = await import("../explain/route"));
  guardResult = { ok: true, session: VIEWER };
  blocAnswer = { ok: true, status: 200, data: { found: true, ambiguous: false, db: { verdict: "none" } } };
  calls.length = 0; audits.length = 0;
});

describe("ads explain POST", () => {
  it("ads.read (a viewer may check); without it — nothing reaches bloc", async () => {
    let asked: any;
    guardResult = (opts: any) => { asked = opts; return { ok: false, response: { status: 403 } }; };
    const r = await POST(req({ email: "a@x.co" }));
    expect(r.status).toBe(403);
    expect(asked).toEqual({ permission: "ads.read" });
    expect(calls).toHaveLength(0);
  });
  it("the email (trimmed) and the screen (home by default) go to bloc's explain; the answer comes back as result; no-store", async () => {
    const r = await POST(req({ email: "  Tal@Example.com " }, "1.2.3.4, 10.0.0.1"));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(calls).toEqual([{ path: "/api/internal/ads/explain", payload: { email: "Tal@Example.com", screen: "home" } }]);
    expect(await r.json()).toEqual({ ok: true, result: { found: true, ambiguous: false, db: { verdict: "none" } } });
    await POST(req({ email: "a@x.co", screen: "events" }));
    expect(calls[1].payload).toEqual({ email: "a@x.co", screen: "events" });
  });
  it("audited as AD_EXPLAIN with who was checked (lower-case) and the screen — not the answer", async () => {
    await POST(req({ email: "Tal@Example.com", screen: "market" }, "1.2.3.4, 10.0.0.1"));
    expect(audits).toHaveLength(1);
    expect(audits[0][0]).toEqual(VIEWER);
    expect(audits[0][1]).toBe("AD_EXPLAIN");
    expect(audits[0][4]).toEqual({ email: "tal@example.com", screen: "market" });
    expect(audits[0][5]).toBe("1.2.3.4");
  });
  it("a bad email / screen / extra field — 400 in Hebrew, nothing sent", async () => {
    for (const body of [{ email: "nope" }, { email: "a@x.co", screen: "payments" }, { email: "a@x.co", user_id: "x" }, {}]) {
      const r = await POST(req(body));
      expect(r.status).toBe(400);
    }
    const r = await POST(req({ email: "nope" }));
    expect((await r.json()).error).toContain("מייל לא תקין");
    expect(calls).toHaveLength(0);
  });
  it("bloc failed (an old bloc without the route, a timeout) — its status and sentence; not audited", async () => {
    blocAnswer = { ok: false, status: 502, code: "OLD_BLOC", error: "הבקשה הגיעה ל-bloc, אבל הגרסה שם לא מכירה את הפעולה הזו" };
    const r = await POST(req({ email: "a@x.co" }));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: "הבקשה הגיעה ל-bloc, אבל הגרסה שם לא מכירה את הפעולה הזו", code: "OLD_BLOC" });
    expect(audits).toHaveLength(0);
  });
});

// ── ADS-2א (החלטות 376, 378): ה-slot של הבדיקה — מעל המסך / פס / ברשימה ──

describe("ads explain — the slot (ADS-2א)", () => {
  it("full is the default and is NOT sent — the request is byte-for-byte today's", async () => {
    await POST(req({ email: "a@x.co" }));
    await POST(req({ email: "a@x.co", slot: "full" }));
    expect(calls.map((c) => c.payload)).toEqual([{ email: "a@x.co", screen: "home" }, { email: "a@x.co", screen: "home" }]);
    expect(audits[1][4]).toEqual({ email: "a@x.co", screen: "home" });
  });
  it("banner / inline go to bloc (for ad_explain's p_slot) and into the log", async () => {
    await POST(req({ email: "a@x.co", screen: "market", slot: "banner" }));
    await POST(req({ email: "a@x.co", slot: "inline" }));
    expect(calls.map((c) => c.payload)).toEqual([{ email: "a@x.co", screen: "market", slot: "banner" }, { email: "a@x.co", screen: "home", slot: "inline" }]);
    expect(audits.map((a) => a[4])).toEqual([{ email: "a@x.co", screen: "market", slot: "banner" }, { email: "a@x.co", screen: "home", slot: "inline" }]);
  });
  it("an unknown slot — 400 in Hebrew, nothing sent", async () => {
    const r = await POST(req({ email: "a@x.co", slot: "popup" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("סוג פרסומת לא תקין");
    expect(calls).toHaveLength(0);
  });
  it("a bloc that does not know slot yet refuses it (400) → a sentence that says so, not \"failed\"; not logged", async () => {
    blocAnswer = { ok: false, status: 400, code: "invalid", error: "invalid" };
    const r = await POST(req({ email: "a@x.co", slot: "banner" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: EXPLAIN_SLOT_UNSUPPORTED_TEXT, code: "slot_unsupported" });
    expect(EXPLAIN_SLOT_UNSUPPORTED_TEXT).toContain("רק מודעות שמעל המסך (כרטיס, חלון קופץ, מסך מלא, סטורי)");
    expect(audits).toHaveLength(0);
    // the same 400 on the full slot is bloc's own answer, as before
    const f = await POST(req({ email: "a@x.co" }));
    expect(await f.json()).toEqual({ error: "invalid", code: "invalid" });
    // other failures on a non-full slot pass through as before
    blocAnswer = { ok: false, status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן." };
    expect(await (await POST(req({ email: "a@x.co", slot: "inline" }))).json()).toEqual({ error: "bloc לא ענה בזמן.", code: "TIMEOUT" });
  });
});
