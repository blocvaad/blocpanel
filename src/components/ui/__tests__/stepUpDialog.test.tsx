// PANEL-PAY א1 (החלטה 364, C4): חלון "אישור פעולת כסף" — מרונדר לשרת (renderToStaticMarkup; בפאנל אין happy-dom). שליחה /
// הקלדת קוד / קוד שגוי / נגמרו הניסיונות; והחיבור שלו לפעולות: stepUpFetch פותח אותו על stepup_required ושולח שוב פעם אחת.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { StepUpDialogView } from "../StepUpDialog";
import {
  stepUpFetch, requestStepUp, registerStepUpHost, isStepUpRequired, afterSend, afterVerify, codeInput, actionErrorText,
  INITIAL_STEPUP, STEPUP_NET_ERROR, type StepUpState,
} from "@/lib/stepUpClient";
import { STEPUP_CANCELLED_TEXT } from "@/lib/stepUpShared";

const S = (o: Partial<StepUpState> = {}): StepUpState => ({ ...INITIAL_STEPUP, ...o });
const html = (s: StepUpState) => renderToStaticMarkup(createElement(StepUpDialogView, { state: s }));
const tag = (h: string, attr: string) => { const m = h.match(new RegExp(`<[a-z]+[^>]*${attr}[^>]*>`)); return m ? m[0] : null; };
const disabled = (t: string | null) => !!t && /\sdisabled(=""|\s|>)/.test(t);

describe("the dialog", () => {
  it("send: a modal dialog in Hebrew, the track on step 1, 'send a code to the email', cancel", () => {
    const h = html(S());
    expect(h).toContain('role="dialog"');
    expect(h).toContain('aria-modal="true"');
    expect(h).toContain('dir="rtl"');
    expect(h).toContain("אישור פעולת כסף");
    expect(h).toContain('data-stepup-phase="send"');
    expect(h).toContain('data-stepup-track="0"');
    expect(h).toContain("שליחת קוד למייל");
    expect(disabled(tag(h, "data-stepup-send="))).toBe(false);
    expect(h).toContain("האישור תקף 10 דקות, רק בחיבור הזה");
    expect(h).not.toContain("data-stepup-code=");
  });
  it("send busy: 'שולחים…' and closed; send error: a Hebrew banner", () => {
    const busy = html(S({ busy: "send" }));
    expect(busy).toContain("שולחים…");
    expect(disabled(tag(busy, "data-stepup-send="))).toBe(true);
    expect(html(S({ error: "נשלחו יותר מדי קודים. נסו שוב בעוד 10 דקות." }))).toContain("נשלחו יותר מדי קודים");
  });
  it("code entry: where it was sent (masked, isolated LTR), six cells, one-time-code input; 'approve' closed until 6 digits", () => {
    const h = html(S({ phase: "code", sentTo: "t•••@bloc.co.il", code: "4821" }));
    expect(h).toContain('data-stepup-phase="code"');
    expect(h).toContain('data-stepup-track="1"');
    expect(h).toContain('<bdi dir="ltr"');
    expect(h).toContain("t•••@bloc.co.il");
    expect((h.match(/data-stepup-cell=/g) ?? []).length).toBe(6);
    expect(h).toContain('data-stepup-cell="4"');
    // attribute names: compared case-insensitively (react-dom/server versions differ in the casing they print)
    expect(tag(h, "data-stepup-code=")!.toLowerCase()).toContain('autocomplete="one-time-code"');
    expect(tag(h, "data-stepup-code=")!.toLowerCase()).toContain('inputmode="numeric"');
    expect(disabled(tag(h, "data-stepup-verify="))).toBe(true);
    expect(disabled(tag(html(S({ phase: "code", code: "482193" })), "data-stepup-verify="))).toBe(false);
    expect(h).toContain("שליחה מחדש");
  });
  it("wrong code: the error banner (how many tries are left), the field marked invalid, still editable", () => {
    const h = html(S({ phase: "code", code: "123456", error: "הקוד שגוי. נשארו 3 ניסיונות." }));
    expect(h).toContain('data-stepup-error="wrong"');
    expect(h).toContain("הקוד שגוי. נשארו 3 ניסיונות.");
    expect(tag(h, "data-stepup-code=")).toContain('aria-invalid="true"');
    expect(disabled(tag(h, "data-stepup-code="))).toBe(false);
  });
  it("tries used up / expired: locked — the field and 'approve' are closed, only 'send again'", () => {
    const h = html(S({ phase: "code", locked: true, error: "נגמרו הניסיונות לקוד הזה. שלחו קוד חדש." }));
    expect(h).toContain('data-stepup-error="locked"');
    expect(disabled(tag(h, "data-stepup-code="))).toBe(true);
    expect(disabled(tag(h, "data-stepup-verify="))).toBe(true);
    expect(disabled(tag(h, "data-stepup-resend="))).toBe(false);
  });
  it("outside production, a failed email shows the code (like the login screen)", () => {
    expect(html(S({ phase: "code", devCode: "424242" }))).toContain("מצב פיתוח — המייל לא נשלח");
  });
});

describe("transitions (pure)", () => {
  it("codeInput keeps digits only, up to 6", () => {
    expect(codeInput("12 34-56")).toBe("123456");
    expect(codeInput("קוד: 4821939")).toBe("482193");
  });
  it("afterSend: ok → code phase with the masked address; failure → the server's sentence; no network → a Hebrew line", () => {
    const s = afterSend({ ok: true, status: 200, j: { sent_to: "t•••@bloc.co.il", expires_at: "x" } }, S({ busy: "send" }));
    expect(s).toMatchObject({ phase: "code", sentTo: "t•••@bloc.co.il", busy: null, error: null, locked: false, code: "" });
    expect(afterSend({ ok: false, status: 429, j: { error: "נשלחו יותר מדי קודים." } }, S()).error).toBe("נשלחו יותר מדי קודים.");
    expect(afterSend(null, S()).error).toBe(STEPUP_NET_ERROR);
  });
  it("afterVerify: ok → done; wrong with tries left → stays editable; used up / expired / used → locked and cleared", () => {
    expect(afterVerify({ ok: true, status: 200, j: {} }, S({ phase: "code" })).done).toBe(true);
    const wrong = afterVerify({ ok: false, status: 400, j: { error: "הקוד שגוי. נשארו 3 ניסיונות.", code: "wrong", remaining: 3 } }, S({ phase: "code", code: "123456" }));
    expect(wrong.done).toBe(false);
    expect(wrong.state).toMatchObject({ locked: false, code: "123456", error: "הקוד שגוי. נשארו 3 ניסיונות." });
    for (const j of [{ code: "too_many_tries" }, { code: "expired" }, { code: "used" }, { code: "none" }, { code: "wrong", remaining: 0 }]) {
      const o = afterVerify({ ok: false, status: 400, j: { error: "x", ...j } }, S({ phase: "code", code: "123456" }));
      expect(o.state.locked, JSON.stringify(j)).toBe(true);
      expect(o.state.code).toBe("");
    }
  });
});

describe("stepUpFetch — open the dialog on stepup_required, retry once", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  let fetches: number;
  beforeEach(() => { fetches = 0; });
  it("any other answer passes through, the dialog never opens", async () => {
    const request = vi.fn(async () => true);
    const r = await stepUpFetch("/api/x", { method: "POST" }, { fetch: async () => { fetches++; return json(409, { code: "changed" }); }, request });
    expect(r.status).toBe(409);
    expect(fetches).toBe(1);
    expect(request).toHaveBeenCalledTimes(0);
    const r2 = await stepUpFetch("/api/x", {}, { fetch: async () => json(403, { error: "נדרש superadmin" }), request });
    expect(r2.status).toBe(403);
    expect(request).toHaveBeenCalledTimes(0);
  });
  it("stepup_required → dialog → approved → the same request once more; its answer is returned", async () => {
    const seen: Array<RequestInit | undefined> = [];
    const answers = [json(403, { code: "stepup_required", error: "x" }), json(200, { ok: true })];
    const init = { method: "POST", body: JSON.stringify({ a: 1 }) };
    const r = await stepUpFetch("/api/x", init, { fetch: async (_u, i) => { seen.push(i); return answers.shift()!; }, request: async () => true });
    expect(r.status).toBe(200);
    expect(seen).toEqual([init, init]);
  });
  it("cancelled → the original 403 comes back (the card says the action did not run); never a loop", async () => {
    let n = 0;
    const r = await stepUpFetch("/api/x", {}, { fetch: async () => { n++; return json(403, { code: "stepup_required" }); }, request: async () => false });
    expect(r.status).toBe(403);
    expect(n).toBe(1);
    let m = 0;
    const r2 = await stepUpFetch("/api/x", {}, { fetch: async () => { m++; return json(403, { code: "stepup_required" }); }, request: async () => true });
    expect(m).toBe(2);                 // retried once, not again
    expect(r2.status).toBe(403);
    expect(actionErrorText(await r2.json(), "x")).toBe(STEPUP_CANCELLED_TEXT);
  });
  it("isStepUpRequired leaves the response readable", async () => {
    const res = json(403, { code: "stepup_required", error: "e" });
    expect(await isStepUpRequired(res)).toBe(true);
    expect((await res.json()).error).toBe("e");
  });
  it("requestStepUp: no dialog mounted → false; mounted → one dialog for two requests at once", async () => {
    expect(await requestStepUp()).toBe(false);
    const opened: Array<(ok: boolean) => void> = [];
    const off = registerStepUpHost((done) => { opened.push(done); });
    const a = requestStepUp(); const b = requestStepUp();
    expect(opened).toHaveLength(1);
    opened[0](true);
    expect([await a, await b]).toEqual([true, true]);
    off();
    expect(await requestStepUp()).toBe(false);
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
  it("the dialog is mounted once, in PanelShell", () => {
    expect(read("components/layout/PanelShell.tsx")).toContain("<StepUpHost />");
  });
  it("every money action in the browser goes through stepUpFetch", () => {
    expect(read("components/ui/AICreditsCard.tsx")).toContain("await stepUpFetch(`/api/buildings/${buildingId}/ai-credits`");
    expect(read("components/ui/CompanyCard.tsx")).toContain('await stepUpFetch("/api/management-companies/billing"');
    expect((read("components/ui/CollectionProvidersCard.tsx").match(/await stepUpFetch\("\/api\/collection-providers"/g) ?? []).length).toBe(2);
    expect(read("components/ui/panelKit.tsx")).toContain('await stepUpFetch("/api/members"');
    expect(read("app/(panel)/committee/page.tsx")).toContain('await stepUpFetch("/api/committee"');
    expect(read("components/ui/BuildingPlanCard.tsx")).toContain("await stepUpFetch(`/api/buildings/${buildingId}/plan`");
    expect(read("app/(panel)/buildings/new/page.tsx")).toContain('await stepUpFetch("/api/buildings"');
  });
  it("the client module carries no server code (no crypto, no next/server)", () => {
    const c = read("lib/stepUpClient.ts");
    expect(c).not.toMatch(/from "crypto"|from "next\/server"|from "\.\/stepUp"/);
  });
});

describe("review #4: focus (the static render cannot show focus — pinned in the source)", () => {
  const src = readFileSync(join(process.cwd(), "src", "components", "ui", "StepUpDialog.tsx"), "utf8");
  it("the code input autofocuses when the code phase mounts (the phone's one-time-code keyboard opens)", () => {
    expect(src).toContain("ref={ref} autoFocus");
    expect(html(S({ phase: "code" })).toLowerCase()).toMatch(/<input[^>]*data-stepup-code/);
  });
  it("after a wrong code the input takes focus again with its digits selected; when locked, focus goes to 'send again'", () => {
    expect(src).toContain("if (s.error && !disabled) { ref.current?.focus(); ref.current?.select(); }");
    expect(src).toContain("}, [s.error, disabled]);");
    expect(src).toContain("useEffect(() => { if (s.locked) resendRef.current?.focus(); }, [s.locked]);");
    expect(src).toContain('ref={resendRef} onClick={onSend}');
  });
});

