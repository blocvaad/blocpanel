// BILL-1b: the "this building / company has a live subscription" dialog, built from the EXACT 409 the handlers return
// (the fixture is the real buildings / companies handlers' output over mocks — not hand-written).
// The dialog is a hook-free function of its props: it is called directly and its element tree is walked, so clicks
// are real calls to the handlers it was given.
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let subsRow: any;
vi.mock("@/lib/guard", () => ({ guard: async () => ({ ok: true, session: { id: "5b1f0a3c-8d2e-4f6a-9b7c-1e2d3f4a5b6c", email: "tal@bloc.test", role: "superadmin" } }) }));
vi.mock("@/lib/auth", () => ({ auditLog: async () => {} }));
// PANEL-PAY א2: building suspend / archive — bloc decides and answers 409 live_subscription (lib/panelOps/buildings liveDecision,
// failReply { error, code, subscription, action }); the company route still reads the subscription itself (below).
vi.mock("@/lib/blocApi", () => ({ callBloc: async (path: string, payload: any) => {
  if (path === "/api/internal/buildings") {
    const s = subsRow[0];
    const action = payload.action === "archive" ? "archive" : "suspend";
    const subscription = { status: s.status, plan_id: s.plan_id, has_recurring: !!s.provider_recurring_uid, period_end: s.current_period_end };
    return { ok: false, status: 409, code: "live_subscription", error: "live_subscription", data: { error: "live_subscription", code: "live_subscription", subscription, action } };
  }
  return { ok: true, status: 200, data: { ok: true, result: "opened" } };
} }));
vi.mock("@/lib/stepUp", () => ({ requireStepUp: () => ({ ok: true }) }));
vi.mock("@/lib/supabase", () => ({
  adminClient: {
    from: (table: string) => {
      const chain: any = new Proxy({}, { get: (_t, p: string) => {
        if (p === "then") return (r: any) => r(table === "billing_subscriptions" ? { data: subsRow, error: null } : { data: [], error: null });
        if (p === "maybeSingle" || p === "single") return async () => ({ data: { id: "x", name: "השקד 104", is_active: false }, error: null });
        return () => chain;
      } });
      return chain;
    },
    rpc: async () => ({ data: [], error: null }),
  },
}));

import LiveSubscriptionDialog, { StopTaskFailedNotice, parseLiveConflict, stopTaskNote, DIALOG_COPY } from "../LiveSubscriptionDialog";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (body: any): any => ({ json: async () => body, headers: { get: () => null } });
let suspend409: { status: number; body: any }, archive409: { status: number; body: any }, company409: { status: number; body: any };

beforeAll(async () => {
  subsRow = [{ status: "trialing", plan_id: "tower", provider_recurring_uid: "u", current_period_end: "2026-12-01T00:00:00Z" }];
  const b = await import("@/app/api/buildings/[id]/route");
  const s: any = await b.PATCH(req({ is_active: false }), ctx);
  suspend409 = { status: s.status, body: await s.json() };
  const a: any = await b.DELETE(req({ reason: "x" }), ctx);
  archive409 = { status: a.status, body: await a.json() };
  subsRow = [{ status: "active", plan_id: "mgmt_start", provider_recurring_uid: null, current_period_end: null }];
  const c = await import("@/app/api/management-companies/route");
  const r: any = await c.PATCH(req({ id: ID, action: "suspend", expected_status: "active", reason: "חוב פתוח של שלושה חודשים" }));
  company409 = { status: r.status, body: await r.json() };
});

// ── walk the element tree ──
type El = { type: any; props: any };
const kids = (n: any): any[] => (n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(kids) : [n]);
function find(n: any, pred: (e: El) => boolean, out: El[] = []): El[] {
  for (const k of kids(n)) {
    if (typeof k === "object" && k.props) { if (pred(k)) out.push(k); find(k.props.children, pred, out); }
  }
  return out;
}
const textOf = (n: any): string => kids(n).map((k) => (typeof k === "object" && k.props ? textOf(k.props.children) : String(k))).join("");
const dialog = (owner: "building" | "company", c: { status: number; body: any }, over: Record<string, unknown> = {}) => {
  const conflict = parseLiveConflict(c.status, c.body)!;
  const calls = { confirm: 0, cancel: 0 };
  const tree: any = LiveSubscriptionDialog({ owner, conflict, onConfirm: () => { calls.confirm++; }, onCancel: () => { calls.cancel++; }, ...over } as any);
  return { tree, calls, conflict };
};
const btn = (tree: any, attr: string) => find(tree, (e) => e.type === "button" && attr in e.props)[0];
const html = (owner: "building" | "company", c: { status: number; body: any }, over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(LiveSubscriptionDialog, { owner, conflict: parseLiveConflict(c.status, c.body)!, onConfirm: () => {}, onCancel: () => {}, ...over }));

describe("the 409 the handlers return feeds the dialog", () => {
  it("fixtures are real 409 LIVE_SUBSCRIPTION answers (suspend / archive / company)", () => {
    expect(suspend409.status).toBe(409); expect(suspend409.body.code).toBe("LIVE_SUBSCRIPTION"); expect(suspend409.body.action).toBe("suspend");
    expect(archive409.status).toBe(409); expect(archive409.body.action).toBe("archive");
    expect(company409.status).toBe(409); expect(company409.body.action).toBe("suspend");
  });
  it("parseLiveConflict reads them; any other answer is not a live-subscription conflict", () => {
    expect(parseLiveConflict(409, suspend409.body)).toMatchObject({ action: "suspend", subscription: { status: "trialing", plan_id: "tower", has_recurring: true, period_end: "2026-12-01T00:00:00Z" } });
    expect(parseLiveConflict(409, archive409.body)!.action).toBe("archive");
    expect(parseLiveConflict(200, suspend409.body)).toBeNull();
    expect(parseLiveConflict(409, { error: "לבניין יש מנוי משלם פעיל", code: "OTHER" })).toBeNull();
    expect(parseLiveConflict(503, { code: "LIVE_READ_FAILED" })).toBeNull();
    expect(parseLiveConflict(409, null)).toBeNull();
  });
});

describe("the dialog (building suspend)", () => {
  it("title, three lines (plan, status, recurring), the explanation, both buttons — the E46 texts", () => {
    const h = html("building", suspend409);
    expect(h).toContain("לבניין יש מנוי חי");
    expect(h).toMatch(/data-live-sub-line="plan"[\s\S]*?מסלול:[\s\S]*?>Pro</);
    expect(h).toMatch(/data-live-sub-line="status"[\s\S]*?סטטוס:[\s\S]*?ניסיון/);
    expect(h).toMatch(/data-live-sub-line="recurring"[^>]*>יש הוראת קבע</);
    expect(h).toContain("ההשעיה לא עוצרת את החיוב. אחרי האישור תיפתח משימת עצירה ידנית ב-PayPlus.");
    expect(h).toContain(">אשרו והשעו<");
    expect(h).toContain(">ביטול<");
    expect(h).toMatch(/data-live-sub-dialog="building"/);
  });
  it("no recurring instruction → 'אין הוראת קבע'", () => {
    const h = html("building", { status: 409, body: { ...suspend409.body, subscription: { ...suspend409.body.subscription, has_recurring: false } } });
    expect(h).toMatch(/data-live-sub-line="recurring"[^>]*>אין הוראת קבע</);
    expect(h).not.toContain(">יש הוראת קבע<");
  });
  it("'ביטול' sends nothing: onCancel once, onConfirm never", () => {
    const { tree, calls } = dialog("building", suspend409);
    btn(tree, "data-live-sub-cancel").props.onClick();
    expect(calls).toEqual({ confirm: 0, cancel: 1 });
  });
  it("the confirm button calls onConfirm once (and never onCancel)", () => {
    const { tree, calls } = dialog("building", suspend409);
    btn(tree, "data-live-sub-confirm").props.onClick();
    expect(calls).toEqual({ confirm: 1, cancel: 0 });
  });
  it("while sending: both buttons disabled (no double click), the label says so, and the modal cannot be closed", () => {
    const { tree } = dialog("building", suspend409, { busy: true });
    expect(btn(tree, "data-live-sub-confirm").props.disabled).toBe(true);
    expect(btn(tree, "data-live-sub-cancel").props.disabled).toBe(true);
    expect(textOf(btn(tree, "data-live-sub-confirm").props.children)).toBe("שולחים…");
    expect(tree.props.busy).toBe(true);
    const idle = dialog("building", suspend409).tree;
    expect(btn(idle, "data-live-sub-confirm").props.disabled).toBe(false);
    expect(html("building", suspend409, { busy: true })).toMatch(/data-live-sub-confirm=""[^>]*disabled/);
  });
  it("a failed resend shows its error inside the dialog (and keeps the buttons)", () => {
    const h = html("building", suspend409, { error: "אין חיבור לשרת. נסו שוב." });
    expect(h).toContain("אין חיבור לשרת. נסו שוב.");
    expect(h).toContain(">אשרו והשעו<");
  });
});

describe("variants", () => {
  it("archive: same dialog with 'ארכוב' wording", () => {
    const h = html("building", archive409);
    expect(h).toContain("לבניין יש מנוי חי");
    expect(h).toContain("הארכוב לא עוצר את החיוב. אחרי האישור תיפתח משימת עצירה ידנית ב-PayPlus.");
    expect(h).toContain(">אשרו וארכבו<");
    expect(h).not.toContain("ההשעיה לא עוצרת");
    expect(h).toMatch(/data-live-sub-action="archive"/);
  });
  it("company: 'לחברה יש מנוי חי', the management plan label, no recurring", () => {
    const h = html("company", company409);
    expect(h).toContain("לחברה יש מנוי חי");
    expect(h).not.toContain("לבניין יש מנוי חי");
    expect(h).toMatch(/data-live-sub-line="plan"[\s\S]*?ניהול · Start/);
    expect(h).toMatch(/data-live-sub-line="status"[\s\S]*?פעיל/);
    expect(h).toMatch(/data-live-sub-line="recurring"[^>]*>אין הוראת קבע</);
    expect(h).toContain(">אשרו והשעו<");
    expect(h).toMatch(/data-live-sub-dialog="company"/);
  });
  it("the copy table is the contract text", () => {
    expect(DIALOG_COPY.title).toEqual({ building: "לבניין יש מנוי חי", company: "לחברה יש מנוי חי" });
    expect(DIALOG_COPY.cancel).toBe("ביטול");
  });
});

describe("the company window's request keeps the 409 body (and only for it)", () => {
  it("patchCompany over the real company 409 → status + body that parseLiveConflict reads; other refusals keep the old shape", async () => {
    const { patchCompany } = await import("../CompanyDecisionModal");
    const orig = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response(JSON.stringify(company409.body), { status: 409 })) as unknown as typeof fetch;
      const r: any = await patchCompany({});
      expect(r.ok).toBe(false);
      expect(parseLiveConflict(r.status, r.body)).toMatchObject({ action: "suspend", subscription: { plan_id: "mgmt_start" } });
      globalThis.fetch = (async () => new Response(JSON.stringify({ error: "x", code: "CHANGED" }), { status: 409 })) as unknown as typeof fetch;
      expect(await patchCompany({})).toEqual({ ok: false, error: "x", code: "CHANGED" });
    } finally { globalThis.fetch = orig; }
  });
});

describe("stop_task after a confirmed action", () => {
  it("failed → a prominent alert with the warning (the action ran, the task did not open)", () => {
    const h = renderToStaticMarkup(createElement(StopTaskFailedNotice, {}));
    expect(h).toMatch(/role="alert"/);
    expect(h).toContain("data-stop-task-failed");
    expect(h).toContain("הפעולה בוצעה, אבל משימת העצירה לא נפתחה");
    expect(h).toContain("עדיין פעילה ב-PayPlus");
  });
  it("opened / already get a short note; none / failed / undefined get none (failed has its own alert)", () => {
    expect(stopTaskNote("opened")).toContain("נפתחה משימת עצירה ידנית");
    expect(stopTaskNote("already")).toContain("כבר הייתה פתוחה");
    expect(stopTaskNote("none")).toBeNull();
    expect(stopTaskNote("failed")).toBeNull();
    expect(stopTaskNote(undefined)).toBeNull();
  });
});
