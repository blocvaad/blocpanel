// PANEL-PAY א2 (החלטות 367–369): המסכים של ארכוב / השעיה / הפעלה, אימות ספק ובניין חדש — מרונדרים לשרת
// (renderToStaticMarkup; בפאנל אין happy-dom ואין testing-library). חלונות האישור אומרים שקוד מגיע אחר כך; חלון הקוד אומר
// מה מאשרים; כרטיס הספק — הפעולות, הסיבה, השגיאה עם "רענון"; בניין חדש — נפתח / ראש הוועד לא מונה / קוד ההצטרפות.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
import DeleteBuildingModal from "../DeleteBuildingModal";
import SuspendBuildingModal from "../SuspendBuildingModal";
import { StepUpDialogView, STEPUP_EXPLAIN } from "../StepUpDialog";
import { SupplierVerifyCardView, type Supplier, type SupplierCardViewProps } from "../SupplierVerifyCard";
import { NewBuildingNoticeView } from "../NewBuildingNotice";
import { NewBuildingFormView } from "../NewBuildingForm";
import { INITIAL_STEPUP } from "@/lib/stepUpClient";
import { STEP_UP_NOTE, STEP_UP_WHAT, CREATE_UNCLEAR_TEXT } from "@/lib/blocActionsUi";
import { FOUNDER_TEXT } from "@/lib/blocActions";

const html = (el: any) => renderToStaticMarkup(el);
// ── walk the element tree (hook-free views are called directly; clicks are real calls to their handlers) ──
type El = { type: any; props: any };
const kids = (n: any): any[] => (n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(kids) : [n]);
function find(n: any, pred: (e: El) => boolean, out: El[] = []): El[] {
  for (const k of kids(n)) if (typeof k === "object" && k.props) { if (pred(k)) out.push(k); find(k.props.children, pred, out); }
  return out;
}

describe("the confirmation dialogs say a code comes next (decision 369)", () => {
  it("archive: the step-up line, and the confirm stays closed until the name is typed", () => {
    const h = html(createElement(DeleteBuildingModal, { buildingName: "מגדלי הים", onConfirm: () => {}, onCancel: () => {} }));
    expect(h).toContain('data-stepup-note=""');
    expect(h).toContain(STEP_UP_NOTE);
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*העבר לארכיב/); // בלי הדגל s — היעד של הפאנל ES2017 (verify אצל הבעלים)
    expect(h.indexOf("data-stepup-note")).toBeLessThan(h.indexOf("העבר לארכיב"));
  });
  it("suspend and activate: the same line in both", () => {
    for (const isActive of [true, false]) {
      const h = html(createElement(SuspendBuildingModal, { buildingName: "מגדלי הים", isActive, onConfirm: () => {}, onCancel: () => {} }));
      expect(h).toContain(STEP_UP_NOTE);
      expect(h).toContain(isActive ? "השעיית בניין" : "הפעלת בניין");
    }
  });
});

describe("the code dialog says what is being confirmed", () => {
  it("with what: 'confirming now' + the action; the general explanation names the new actions", () => {
    const h = html(createElement(StepUpDialogView, { state: INITIAL_STEPUP, what: STEP_UP_WHAT.archive("מגדלי הים") }));
    expect(h).toContain("אישור פעולה רגישה");
    expect(h).toContain('data-stepup-what=""');
    expect(h).toContain("מאשרים עכשיו");
    expect(h).toContain("העברה לארכיון: &quot;מגדלי הים&quot;");
    expect(STEPUP_EXPLAIN).toContain("השעיה או ארכוב של בניין");
    expect(STEPUP_EXPLAIN).toContain("אימות ספק");
    expect(h).toContain(STEPUP_EXPLAIN);
  });
  it("without what (the money cards of א1): no 'confirming now' block", () => {
    const h = html(createElement(StepUpDialogView, { state: INITIAL_STEPUP }));
    expect(h).not.toContain("data-stepup-what");
    expect(h).toContain(STEPUP_EXPLAIN);
  });
  it("the code phase keeps the line", () => {
    const h = html(createElement(StepUpDialogView, { state: { ...INITIAL_STEPUP, phase: "code", sentTo: "t•••@bloc.co.il" }, what: STEP_UP_WHAT.verify("אינסטלציה כהן") }));
    expect(h).toContain("אימות הספק &quot;אינסטלציה כהן&quot;");
    expect(h).toContain('data-stepup-code=""');
  });
});

const PENDING: Supplier = {
  id: "s1", business_name: "אינסטלציה כהן", category: "אינסטלציה", phone: "050-1234567", email: null, verification_status: "pending",
  business_license_number: "514233778", professional_license_url: null, verification_rejection_reason: null, verified_at: null,
  rating: 4.6, rating_count: 12, created_at: "2026-11-01T10:00:00Z", open_disputes: 0,
};
const card = (over: Partial<SupplierCardViewProps> = {}) => ({ s: PENDING, canVerify: true, mode: null, reason: "", busy: false, notice: null, ...over }) as SupplierCardViewProps;

describe("the supplier card", () => {
  it("pending: verify / reject, the step-up line; no reason box yet", () => {
    const h = html(createElement(SupplierVerifyCardView, card()));
    expect(h).toContain('data-supplier-card="pending"');
    expect(h).toContain(">אמת ספק<");
    expect(h).toContain(">דחה<");
    expect(h).not.toContain("הסר אימות");
    expect(h).toContain('data-stepup-note=""');
    expect(h).toContain("מאושרים בקוד חד-פעמי מהמייל");
    expect(h).not.toContain("data-supplier-reason");
  });
  it("reject mode: the reason box; the confirm stays closed below 3 characters", () => {
    const h = html(createElement(SupplierVerifyCardView, card({ mode: "reject", reason: "אב" })));
    expect(h).toContain('data-supplier-reason=""');
    expect(h).toMatch(/data-supplier-confirm="reject"[^>]*disabled=""|disabled=""[^>]*data-supplier-confirm="reject"/);
    const ok = html(createElement(SupplierVerifyCardView, card({ mode: "reject", reason: "תעודה לא קריאה" })));
    expect(ok).not.toMatch(/data-supplier-confirm="reject"[^>]*disabled=""|disabled=""[^>]*data-supplier-confirm="reject"/);
    expect(ok).toContain("אישור דחייה");
  });
  it("verified: only 'remove verification'; rejected: verify again", () => {
    const v = html(createElement(SupplierVerifyCardView, card({ s: { ...PENDING, verification_status: "verified" } })));
    expect(v).toContain("הסר אימות");
    expect(v).not.toContain(">אמת ספק<");
    expect(v).not.toContain('data-supplier-act="reject"');   // reject is for a pending request only
    const r = html(createElement(SupplierVerifyCardView, card({ s: { ...PENDING, verification_status: "rejected", verification_rejection_reason: "תעודה פגה" } })));
    expect(r).toContain(">אמת ספק<");
    expect(r).toContain("סיבת דחייה: תעודה פגה");
  });
  it("no permission (viewer): no actions, no step-up line", () => {
    const h = html(createElement(SupplierVerifyCardView, card({ canVerify: false })));
    expect(h).not.toContain("data-supplier-act");
    expect(h).not.toContain("data-stepup-note");
  });
  it("an error that may have happened / changed → the sentence + 'רענון'; a plain error → the sentence alone", () => {
    const r = html(createElement(SupplierVerifyCardView, card({ notice: { tone: "error", text: "מצב האימות של הספק השתנה מאז שהדף נטען.", refresh: true }, onRefresh: () => {} })));
    expect(r).toContain('data-supplier-error="refresh"');
    expect(r).toContain('data-supplier-refresh=""');
    const p = html(createElement(SupplierVerifyCardView, card({ notice: { tone: "error", text: "הפעולה לא בוצעה: לא אושר קוד חד-פעמי. אפשר לנסות שוב.", refresh: false }, onRefresh: () => {} })));
    expect(p).toContain('data-supplier-error="plain"');
    expect(p).not.toContain("data-supplier-refresh");
    expect(p).toContain('role="alert"');
  });
  it("busy: the buttons are closed and the label says it is sending", () => {
    const h = html(createElement(SupplierVerifyCardView, card({ busy: true })));
    expect(h).toContain("שולחים…");
    expect(h).toMatch(/data-supplier-act="verify"[^>]*disabled=""|disabled=""[^>]*data-supplier-act="verify"/);
  });
  it("clicks are real calls: verify → onAct('verify'); reject → onMode('reject'); confirm → onAct(mode); refresh → onRefresh", () => {
    const seen: string[] = [];
    const base = card({ onAct: (a) => seen.push(`act:${a}`), onMode: (m) => seen.push(`mode:${m}`), onRefresh: () => seen.push("refresh") });
    const t1: any = SupplierVerifyCardView(base);
    find(t1, (e) => e.props["data-supplier-act"] === "verify")[0].props.onClick();
    find(t1, (e) => e.props["data-supplier-act"] === "reject")[0].props.onClick();
    const t2: any = SupplierVerifyCardView({ ...base, mode: "reject", reason: "תעודה לא קריאה", notice: { tone: "error", text: "x", refresh: true } });
    find(t2, (e) => e.props["data-supplier-confirm"] === "reject")[0].props.onClick();
    find(t2, (e) => "data-supplier-refresh" in e.props)[0].props.onClick();
    expect(seen).toEqual(["act:verify", "mode:reject", "act:reject", "refresh"]);
  });
});

describe("new building — what happened after 'צור בניין'", () => {
  const FAILED = { kind: "founder_failed" as const, id: "b1", name: "השקד 104", inviteCode: "B-4K2Q9X", message: FOUNDER_TEXT.NO_USER };
  it("created, the head was not appointed: the track (opened ✓ / not appointed !), why, the invite code, the building link", () => {
    const h = html(createElement(NewBuildingNoticeView, { outcome: FAILED }));
    expect(h).toContain('data-new-building-founder="failed"');
    expect(h).toContain("הבניין נפתח");
    expect(h).toContain("&quot;השקד 104&quot;");
    expect(h).toContain("ראש הוועד לא מונה");
    expect(h).toContain(FOUNDER_TEXT.NO_USER);
    expect(h).toContain('data-new-building-invite=""');
    expect(h).toContain(">B-4K2Q9X<");
    expect(h).toContain('href="/buildings/b1"');
    expect(h.indexOf("הבניין נפתח")).toBeLessThan(h.indexOf("ראש הוועד לא מונה"));
  });
  it("no invite code in the answer → no code box", () => {
    expect(html(createElement(NewBuildingNoticeView, { outcome: { ...FAILED, inviteCode: null } }))).not.toContain("data-new-building-invite");
  });
  it("unclear → 'maybe it was created' + a link to the list; a plain error → no link", () => {
    const u = html(createElement(NewBuildingNoticeView, { outcome: { kind: "error", text: CREATE_UNCLEAR_TEXT, unclear: true } }));
    expect(u).toContain('data-new-building-error="unclear"');
    expect(u).toContain("ייתכן שהבניין נוצר");
    expect(u).toContain('href="/buildings"');
    const p = html(createElement(NewBuildingNoticeView, { outcome: { kind: "error", text: "bloc סירב", unclear: false } }));
    expect(p).toContain('data-new-building-error="plain"');
    expect(p).not.toContain('href="/buildings"');
  });
  it("the form, step 2, after the building opened: the notice and no second 'צור בניין'", () => {
    const form = { name: "השקד 104", address: "", max_tenants: "50", admin_email: "dana@example.com" };
    const h = html(createElement(NewBuildingFormView, { form, step: 2, loading: false, outcome: FAILED }));
    expect(h).toContain('data-new-building-founder="failed"');
    expect(h).not.toContain(">צור בניין<");
    const e = html(createElement(NewBuildingFormView, { form, step: 2, loading: false, outcome: { kind: "error", text: "bloc סירב", unclear: false } }));
    expect(e).toContain(">צור בניין<");
    expect(e).toContain("bloc סירב");
    const first = html(createElement(NewBuildingFormView, { form, step: 1, loading: false, outcome: null }));
    expect(first).toContain("פרטי הבניין");
    expect(first).not.toContain("data-new-building");
  });
});
