// א3-1 (bloc, החלטה 444): lib/blocRead — הקריאות של הפאנל דרך bloc, באותו ערוץ חתום של הפעולות.
//   • נשלח: { read, actor, ...params } לנתיב internal/panel-read, חתום (HMAC על `${ts}.${body}`).
//   • תשובה בצורה הנכונה → ok; read אחר / צורה חסרה → BAD_SHAPE (כשל, לא מסך ריק); כשל של bloc או של הרשת — עובר כמו שהוא.
//   • קריאה, לא פעולה: 8 שניות (לא 25), והטקסט של זמן / רשת / קודים של bloc — של קריאה ("נסו לרענן"), לא "ייתכן שהפעולה בוצעה".
//   • חודשים: 'YYYY-MM' → התווית העברית, בסדר כרונולוגי.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "crypto";
import { readBloc, READ_TIMEOUT_MS } from "../blocRead";
import { heMonthLabel, byHeMonth } from "../months";

const config = { url: "https://bloc-x.vercel.app", secret: "s".repeat(40) };
const actor = { id: "00000000-0000-4000-8000-000000000092", email: "view@bloc.co.il", role: "viewer" };
const overview = { stats: { total_buildings: 2 }, recentBuildings: [], revenueByMonth: [{ month: "2026-11", amount: 50 }], counts: { pendingReports: 1, supplierQueue: 0, declined30: 0 }, partial: false, failed: [] };

function fake(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl };
}
const opts = (fetchImpl: (u: string, i: RequestInit) => Promise<Response>) => ({ config, fetchImpl, selfHosts: [], now: () => 1_800_000_000_000 });

describe("readBloc", () => {
  it("posts { read, actor, ...params } to internal/panel-read, signed; the right shape → ok with the data", async () => {
    const f = fake(200, { ok: true, read: "overview", data: overview });
    const r = await readBloc("overview", {}, actor, opts(f.fetchImpl));
    expect(r).toEqual({ ok: true, data: overview });
    expect(f.calls[0].url).toBe("https://bloc-x.vercel.app/api/internal/panel-read");
    const body = String(f.calls[0].init.body);
    expect(JSON.parse(body)).toEqual({ read: "overview", actor });
    const h = f.calls[0].init.headers as Record<string, string>;
    expect(h["x-bloc-panel-signature"]).toBe(createHmac("sha256", config.secret).update(`1800000000000.${body}`).digest("hex"));
    const live = fake(200, { ok: true, read: "live", data: { cursor: "c", src: { tenants: [], tickets: [], declined: [], webhookErrors: [] }, names: {}, stats: {}, failed: [] } });
    await readBloc("live", { since: "2026-11-18T09:00:00.000Z" }, actor, opts(live.fetchImpl));
    expect(JSON.parse(String(live.calls[0].init.body))).toEqual({ read: "live", actor, since: "2026-11-18T09:00:00.000Z" });
    // params never replace the read or the session's actor
    const spoof = fake(200, { ok: true, read: "overview", data: overview });
    await readBloc("overview", { read: "analytics", actor: { id: "x", email: "x@x.co", role: "superadmin" } }, actor, opts(spoof.fetchImpl));
    expect(JSON.parse(String(spoof.calls[0].init.body))).toEqual({ read: "overview", actor });
  });
  it("another read echoed, or a missing part of the shape → BAD_SHAPE (a failure, never an empty screen)", async () => {
    expect(await readBloc("overview", {}, actor, opts(fake(200, { ok: true, read: "analytics", data: overview }).fetchImpl))).toMatchObject({ ok: false, code: "BAD_SHAPE" });
    const { failed: _f, ...noFailed } = overview;
    expect(await readBloc("overview", {}, actor, opts(fake(200, { ok: true, read: "overview", data: noFailed }).fetchImpl))).toMatchObject({ ok: false, code: "BAD_SHAPE" });
    const { stats: _s, ...noStats } = overview;
    expect(await readBloc("overview", {}, actor, opts(fake(200, { ok: true, read: "overview", data: noStats }).fetchImpl))).toMatchObject({ ok: false, code: "BAD_SHAPE" });
    expect(await readBloc("overview", {}, actor, opts(fake(200, { ok: true, read: "overview", data: { ...overview, stats: null } }).fetchImpl))).toMatchObject({ ok: true });
    // every part the screens read: a missing one is a failure, not a crash on the page
    const analytics = { topBuildings: [], buildings: { active: 0, suspended: 0, archived: 0, byPlan: {} }, payments: { byStatus: {}, totalRevenue: 0, totalDebt: 0 },
      tickets: { byUrgency: {}, byStatus: {} }, revenueByMonth: [], growthByMonth: [], tenantsByStatus: {}, partial: false, failed: [] };
    expect(await readBloc("analytics", {}, actor, opts(fake(200, { ok: true, read: "analytics", data: analytics }).fetchImpl))).toMatchObject({ ok: true });
    for (const cut of ["topBuildings", "tenantsByStatus"] as const) {
      const { [cut]: _x, ...rest } = analytics;
      expect([cut, await readBloc("analytics", {}, actor, opts(fake(200, { ok: true, read: "analytics", data: rest }).fetchImpl))]).toMatchObject([cut, { ok: false, code: "BAD_SHAPE" }]);
    }
    expect(await readBloc("analytics", {}, actor, opts(fake(200, { ok: true, read: "analytics", data: { ...analytics, buildings: { active: 0 } } }).fetchImpl))).toMatchObject({ ok: false, code: "BAD_SHAPE" });
    expect(await readBloc("analytics", {}, actor, opts(fake(200, { ok: true, read: "analytics", data: { ...analytics, payments: { totalRevenue: 0 } } }).fetchImpl))).toMatchObject({ ok: false, code: "BAD_SHAPE" });
    const liveData = { cursor: "c", src: { tenants: [], tickets: [], declined: [], webhookErrors: [] }, names: {}, stats: {}, failed: [] };
    expect(await readBloc("live", {}, actor, opts(fake(200, { ok: true, read: "live", data: liveData }).fetchImpl))).toMatchObject({ ok: true });
    expect(await readBloc("live", {}, actor, opts(fake(200, { ok: true, read: "live", data: { ...liveData, src: { tenants: [] } } }).fetchImpl))).toMatchObject({ ok: false, code: "BAD_SHAPE" });
    expect(await readBloc("overview", {}, actor, opts(fake(200, { read: "overview", data: overview }).fetchImpl))).toMatchObject({ ok: false, code: "BAD_SHAPE" });
  });
  it("a refusal of bloc (403), a rejected signature (404) and the network pass through as failures — in the words of a read", async () => {
    expect(await readBloc("overview", {}, actor, opts(fake(403, { error: "forbidden", code: "forbidden" }).fetchImpl))).toEqual({ ok: false, error: "לתפקיד שלך אין הרשאה לנתונים האלה ב-bloc.", code: "forbidden" });
    expect(await readBloc("overview", {}, actor, opts(fake(400, { error: "invalid", code: "invalid" }).fetchImpl))).toMatchObject({ ok: false, code: "invalid", error: expect.stringContaining("bloc לא קיבל") });
    expect(await readBloc("overview", {}, actor, opts(fake(500, { error: "failed", code: "failed" }).fetchImpl))).toMatchObject({ ok: false, code: "failed", error: expect.stringContaining("נסו לרענן") });
    expect(await readBloc("overview", {}, actor, opts(fake(404, { error: "Not found" }).fetchImpl))).toMatchObject({ ok: false, code: "REJECTED" });
    const down = async () => { throw new TypeError("fetch failed"); };
    expect(await readBloc("overview", {}, actor, opts(down))).toEqual({ ok: false, code: "NETWORK", error: "שגיאת רשת מול bloc — נסו לרענן בעוד רגע." });
    expect(await readBloc("overview", {}, actor, { config: null })).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
  });
});

describe("the time limit of a read", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("8 seconds (not the 25 of an action); then a read's words — never 'the action may have happened'", async () => {
    vi.useFakeTimers();
    let settled = false;
    const hang = (_u: string, init: RequestInit) => new Promise<Response>((_, rej) => {
      init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    const p = readBloc("overview", {}, actor, opts(hang)).then((r) => { settled = true; return r; });
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await p;
    expect(READ_TIMEOUT_MS).toBe(8_000);
    expect(r).toEqual({ ok: false, code: "TIMEOUT", error: "bloc לא ענה בזמן — נסו לרענן בעוד רגע." });
    expect(JSON.stringify(r)).not.toContain("ייתכן שהפעולה בוצעה");
  });
});

describe("the months", () => {
  it("'YYYY-MM' → the Hebrew label of that month (mid-month, no time-zone jump), in order, duplicates summed", () => {
    expect(heMonthLabel("2026-11")).toBe(new Date("2026-11-15T12:00:00Z").toLocaleDateString("he-IL", { month: "short", year: "2-digit", timeZone: "Asia/Jerusalem" }));
    const out = byHeMonth([{ month: "2026-11", n: 2 }, { month: "2026-05", n: 1 }, { month: "2026-11", n: 3 }], (r) => r.n);
    expect(Object.keys(out)).toEqual([heMonthLabel("2026-05"), heMonthLabel("2026-11")]);
    expect(Object.values(out)).toEqual([1, 5]);
  });
});
