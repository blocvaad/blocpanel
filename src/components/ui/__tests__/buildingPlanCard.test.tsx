// PANEL-PAY א1 (החלטה 363): כרטיס "מסלול בלי חיוב" בדף הבניין — מרונדר לשרת (renderToStaticMarkup), כמו שאר בדיקות
// הכרטיסים בפאנל (בפאנל אין happy-dom ואין testing-library). כל מצב: אין הענקה / מוענק / אישור סיום / בלי תיעוד / מנוי
// משלם / חברת ניהול / כשלי טעינה / צופה / הודעות. הלוגיקה עצמה — lib/buildingPlan (בדיקה נפרדת).
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
import BuildingPlanCard, { BuildingPlanView, defaultGrantPlan, type BuildingPlanViewProps } from "../BuildingPlanCard";
import { FACTS_ERROR_TEXT, ORIGIN_ERROR_TEXT, ORIGIN_UNKNOWN_TEXT, HISTORY_ERROR_TEXT, VIEW_ONLY_TEXT } from "@/lib/buildingPlan";

const FREE = { plan: "free", compReason: null, planExpires: null };
const GRANTED = { plan: "tower", compReason: "בניין בדיקות של הצוות", planExpires: null };
const OK_FACTS = { state: "ok" as const, payingStatus: null, companyState: null, companyName: null };
const base: BuildingPlanViewProps = {
  info: FREE, facts: OK_FACTS, origin: { state: "ok", who: null, at: null }, history: { state: "ok", events: [] },
  canAct: true, plan: "tower", reason: "", reasonError: null, confirmEnd: false, busy: null, msg: null,
};
const html = (o: Partial<BuildingPlanViewProps> = {}) => renderToStaticMarkup(createElement(BuildingPlanView, { ...base, ...o }));
const tag = (h: string, attr: string) => { const m = h.match(new RegExp(`<[a-z]+[^>]*${attr}[^>]*>`)); return m ? m[0] : null; };
const disabled = (t: string | null) => !!t && /\sdisabled(=""|\s|>)/.test(t);

describe("no grant (free) — the grant form", () => {
  it("mode none: the tag, the line, four plans (not 'no plan'), Pro chosen by default, a reason field — no end button", () => {
    const h = html();
    expect(h).toContain('data-plan-mode="none"');
    expect(h).toContain("ללא מסלול");
    expect(h).toContain("לבניין אין מסלול כרגע.");
    expect(h).toContain("במקום ₪199 לחודש");
    for (const p of ["building", "large", "tower", "company"]) expect(h).toContain(`data-plan-option="${p}"`);
    expect(h).not.toContain('data-plan-option="free"');
    expect(tag(h, 'data-plan-option="tower"')).toContain('aria-checked="true"');
    expect(tag(h, 'data-plan-option="large"')).toContain('aria-checked="false"');
    expect(h).toContain("data-plan-reason-input");
    expect(h).not.toContain("data-plan-end=");
    expect(h).not.toContain("data-plan-current");
  });
  it("the grant button is closed until there is a reason (3+), then names the plan", () => {
    expect(disabled(tag(html(), "data-plan-grant="))).toBe(true);
    const h = html({ reason: "פיילוט עד מרץ" });
    expect(disabled(tag(h, "data-plan-grant="))).toBe(false);
    expect(h).toContain("הענקת Pro בלי חיוב");
  });
  it("busy: 'מעניקים…', the button and the fields are disabled", () => {
    const h = html({ reason: "פיילוט", busy: "grant" });
    expect(h).toContain("מעניקים…");
    expect(disabled(tag(h, "data-plan-grant="))).toBe(true);
    expect(disabled(tag(h, "data-plan-reason-input"))).toBe(true);
  });
  it("a reason error is shown under the field (alert)", () => {
    const h = html({ reasonError: "כתבו סיבה (3 תווים לפחות, למשל: בניין בדיקות, פיילוט)." });
    expect(h).toContain('data-plan-reason-error=""');
    expect(h).toContain('role="alert"');
  });
});

describe("granted", () => {
  const g = (o: Partial<BuildingPlanViewProps> = {}) => html({ info: GRANTED, origin: { state: "ok", who: "tal@bloc.co.il", at: "2026-11-12T08:00:00Z" }, ...o });
  it("the current plan, the reason and who granted (with the date) — and an end button, no grant form", () => {
    const h = g();
    expect(h).toContain('data-plan-mode="granted"');
    expect(h).toContain('data-plan-name="">Pro<');
    expect(h).toContain("בניין בדיקות של הצוות");
    expect(h).toContain('data-plan-origin="known"');
    expect(h).toContain("tal@bloc.co.il");
    expect(h).toContain("12.11.2026");
    expect(h).toContain("data-plan-end=");
    expect(h).not.toContain("data-plan-grant-form");
  });
  it("end confirmation: what happens (back to 'no plan' at once, no charge or refund), go / cancel — the end button hides", () => {
    const h = g({ confirmEnd: true });
    expect(h).toContain('role="alertdialog"');
    expect(h).toContain("לסיים את מסלול Pro?");
    expect(h).toContain("הבניין יחזור מיד ל&quot;ללא מסלול&quot;");
    expect(h).toContain("אין כאן חיוב או החזר");
    expect(h).toContain("data-plan-end-go");
    expect(h).toContain("data-plan-end-cancel");
    expect(h).not.toContain("data-plan-end=");
    expect(g({ confirmEnd: true, busy: "end_grant" })).toContain("מסיימים…");
  });
  it("who granted: failed to load → said so (not empty); not in the log → said so", () => {
    expect(g({ origin: { state: "error" } })).toContain(ORIGIN_ERROR_TEXT);
    expect(g({ origin: { state: "ok", who: null, at: null } })).toContain(ORIGIN_UNKNOWN_TEXT);
  });
  it("history: grants and ends with who and when; failed to load → said so", () => {
    const h = g({ history: { state: "ok", events: [
      { kind: "granted", plan: "tower", reason: "בניין בדיקות של הצוות", who: "tal@bloc.co.il", at: "2026-11-12T08:00:00Z" },
      { kind: "ended", plan: null, reason: null, who: "ops@bloc.co.il", at: "2026-10-01T08:00:00Z" },
      { kind: "legacy", plan: "large", reason: "פיילוט", who: "ops@bloc.co.il", at: "2026-09-01T08:00:00Z" },
    ] } });
    expect(h).toContain('data-plan-event="granted"');
    expect(h).toContain('data-plan-event="ended"');
    expect(h).toContain("נקבע בטופס העריכה · Plus");
    expect(g({ history: { state: "error" } })).toContain(HISTORY_ERROR_TEXT);
  });
});

describe("other states", () => {
  it("undocumented (a plan without a reason): 'no documented reason', the form preselects it ('document … as granted'); no end button until documented (bloc: 409 no_grant)", () => {
    const info = { plan: "large", compReason: null, planExpires: null };
    const h = html({ info, plan: defaultGrantPlan(info), reason: "פיילוט ישן" });
    expect(h).toContain('data-plan-mode="undocumented"');
    expect(h).toContain("אין סיבה מתועדת");
    expect(h).toContain("תיעוד Plus כמסלול מוענק");
    expect(h).not.toContain("data-plan-end=");
    expect(h).toContain("אחרי התיעוד אפשר גם לסיים אותו");
    expect(defaultGrantPlan(FREE)).toBe("tower");
  });
  it("paying subscription: the line says the plan follows the subscription; no form, no end", () => {
    const h = html({ info: GRANTED, facts: { ...OK_FACTS, payingStatus: "active" } });
    expect(h).toContain('data-plan-mode="paying"');
    expect(h).toContain("מנוי משלם (פעיל)");
    expect(h).not.toContain("data-plan-grant-form");
    expect(h).not.toContain("data-plan-end=");
  });
  it("covered by the management company: names it; no form", () => {
    const h = html({ facts: { ...OK_FACTS, companyState: "active", companyName: "נווה ניהול" } });
    expect(h).toContain('data-plan-mode="company"');
    expect(h).toContain("נווה ניהול");
    expect(h).not.toContain("data-plan-grant-form");
  });
  it("the subscription facts failed to load: a warning (never 'no subscription'), the form still works by the stored plan", () => {
    const h = html({ facts: { state: "error" } });
    expect(h).toContain('data-plan-facts-error=""');
    expect(h).toContain(FACTS_ERROR_TEXT);
    expect(h).toContain("data-plan-grant-form");
  });
  it("not a superadmin: the plan is visible, no buttons, the reason why", () => {
    const h = html({ info: GRANTED, canAct: false });
    expect(h).toContain(VIEW_ONLY_TEXT);
    expect(h).not.toContain("data-plan-grant");
    expect(h).not.toContain("data-plan-end");
  });
  it("messages: success (status) / error (alert); 'changed' offers a refresh", () => {
    expect(html({ msg: { ok: true, text: "מסלול Pro הוענק לבניין, בלי חיוב." } })).toContain('data-plan-msg="ok"');
    const e = html({ msg: { ok: false, text: "המסלול של הבניין השתנה מאז שהדף נטען.", code: "changed" }, onRefresh: () => {} });
    expect(e).toContain('data-plan-msg="error"');
    expect(e).toContain('role="alert"');
    expect(e).toContain("data-plan-refresh");
    expect(html({ msg: { ok: false, text: "x", code: "read_failed" }, onRefresh: () => {} })).not.toContain("data-plan-refresh");
  });
});

describe("the stateful card", () => {
  it("renders the same markup as the view for its first state", () => {
    const h = renderToStaticMarkup(createElement(BuildingPlanCard, { buildingId: "b1", info: FREE, facts: OK_FACTS, origin: { state: "ok", who: null, at: null }, history: { state: "ok", events: [] }, canAct: true }));
    expect(h).toContain('data-plan-mode="none"');
    expect(tag(h, 'data-plan-option="tower"')).toContain('aria-checked="true"');
  });
  it("wiring: posts the lib bodies to /api/buildings/<id>/plan through stepUpFetch (the code dialog), refreshes after success", () => {
    const src = readFileSync(join(process.cwd(), "src", "components", "ui", "BuildingPlanCard.tsx"), "utf8");
    expect(src).toContain("await stepUpFetch(`/api/buildings/${buildingId}/plan`");
    expect(src).toContain("body = grantBody(plan, c.value, info.plan);");
    expect(src).toContain("body = endBody(info.plan);");
    expect(src).toContain("if (o.msg.ok) router.refresh();");
    expect(src).not.toMatch(/fetch\("\/api\/buildings\/[^"]*",/);
  });
});

// ── review fixes (#1 dated plans, #3 company + grant, #4 focus / Escape, #6 refresh on bad_shape) ──
describe("review #1: a plan with an end date is not 'undocumented' and offers no 'document'", () => {
  const T0 = Date.parse("2026-11-15T10:00:00Z");
  const DAY = 86_400_000;
  const at = (days: number) => new Date(T0 + days * DAY).toISOString();
  const trial = { plan: "tower", compReason: null, planExpires: at(12) };
  const trialFacts = { ...OK_FACTS, subscriptionStatus: "trial" };
  const d = (o: Partial<BuildingPlanViewProps>) => html({ now: T0, plan: "tower", ...o });
  it("trial row: the plan, the date in words, 'trial' — no 'בלי תיעוד', no 'תיעוד', no 'בלי תפוגה', no open form", () => {
    const h = d({ info: trial, facts: trialFacts });
    expect(h).toContain('data-plan-mode="dated"');
    expect(h).toContain('data-plan-dated="trial"');
    expect(h).toContain("ניסיון");
    expect(h).toContain(`עד ${new Date(T0 + 12 * DAY).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "long", year: "numeric" })}`);
    expect(h).toContain("12 ימים לסיום");
    expect(h).not.toContain("בלי תיעוד");
    expect(h).not.toContain("תיעוד ");
    expect(h).not.toContain("בלי תפוגה");
    expect(h).not.toContain("data-plan-grant-form");
    expect(h).not.toContain("data-plan-end=");
    expect(h).toContain("data-plan-grant-open");
  });
  it("the explicit grant: a warning that the end date is removed, and a button that says so — plus 'keep the date'", () => {
    const h = d({ info: trial, facts: trialFacts, grantOpen: true, reason: "פיילוט ארוך" });
    expect(h).toContain('data-plan-grant-form="dated"');
    expect(h).toContain('data-plan-dated-warning=""');
    expect(h).toContain("ההענקה מוחקת את תאריך הסיום");
    expect(h).toContain("הענקת Pro בלי חיוב — בלי תאריך סיום");
    expect(h).toContain("ביטול — להשאיר את התאריך");
    expect(h).not.toContain("data-plan-grant-open");
  });
  it("dormant and grace rows: 'פג ב-…', rest / read-only — and still no 'תיעוד'", () => {
    const dormant = d({ info: { plan: "large", compReason: null, planExpires: at(-40) }, facts: trialFacts });
    expect(dormant).toContain('data-plan-dated="dormant"');
    expect(dormant).toContain("רדום");
    expect(dormant).toContain("פג ב-");
    expect(dormant).not.toContain("תיעוד ");
    const grace = d({ info: { plan: "large", compReason: null, planExpires: at(-3) }, facts: trialFacts });
    expect(grace).toContain('data-plan-dated="grace"');
    expect(grace).toContain("ימי חסד עד");
  });
  it("cancelled-but-paid row: 'בוטל — בתוקף עד הסוף', paid until the date", () => {
    const h = d({ info: { plan: "large", compReason: null, planExpires: at(20) }, facts: { ...OK_FACTS, subscriptionStatus: "canceled" } });
    expect(h).toContain('data-plan-dated="canceled"');
    expect(h).toContain("בוטל — בתוקף עד הסוף");
    expect(h).toContain("המנוי בוטל — Plus שולם עד");
  });
  it("facts not loaded: a neutral 'plan with an end date' (with the date)", () => {
    const h = d({ info: trial, facts: { state: "error" } });
    expect(h).toContain('data-plan-dated="unknown"');
    expect(h).toContain("מסלול עם תאריך סיום");
  });
  it("plan_expires is shown wherever a plan is shown: a grant that has a date says 'עד …', not 'בלי תפוגה'", () => {
    const h = d({ info: { plan: "tower", compReason: "פיילוט", planExpires: at(30) } });
    expect(h).toContain('data-plan-mode="granted"');
    expect(h).toContain(`data-plan-until="${at(30)}"`);
    expect(h).not.toContain("בלי תפוגה");
    expect(d({ info: GRANTED })).toContain("בלי תפוגה");
  });
});

describe("review #3: company coverage keeps an existing grant visible and endable", () => {
  it("company mode + comp_reason: the grant, who granted, the line, and the end button", () => {
    const h = html({ info: GRANTED, facts: { ...OK_FACTS, companyState: "active", companyName: "נווה ניהול" }, origin: { state: "ok", who: "tal@bloc.co.il", at: "2026-10-01T08:00:00Z" } });
    expect(h).toContain('data-plan-mode="company"');
    expect(h).toContain("data-plan-current");
    expect(h).toContain("בניין בדיקות של הצוות");
    expect(h).toContain("אפשר לסיים אותה");
    expect(h).toContain("data-plan-end=");
  });
  it("paying + comp_reason: the grant is shown, but no end (bloc: 409 paying_subscription)", () => {
    const h = html({ info: GRANTED, facts: { ...OK_FACTS, payingStatus: "active" } });
    expect(h).toContain("data-plan-current");
    expect(h).not.toContain("data-plan-end=");
  });
});

describe("review #4 / #6: focus, Escape, refresh", () => {
  const src = readFileSync(join(process.cwd(), "src", "components", "ui", "BuildingPlanCard.tsx"), "utf8");
  it("the end confirmation takes focus on its confirm button and closes on Escape (not while sending); focus returns to the end button", () => {
    expect(src).toContain("useEffect(() => { goRef.current?.focus(); }, []);");
    expect(src).toContain('ref={goRef} onClick={p.onEnd}');
    expect(src).toContain("onKeyDown={(e) => { if (escapeCloses(e.key, busy)) { e.stopPropagation(); p.onCloseEnd?.(); } }}");
    expect(src).toContain("if (wasOpen.current && !p.confirmEnd) endRef.current?.focus();");
    expect(src).toContain("ref={endRef} onClick={p.onOpenEnd}");
  });
  it("'bloc answered strangely' (bad_shape) and a timeout offer a refresh", () => {
    for (const code of ["bad_shape", "TIMEOUT"]) {
      expect(html({ info: GRANTED, msg: { ok: false, text: "ייתכן שבוצע", code }, onRefresh: () => {} })).toContain("data-plan-refresh");
    }
  });
});

