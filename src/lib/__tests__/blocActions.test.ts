// PANEL-PAY א2 (החלטות 367–369): בניין ואימות ספק דרך bloc — כל קוד של bloc הופך למשפט ברור בעברית לפי הפעולה; כשל שלא
// ידוע אם בוצע נרשם BLOC_ACTION_UNKNOWN; הצלחה רק עם השורה שחוזרת; ראש ועד שלא מונה — אף פעם לא "מונה"; 409
// live_subscription של bloc — אותו חלון אישור כמו קודם. הקודים — כמו ב-bloc (lib/panelMoney/common FailCode).
import { describe, it, expect } from "vitest";
import {
  blocActionFailure, actionFailureAudit, actionBadShape, buildingRow, activeRow, archiveAnswer, supplierRow, stopTaskOf,
  founderOutcome, liveConflictOf, FORBIDDEN_TEXT, NOT_FOUND_TEXT, CONFLICT_TEXT, LIVE_FORBIDDEN_TEXT, FOUNDER_TEXT,
  FOUNDER_FAILED_TEXT, FOUNDER_SKIPPED_TEXT, FOUNDER_UNKNOWN_TEXT, type BlocActionKind,
} from "../blocActions";
import { READ_FAILED_TEXT, WRITE_FAILED_TEXT, INVALID_TEXT, UNEXPECTED_TEXT, BAD_SHAPE_TEXT } from "../moneyActions";

const KINDS: BlocActionKind[] = ["building_create", "building_update", "building_active", "building_archive", "supplier"];
const f = (status: number, code?: string, error = code ?? "x") => ({ status, code, error });
const he = /[א-ת]/;

describe("blocActionFailure — bloc's codes in Hebrew, per action", () => {
  it("503 read_failed / write_failed: nothing changed (the same sentences as the money actions)", () => {
    for (const k of KINDS) {
      expect(blocActionFailure(f(503, "read_failed"), k)).toEqual({ status: 503, code: "read_failed", error: READ_FAILED_TEXT });
      expect(blocActionFailure(f(503, "write_failed"), k)).toEqual({ status: 503, code: "write_failed", error: WRITE_FAILED_TEXT });
    }
  });
  it("403 forbidden says who may do it — archive is super-admin only, the rest admin and super-admin", () => {
    for (const k of KINDS) expect(blocActionFailure(f(403, "forbidden"), k)).toEqual({ status: 403, code: "forbidden", error: FORBIDDEN_TEXT[k] });
    expect(FORBIDDEN_TEXT.building_archive).toContain("לסופר-אדמין בלבד");
    expect(FORBIDDEN_TEXT.building_update).toContain("למנהלים ולסופר-אדמין");
    expect(FORBIDDEN_TEXT.supplier).toContain("אימות ספקים");
    expect(blocActionFailure(f(403), "building_active")).toEqual({ status: 403, code: "forbidden", error: FORBIDDEN_TEXT.building_active });
  });
  it("403 live_subscription_forbidden: confirming a paying building's suspension is for billing (super-admin)", () => {
    expect(blocActionFailure(f(403, "live_subscription_forbidden"), "building_active"))
      .toEqual({ status: 403, code: "live_subscription_forbidden", error: LIVE_FORBIDDEN_TEXT });
    expect(LIVE_FORBIDDEN_TEXT).toContain("רק למי שמנהל חיובים");
  });
  it("404 per kind", () => {
    expect(blocActionFailure(f(404, "not_found"), "building_active").error).toBe("הבניין לא נמצא, או שהוא בארכיון.");
    expect(blocActionFailure(f(404, "not_found"), "building_update").error).toBe("הבניין לא נמצא, או שהוא בארכיון.");
    expect(blocActionFailure(f(404, "not_found"), "building_archive").error).toBe("הבניין לא נמצא.");
    expect(blocActionFailure(f(404, "not_found"), "supplier").error).toBe("הספק לא נמצא.");
    for (const k of KINDS) expect(blocActionFailure(f(404), k)).toEqual({ status: 404, code: "not_found", error: NOT_FOUND_TEXT[k] });
  });
  it("409 reasons: archived and changed per kind", () => {
    const want: Array<[BlocActionKind, string, RegExp]> = [
      ["building_active", "archived", /בארכיון — אי אפשר להשעות או להפעיל/],
      ["building_update", "archived", /בארכיון — אי אפשר לערוך/],
      ["building_archive", "archived", /כבר בארכיון/],
      ["building_active", "changed", /השתנה מאז שהדף נטען/],
      ["building_update", "changed", /השתנה מאז שהדף נטען/],
      ["building_archive", "changed", /השתנה מאז שהדף נטען/],
      ["supplier", "changed", /מצב האימות של הספק השתנה/],
    ];
    for (const [kind, code, re] of want) {
      const r = blocActionFailure(f(409, code), kind);
      expect(r.status).toBe(409);
      expect(r.code).toBe(code);
      expect(r.error, `${kind} ${code}`).toMatch(re);
      expect(r.error).toBe(CONFLICT_TEXT[kind][code]);
    }
  });
  it("an unknown 409 keeps bloc's Hebrew sentence, or a generic one — never an English code; no code → 'conflict'", () => {
    expect(blocActionFailure(f(409, "brand_new", "משפט של bloc"), "supplier").error).toBe("משפט של bloc");
    expect(blocActionFailure(f(409, "brand_new", "brand_new"), "supplier").error).toBe(UNEXPECTED_TEXT);
    expect(blocActionFailure(f(409, undefined, "x"), "building_active")).toEqual({ status: 409, code: "conflict", error: UNEXPECTED_TEXT });
  });
  it("400 invalid: bloc's Hebrew if any, else the generic sentence", () => {
    expect(blocActionFailure(f(400, "invalid"), "building_create")).toEqual({ status: 400, code: "invalid", error: INVALID_TEXT });
    expect(blocActionFailure(f(400, "invalid", "שם חובה"), "building_create").error).toBe("שם חובה");
    expect(blocActionFailure(f(400, undefined, "bad"), "supplier")).toEqual({ status: 400, code: "invalid", error: INVALID_TEXT });
  });
  it("500 failed / anything else → the generic Hebrew sentence; a 2xx never passes as a failure status", () => {
    expect(blocActionFailure(f(500, "failed"), "building_archive")).toEqual({ status: 500, code: "failed", error: UNEXPECTED_TEXT });
    expect(blocActionFailure(f(502, undefined, "upstream"), "supplier")).toEqual({ status: 502, code: "failed", error: UNEXPECTED_TEXT });
    expect(blocActionFailure(f(200, undefined, "x"), "supplier").status).toBe(502);
  });
  it("callBloc's connection codes keep callBloc's sentence and status (they say what to fix)", () => {
    const t = blocActionFailure(f(504, "TIMEOUT", "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב."), "building_archive");
    expect(t).toEqual({ status: 504, code: "TIMEOUT", error: "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב." });
    for (const code of ["NOT_CONFIGURED", "SELF_URL", "REDIRECT", "EDGE_BLOCKED", "ORIGIN_PROTECTED", "OLD_BLOC", "UPSTREAM_401", "REJECTED", "NETWORK"]) {
      expect(blocActionFailure(f(502, code, "משפט החיבור"), "supplier")).toEqual({ status: 502, code, error: "משפט החיבור" });
    }
    // as written by callBloc even when it names a setting without Hebrew around it (it says what to fix) — never "unexpected"
    expect(blocActionFailure(f(503, "NOT_CONFIGURED", "BLOC_APP_URL / PANEL_ACTION_SECRET"), "building_archive"))
      .toEqual({ status: 503, code: "NOT_CONFIGURED", error: "BLOC_APP_URL / PANEL_ACTION_SECRET" });
  });
  it("a 403 with a code bloc may add later keeps that code (the text is the action's)", () => {
    expect(blocActionFailure(f(403, "not_staff"), "supplier")).toEqual({ status: 403, code: "not_staff", error: FORBIDDEN_TEXT.supplier });
  });
  it("every sentence is Hebrew", () => {
    for (const k of KINDS) {
      expect(FORBIDDEN_TEXT[k]).toMatch(he);
      expect(NOT_FOUND_TEXT[k]).toMatch(he);
      for (const t of Object.values(CONFLICT_TEXT[k])) expect(t).toMatch(he);
    }
  });
});

describe("the panel log of a failure", () => {
  it("rejected / never reached bloc → BLOC_ACTION_FAILED; timeout / network / 5xx without a known code → BLOC_ACTION_UNKNOWN", () => {
    expect(actionFailureAudit({ status: 409, code: "changed" }, "SUPPLIER_VERIFY"))
      .toEqual({ name: "BLOC_ACTION_FAILED", meta: { action: "SUPPLIER_VERIFY", outcome: "failed", code: "changed", status: 409 } });
    expect(actionFailureAudit({ status: 503, code: "write_failed" }, "ARCHIVE_BUILDING").name).toBe("BLOC_ACTION_FAILED");
    expect(actionFailureAudit({ status: 502, code: "REJECTED" }, "ARCHIVE_BUILDING").name).toBe("BLOC_ACTION_FAILED");
    expect(actionFailureAudit({ status: 504, code: "TIMEOUT" }, "CREATE_BUILDING"))
      .toEqual({ name: "BLOC_ACTION_UNKNOWN", meta: { action: "CREATE_BUILDING", outcome: "unknown", code: "TIMEOUT", status: 504 } });
    expect(actionFailureAudit({ status: 504, code: "NETWORK" }, "CREATE_BUILDING").name).toBe("BLOC_ACTION_UNKNOWN");
    expect(actionFailureAudit({ status: 500, code: "failed" }, "SUSPEND_BUILDING").name).toBe("BLOC_ACTION_UNKNOWN");
    expect(actionFailureAudit({ status: 500 }, "SUSPEND_BUILDING").meta.code).toBeNull();
  });
  it("a 2xx that is not bloc's answer → 502 bad_shape, 'maybe it happened — refresh', logged as unknown", () => {
    expect(actionBadShape("ARCHIVE_BUILDING")).toEqual({
      status: 502, code: "bad_shape", error: BAD_SHAPE_TEXT,
      audit: { name: "BLOC_ACTION_UNKNOWN", meta: { action: "ARCHIVE_BUILDING", outcome: "unknown", code: "bad_shape" } },
    });
    expect(BAD_SHAPE_TEXT).toContain("ייתכן שהפעולה בוצעה");
  });
});

describe("what bloc returns — only these fields go on", () => {
  it("buildingRow: id + name required; the rest typed or null; extra columns dropped", () => {
    expect(buildingRow({ id: "b1", name: "השקד 104", address: "חולון", max_tenants: 40, is_active: true, invite_code: "B-1A2B3C", plan: "tower", meshulam_api_key: "k" }))
      .toEqual({ id: "b1", name: "השקד 104", address: "חולון", max_tenants: 40, is_active: true, invite_code: "B-1A2B3C" });
    expect(buildingRow({ id: "b1", name: "x" })).toEqual({ id: "b1", name: "x", address: null, max_tenants: null, is_active: null, invite_code: null });
    expect(buildingRow({ id: "b1", name: "x", max_tenants: "40", is_active: "yes" })).toMatchObject({ max_tenants: null, is_active: null });
    for (const bad of [null, undefined, "b1", [], {}, { id: "b1" }, { name: "x" }, { id: "", name: "x" }, { id: 7, name: "x" }]) expect(buildingRow(bad)).toBeNull();
  });
  it("activeRow: the row only when it is in the state that was asked for", () => {
    expect(activeRow({ id: "b1", name: "א", is_active: false, extra: 1 }, false)).toEqual({ id: "b1", name: "א", is_active: false });
    expect(activeRow({ id: "b1", name: "א", is_active: true }, true)).toEqual({ id: "b1", name: "א", is_active: true });
    expect(activeRow({ id: "b1", name: "א", is_active: true }, false)).toBeNull();
    expect(activeRow({ id: "b1", name: "א" }, false)).toBeNull();
    expect(activeRow({ id: "b1", name: "א", is_active: "false" }, false)).toBeNull();
    expect(activeRow({ name: "א", is_active: false }, false)).toBeNull();
    expect(activeRow(null, true)).toBeNull();
  });
  it("archiveAnswer: ok + archived + a known stop_task, else null", () => {
    expect(archiveAnswer({ ok: true, archived: true, blocked: 5, stop_task: "none", building: { id: "b1", name: "א" } }))
      .toEqual({ blocked: 5, stop_task: "none", name: "א" });
    expect(archiveAnswer({ ok: true, archived: true, blocked: 0, stop_task: "opened", building_name: "ב" })).toEqual({ blocked: 0, stop_task: "opened", name: "ב" });
    for (const st of ["already", "failed"]) expect(archiveAnswer({ ok: true, archived: true, stop_task: st })).toEqual({ blocked: null, stop_task: st, name: null });
    expect(archiveAnswer({ ok: true, archived: true })).toBeNull();
    expect(archiveAnswer({ ok: true, archived: true, stop_task: "weird" })).toBeNull();
    expect(archiveAnswer({ ok: true, stop_task: "none" })).toBeNull();
    expect(archiveAnswer({ archived: true, stop_task: "none" })).toBeNull();
    expect(archiveAnswer({ ok: "true", archived: true, stop_task: "none" })).toBeNull();
    expect(archiveAnswer({})).toBeNull();
  });
  it("stopTaskOf: the four results only", () => {
    for (const v of ["opened", "already", "none", "failed"]) expect(stopTaskOf(v)).toBe(v);
    for (const v of [undefined, null, "", "OPENED", 1, {}]) expect(stopTaskOf(v)).toBeNull();
  });
  it("supplierRow: verify → verified, reject / revoke → rejected; any other state is not the answer", () => {
    // bloc's answer (lib/panelOps/suppliers SupplierView): id, business_name, verification_status, verified_at, verification_rejection_reason
    expect(supplierRow({ id: "s1", business_name: "אינסטלציה כהן", verification_status: "verified", verified_at: "2026-11-15T10:00:00Z", verification_rejection_reason: null, user_id: "u", verified_by: "a" }, "verify"))
      .toEqual({ id: "s1", business_name: "אינסטלציה כהן", verification_status: "verified", verified_at: "2026-11-15T10:00:00Z", verification_rejection_reason: null });
    expect(supplierRow({ id: "s1", verification_status: "rejected", verification_rejection_reason: "תעודה לא קריאה" }, "reject"))
      .toEqual({ id: "s1", business_name: null, verification_status: "rejected", verified_at: null, verification_rejection_reason: "תעודה לא קריאה" });
    expect(supplierRow({ id: "s1", verification_status: "rejected" }, "revoke")).toEqual({ id: "s1", business_name: null, verification_status: "rejected", verified_at: null, verification_rejection_reason: null });
    expect(supplierRow({ id: "s1", verification_status: "rejected" }, "verify")).toBeNull();
    expect(supplierRow({ id: "s1", verification_status: "verified" }, "reject")).toBeNull();
    expect(supplierRow({ id: "s1", verification_status: "pending" }, "revoke")).toBeNull();
    expect(supplierRow({ verification_status: "verified" }, "verify")).toBeNull();
    expect(supplierRow(null, "verify")).toBeNull();
  });
});

describe("founderOutcome — the committee head appointed in the same request", () => {
  it("'ok' → appointed", () => {
    expect(founderOutcome({ founder: "ok" })).toEqual({ ok: true });
  });
  it("'failed' with bloc's code → what happened and what to do; an unknown / missing code → the general sentence", () => {
    expect(founderOutcome({ founder: "failed", founder_code: "NO_USER" })).toEqual({ ok: false, code: "NO_USER", message: FOUNDER_TEXT.NO_USER });
    expect(FOUNDER_TEXT.NO_USER).toContain("קוד ההצטרפות");
    expect(founderOutcome({ founder: "failed", founder_code: "no_user" })).toMatchObject({ code: "NO_USER", message: FOUNDER_TEXT.NO_USER });
    // every founder_code bloc sends (BLOC_REPORT_A2: panelFounder's refusals)
    for (const c of ["AMBIGUOUS", "DELETED", "BLOCKED", "PERSONA", "HAS_HEAD", "APARTMENT_FLOOR", "NO_BUILDING", "ARCHIVED"]) {
      expect(founderOutcome({ founder: "failed", founder_code: c })).toEqual({ ok: false, code: c, message: FOUNDER_TEXT[c] });
      expect(FOUNDER_TEXT[c]).toMatch(he);
    }
    expect(founderOutcome({ founder: "failed" })).toEqual({ ok: false, code: "failed", message: FOUNDER_FAILED_TEXT });
    expect(founderOutcome({ founder: "failed", founder_code: "SOMETHING_NEW" })).toEqual({ ok: false, code: "SOMETHING_NEW", message: FOUNDER_FAILED_TEXT });
    expect(founderOutcome({ founder: "failed", founder_code: 7 })).toEqual({ ok: false, code: "failed", message: FOUNDER_FAILED_TEXT });
  });
  it("'skipped' → not appointed; anything else (missing, true, a typo) → unknown — never 'appointed'", () => {
    expect(founderOutcome({ founder: "skipped" })).toEqual({ ok: false, code: "skipped", message: FOUNDER_SKIPPED_TEXT });
    for (const d of [{}, { founder: true }, { founder: "OK" }, { founder: { ok: true } }, { founder: null }]) {
      expect(founderOutcome(d as Record<string, unknown>)).toEqual({ ok: false, code: "unknown", message: FOUNDER_UNKNOWN_TEXT });
    }
  });
});

describe("liveConflictOf — bloc's 409 live_subscription opens the same confirmation dialog", () => {
  const SUB = { status: "active", plan_id: "tower", has_recurring: true, period_end: "2026-12-01T00:00:00Z" };
  it("the subscription bloc sends, and its action", () => {
    expect(liveConflictOf({ status: 409, code: "live_subscription", data: { subscription: SUB, action: "archive" } }, "suspend"))
      .toEqual({ action: "archive", sub: SUB });
    expect(liveConflictOf({ status: 409, code: "live_subscription", data: { subscription: { ...SUB, has_recurring: false, period_end: null } } }, "suspend"))
      .toEqual({ action: "suspend", sub: { ...SUB, has_recurring: false, period_end: null } });
  });
  it("missing details → the action asked for, and 'there is a standing order' (warn rather than leave a charge running)", () => {
    expect(liveConflictOf({ status: 409, code: "live_subscription" }, "archive"))
      .toEqual({ action: "archive", sub: { status: "", plan_id: "", has_recurring: true, period_end: null } });
    expect(liveConflictOf({ status: 409, code: "live_subscription", data: { subscription: { status: "trialing" }, action: "nonsense" } }, "suspend"))
      .toEqual({ action: "suspend", sub: { status: "trialing", plan_id: "", has_recurring: true, period_end: null } });
  });
  it("any other answer is not this conflict", () => {
    expect(liveConflictOf({ status: 409, code: "changed" }, "archive")).toBeNull();
    expect(liveConflictOf({ status: 403, code: "live_subscription" }, "archive")).toBeNull();
    expect(liveConflictOf({ status: 409 }, "archive")).toBeNull();
  });
});
