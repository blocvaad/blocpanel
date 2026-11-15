// PANEL-PAY א2 (החלטות 367–369): מה המסכים עושים עם התשובה — הצלחה רק כשהשרת אמר שזה קרה; ביטול חלון הקוד = "לא בוצע";
// תשובה לא ברורה = "ייתכן שבוצע — רעננו / בדקו"; ראש ועד שלא מונה — הבניין נפתח, ואומרים למה ומה הקוד. הקובץ בחבילת
// הדפדפן — בלי imports של שרת.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STEP_UP_WHAT, STEP_UP_NOTE, REFRESH_CODES, afterSupplierAction, SUPPLIER_DONE_TEXT, SUPPLIER_FAILED_TEXT,
  SUPPLIER_NOTIFIED_TEXT, SUPPLIER_NOT_NOTIFIED_TEXT,
  newBuildingOutcome, CREATE_FAILED_TEXT, CREATE_UNCLEAR_TEXT, FOUNDER_DEFAULT_TEXT, CREATE_NETWORK_TEXT, createLocked,
} from "../blocActionsUi";
import { STEPUP_CANCELLED_TEXT } from "../stepUpShared";

describe("what the code dialog says is being confirmed", () => {
  it("one line per action, with the name in quotes", () => {
    expect(STEP_UP_WHAT.archive("השקד 104")).toBe('העברה לארכיון: "השקד 104"');
    expect(STEP_UP_WHAT.suspend("השקד 104")).toBe('השעיית הבניין "השקד 104"');
    expect(STEP_UP_WHAT.activate("השקד 104")).toBe('הפעלה מחדש של "השקד 104"');
    expect(STEP_UP_WHAT.create("השקד 104")).toBe('בניין חדש ומינוי ראש ועד: "השקד 104"');
    expect(STEP_UP_WHAT.verify("אינסטלציה")).toBe('אימות הספק "אינסטלציה"');
    expect(STEP_UP_WHAT.reject("אינסטלציה")).toBe('דחיית בקשת האימות של "אינסטלציה"');
    expect(STEP_UP_WHAT.revoke("אינסטלציה")).toBe('הסרת האימות של "אינסטלציה"');
  });
  it("the note in the confirmation dialogs says a code comes next (unless one was confirmed in the last 10 minutes)", () => {
    expect(STEP_UP_NOTE).toContain("קוד חד-פעמי מהמייל");
    expect(STEP_UP_NOTE).toContain("10 הדקות");
  });
  it("refresh is offered where the action may have happened or the state changed", () => {
    for (const c of ["changed", "bad_shape", "TIMEOUT", "NETWORK", "failed"]) expect(REFRESH_CODES.has(c)).toBe(true);
    for (const c of ["forbidden", "not_found", "read_failed", "write_failed", "stepup_required", "invalid"]) expect(REFRESH_CODES.has(c)).toBe(false);
  });
});

describe("afterSupplierAction", () => {
  const ok = { ok: true };
  const no = { ok: false };
  it("done only with ok === true — the page shows what happened", () => {
    expect(afterSupplierAction(ok, { ok: true, verification_status: "verified" }, "verify", "אינסטלציה"))
      .toEqual({ done: true, notice: { tone: "ok", text: SUPPLIER_DONE_TEXT.verify("אינסטלציה"), refresh: false } });
    expect(SUPPLIER_DONE_TEXT.verify("א")).toContain('תג "ספק מאומת"');
    expect(afterSupplierAction(ok, { ok: true }, "reject", "א").notice.text).toBe(SUPPLIER_DONE_TEXT.reject("א"));
    expect(afterSupplierAction(ok, { ok: true }, "revoke", "א").notice.text).toBe(SUPPLIER_DONE_TEXT.revoke("א"));
  });
  it("bloc's notified: true → 'the supplier got a notice'; false → 'it was not sent — tell them another way'; unknown → nothing", () => {
    expect(afterSupplierAction(ok, { ok: true, notified: true }, "verify", "א").notice.text).toBe(`${SUPPLIER_DONE_TEXT.verify("א")} ${SUPPLIER_NOTIFIED_TEXT.verify}`);
    expect(afterSupplierAction(ok, { ok: true, notified: true }, "reject", "א").notice.text).toContain("עם הסיבה");
    expect(afterSupplierAction(ok, { ok: true, notified: false }, "revoke", "א").notice.text).toBe(`${SUPPLIER_DONE_TEXT.revoke("א")} ${SUPPLIER_NOT_NOTIFIED_TEXT}`);
    expect(afterSupplierAction(ok, { ok: true, notified: "yes" }, "verify", "א").notice.text).toBe(SUPPLIER_DONE_TEXT.verify("א"));
  });
  it("a 2xx without ok === true is not 'done' — maybe it happened, refresh", () => {
    for (const j of [{}, { ok: "true" }, null, { verification_status: "verified" }]) {
      const o = afterSupplierAction(ok, j as never, "verify", "א");
      expect(o.done).toBe(false);
      expect(o.notice.tone).toBe("error");
      expect(o.notice.refresh).toBe(true);
      expect(o.notice.text).toContain("ייתכן שהפעולה בוצעה");
    }
  });
  it("the step-up dialog was cancelled → 'the action did not run'", () => {
    expect(afterSupplierAction(no, { error: "פעולה רגישה — צריך לאשר", code: "stepup_required" }, "verify", "א"))
      .toEqual({ done: false, notice: { tone: "error", text: STEPUP_CANCELLED_TEXT, refresh: false } });
  });
  it("changed / bad_shape / timeout → the server's sentence + refresh; other failures → the sentence alone", () => {
    expect(afterSupplierAction(no, { error: "מצב האימות של הספק השתנה", code: "changed" }, "verify", "א").notice)
      .toEqual({ tone: "error", text: "מצב האימות של הספק השתנה", refresh: true });
    expect(afterSupplierAction(no, { error: "bloc ענה בצורה לא צפויה", code: "bad_shape" }, "revoke", "א").notice.refresh).toBe(true);
    expect(afterSupplierAction(no, { error: "bloc לא ענה בזמן", code: "TIMEOUT" }, "reject", "א").notice.refresh).toBe(true);
    expect(afterSupplierAction(no, { error: "הספק לא נמצא.", code: "not_found" }, "verify", "א").notice)
      .toEqual({ tone: "error", text: "הספק לא נמצא.", refresh: false });
    expect(afterSupplierAction(no, {}, "verify", "א").notice).toEqual({ tone: "error", text: SUPPLIER_FAILED_TEXT, refresh: false });
    expect(afterSupplierAction(no, null, "verify", "א").notice.text).toBe(SUPPLIER_FAILED_TEXT);
  });
});

describe("newBuildingOutcome", () => {
  const ok = { ok: true };
  it("created with a committee head (or without one) → go to the building", () => {
    expect(newBuildingOutcome(ok, { data: { id: "b1", name: "השקד 104" }, founder: { ok: true } }, "השקד 104")).toEqual({ kind: "created", id: "b1" });
    expect(newBuildingOutcome(ok, { data: { id: "b1" } }, "השקד 104")).toEqual({ kind: "created", id: "b1" });
  });
  it("created, the head was not appointed → say both, why, and the invite code", () => {
    expect(newBuildingOutcome(ok, { data: { id: "b1", name: "השקד 104", invite_code: "B-4K2Q9X" }, founder: { ok: false, code: "NO_USER", message: "אין ב-bloc חשבון עם המייל הזה." } }, "x"))
      .toEqual({ kind: "founder_failed", id: "b1", name: "השקד 104", inviteCode: "B-4K2Q9X", message: "אין ב-bloc חשבון עם המייל הזה." });
    expect(newBuildingOutcome(ok, { data: { id: "b1" }, founder: { ok: false } }, "הטופס"))
      .toEqual({ kind: "founder_failed", id: "b1", name: "הטופס", inviteCode: null, message: FOUNDER_DEFAULT_TEXT });
    expect(newBuildingOutcome(ok, { data: { id: "b1" }, founder: { ok: "true" } }, "x").kind).toBe("founder_failed");
  });
  it("a 2xx without the building's id is not 'created' — maybe it was, check the list", () => {
    for (const j of [{}, null, { data: {} }, { data: { id: "" } }, { data: { id: 5 } }]) {
      expect(newBuildingOutcome(ok, j, "x")).toEqual({ kind: "error", text: CREATE_UNCLEAR_TEXT, unclear: true });
    }
  });
  it("failures: the server's sentence; cancelled code → 'did not run'; timeout / bad shape → unclear", () => {
    const no = { ok: false };
    expect(newBuildingOutcome(no, { error: "bloc סירב", code: "forbidden" }, "x")).toEqual({ kind: "error", text: "bloc סירב", unclear: false });
    expect(newBuildingOutcome(no, { error: "פעולה רגישה", code: "stepup_required" }, "x")).toEqual({ kind: "error", text: STEPUP_CANCELLED_TEXT, unclear: false });
    expect(newBuildingOutcome(no, { error: "bloc לא ענה בזמן", code: "TIMEOUT" }, "x")).toEqual({ kind: "error", text: "bloc לא ענה בזמן", unclear: true });
    expect(newBuildingOutcome(no, { error: "לא צפוי", code: "bad_shape" }, "x").kind).toBe("error");
    expect(newBuildingOutcome(no, {}, "x")).toEqual({ kind: "error", text: CREATE_FAILED_TEXT, unclear: false });
  });
});

describe("browser bundle", () => {
  it("no server imports (crypto, next/server, supabase, blocApi)", () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "blocActionsUi.ts"), "utf8");
    const imports = [...src.matchAll(/^import[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
    expect(imports).toEqual(["./stepUpShared"]);
  });
});

describe("review #3: after an unclear answer there is no second \"צור בניין\" (a second building)", () => {
  it("createLocked — a committee head not appointed, or any unclear answer; a plain failure can be sent again", () => {
    expect(createLocked(null)).toBe(false);
    expect(createLocked({ kind: "founder_failed", id: "b1", name: "א", inviteCode: null, message: "x" })).toBe(true);
    expect(createLocked({ kind: "error", text: CREATE_UNCLEAR_TEXT, unclear: true })).toBe(true);
    expect(createLocked({ kind: "error", text: CREATE_FAILED_TEXT, unclear: false })).toBe(false);
    for (const code of ["TIMEOUT", "NETWORK", "bad_shape", "failed"])
      expect(createLocked(newBuildingOutcome({ ok: false }, { error: "x", code }, "א"))).toBe(true);
    expect(createLocked(newBuildingOutcome({ ok: false }, { error: "שם חובה" }, "א"))).toBe(false);
    expect(createLocked(newBuildingOutcome({ ok: true }, {}, "א"))).toBe(true);
  });
  it("a dropped connection says the building may exist — check the list first", () => {
    expect(CREATE_NETWORK_TEXT).toContain("ייתכן שהבניין נוצר");
    expect(CREATE_NETWORK_TEXT).toContain("ברשימת הבניינים");
  });
});
