// PANEL-PAY א1 (החלטה 362): פעולות כסף דרך bloc — כל קוד של bloc הופך למשפט ברור בעברית; כשל שלא ידוע אם בוצע נרשם
// כ-unknown; השחקן תמיד מהסשן; רק עמודות המסלול חוזרות לדפדפן. הקודים — כמו ב-bloc (lib/panelMoney/common FailCode).
import { describe, it, expect } from "vitest";
import {
  moneyFailure, moneyOutcome, failureAudit, actorOf, planRow, firstIp, badShape, BAD_SHAPE_TEXT,
  READ_FAILED_TEXT, WRITE_FAILED_TEXT, FORBIDDEN_TEXT, INVALID_TEXT, UNEXPECTED_TEXT,
} from "../moneyActions";
import { GATE_HINT } from "../collectionProviders";

const f = (status: number, code?: string, error = code ?? "x") => ({ status, code, error });

describe("moneyFailure — bloc's codes in Hebrew", () => {
  it("503 read_failed: 'we could not check — nothing changed, try again' (the owner's sentence, never 'nothing found')", () => {
    expect(READ_FAILED_TEXT).toBe("לא הצלחנו לבדוק — שום דבר לא השתנה. נסו שוב.");
    for (const k of ["building_plan", "company_plan", "ai_credits", "collection_provider"] as const) {
      expect(moneyFailure(f(503, "read_failed"), k)).toEqual({ status: 503, code: "read_failed", error: READ_FAILED_TEXT });
      expect(moneyFailure(f(503, "write_failed"), k)).toEqual({ status: 503, code: "write_failed", error: WRITE_FAILED_TEXT });
      expect(moneyFailure(f(403, "forbidden"), k)).toEqual({ status: 403, code: "forbidden", error: FORBIDDEN_TEXT });
      expect(moneyFailure(f(400, "invalid"), k)).toEqual({ status: 400, code: "invalid", error: INVALID_TEXT });
    }
  });
  it("409 reasons per kind (every reason bloc sends has a sentence)", () => {
    const want: Array<[Parameters<typeof moneyFailure>[1], string, RegExp]> = [
      ["building_plan", "paying_subscription", /לבניין יש מנוי משלם פעיל/],
      ["building_plan", "company_covered", /כלול דרך חברת הניהול/],
      ["building_plan", "no_grant", /לבניין אין מסלול מוענק/],
      ["building_plan", "changed", /השתנה מאז שהדף נטען/],
      ["company_plan", "paying_subscription", /לחברה מנוי משלם פעיל/],
      ["company_plan", "company_not_active", /רק לחברה מאושרת/],
      ["company_plan", "no_grant", /לחברה אין מסלול מוענק/],
      ["company_plan", "changed", /השתנה מאז שהדף נטען/],
      ["collection_provider", "gate_open", /שסף ההפעלה שלו \(G14\) נסגר\.$/],
      ["collection_provider", "gate_already_closed", /כבר תועד כסגור/],
      ["collection_provider", "gate_reopen_while_offered", /קודם מכבים את הספק/],
      ["collection_provider", "gate_not_closed", /לא תועד כסגור/],
      ["collection_provider", "changed", /השתנה מאז שהדף נטען/],
    ];
    for (const [kind, code, re] of want) {
      const r = moneyFailure(f(409, code), kind);
      expect(r.status).toBe(409);
      expect(r.code).toBe(code);
      expect(r.error, `${kind} ${code}`).toMatch(re);
    }
  });
  it("gate_open is exactly the card's hint", () => {
    expect(moneyFailure(f(409, "gate_open"), "collection_provider").error).toBe(`${GATE_HINT}.`);
  });
  it("404 per kind; an unknown 409 keeps bloc's Hebrew sentence, or a generic one — never an English code", () => {
    expect(moneyFailure(f(404, "not_found"), "building_plan").error).toBe("הבניין לא נמצא, או שהוא בארכיון.");
    expect(moneyFailure(f(404, "not_found"), "company_plan").error).toBe("החברה לא נמצאה.");
    expect(moneyFailure(f(409, "brand_new", "משפט של bloc"), "ai_credits").error).toBe("משפט של bloc");
    expect(moneyFailure(f(409, "brand_new", "brand_new"), "ai_credits").error).toBe(UNEXPECTED_TEXT);
    expect(moneyFailure(f(500, "failed", "failed"), "building_plan")).toEqual({ status: 500, code: "failed", error: UNEXPECTED_TEXT });
  });
  it("connection codes from callBloc (not configured, Cloudflare, timeout, …) keep callBloc's Hebrew sentence and status", () => {
    const t = moneyFailure(f(504, "TIMEOUT", "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב."), "building_plan");
    expect(t).toEqual({ status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב." });
    expect(moneyFailure(f(502, "REJECTED", "bloc דחה את הבקשה"), "company_plan").error).toBe("bloc דחה את הבקשה");
  });
});

describe("moneyOutcome / failureAudit", () => {
  it("unknown = timeout / network / a 5xx without a known code; failed = refused or never reached", () => {
    expect(moneyOutcome(f(504, "TIMEOUT"))).toBe("unknown");
    expect(moneyOutcome(f(504, "NETWORK"))).toBe("unknown");
    expect(moneyOutcome(f(500, "failed"))).toBe("unknown");
    expect(moneyOutcome(f(502))).toBe("unknown");
    expect(moneyOutcome(f(409, "changed"))).toBe("failed");
    expect(moneyOutcome(f(503, "read_failed"))).toBe("failed");
    expect(moneyOutcome(f(503, "write_failed"))).toBe("failed");
    expect(moneyOutcome(f(503, "NOT_CONFIGURED"))).toBe("failed");
    expect(moneyOutcome(f(502, "REJECTED"))).toBe("failed");
  });
  it("the audit row names the attempted action and bloc's code", () => {
    expect(failureAudit(f(409, "no_grant"), "BUILDING_PLAN_GRANT_ENDED")).toEqual({
      name: "MONEY_ACTION_FAILED", meta: { action: "BUILDING_PLAN_GRANT_ENDED", outcome: "failed", code: "no_grant", status: 409 },
    });
    expect(failureAudit(f(504, "TIMEOUT"), "AI_CREDITS_GRANT").name).toBe("MONEY_ACTION_UNKNOWN");
  });
});

describe("actor, rows, ip", () => {
  it("the actor is exactly { id, email, role } — nothing else from the session goes to bloc (bloc's schema is strict)", () => {
    expect(actorOf({ id: "a", email: "e@x.co", role: "superadmin", full_name: "x", auth_level: "mfa" } as any)).toEqual({ id: "a", email: "e@x.co", role: "superadmin" });
  });
  it("planRow keeps only id / plan / plan_expires / comp_reason; a bad shape → null", () => {
    expect(planRow({ id: "b", plan: "tower", plan_expires: null, comp_reason: "x", invite_code: "B-1", payplus: "secret" }))
      .toEqual({ id: "b", plan: "tower", plan_expires: null, comp_reason: "x" });
    expect(planRow({ id: "b", plan: 5 })).toEqual({ id: "b", plan: null, plan_expires: null, comp_reason: null });
    expect(planRow(null)).toBeNull();
    expect(planRow({ plan: "tower" })).toBeNull();
  });
  it("firstIp", () => {
    expect(firstIp("1.1.1.1, 2.2.2.2")).toBe("1.1.1.1");
    expect(firstIp(null)).toBeUndefined();
  });
});

describe("badShape (review #6)", () => {
  it("a 2xx that is not bloc's answer: 502 bad_shape, 'may have happened — refresh', logged as MONEY_ACTION_UNKNOWN with the action", () => {
    expect(badShape("AI_CREDITS_GRANT")).toEqual({
      status: 502, code: "bad_shape", error: BAD_SHAPE_TEXT,
      audit: { name: "MONEY_ACTION_UNKNOWN", meta: { action: "AI_CREDITS_GRANT", outcome: "unknown", code: "bad_shape" } },
    });
    expect(BAD_SHAPE_TEXT).toContain("ייתכן שהפעולה בוצעה");
    expect(BAD_SHAPE_TEXT).toContain("רעננו");
  });
});

