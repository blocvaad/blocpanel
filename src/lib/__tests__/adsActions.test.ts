// PANEL-PAY א2ב (החלטות 371–372): lib/adsActions — טבלת הפעולות אחת לכל המסך, כל קוד של bloc בעברית, מה נחשב תשובה ברורה,
// מה נרשם ביומן (נדחה / לא ידוע), והכתובת החתומה להעלאה.
import { describe, it, expect } from "vitest";
import {
  AD_ACTIONS, AD_ENTITY, FIELD_LABEL, adsAnswer, adsFailure, adsFailureAudit, adsOutcome, adFacts, adEntityId, answerFacts,
  invalidText, uploadTarget, uploadUrlFailure, unknownEmailsText, LOCKED_TEXT, IN_USE_TEXT, IN_USE_SAVE_TEXT,
  UPLOAD_NO_ANSWER_TEXT, UPLOAD_INVALID_TEXT, ADS_FORBIDDEN_TEXT, ADS_UNKNOWN_TEXT,
} from "../adsActions";
import { adActionSchema } from "../validation";
import { adsDbMessage, ADS_SQL_MISSING } from "../ads";
import { INVALID_TEXT, UNEXPECTED_TEXT } from "../moneyActions";
import { UPLOAD_FAILED_TEXT } from "../adsUi";

const ID = "11111111-1111-4111-8111-111111111111";
const NEW = "33333333-3333-4333-8333-333333333333";
const schemaOptions = () => ((adActionSchema as any)._def.schema.options as any[]);

describe("one action table for the whole screen (ADS-2 adds rows, nothing else)", () => {
  it("every action of the panel's schema has a row — and no row without an action", () => {
    const actions = schemaOptions().map((o) => o.shape.action.value as string).sort();
    expect(Object.keys(AD_ACTIONS).sort()).toEqual(actions);
    expect(actions).toHaveLength(13);
  });
  it("each row: an AD_* log name, a known entity, a Hebrew write-failure sentence", () => {
    for (const [action, row] of Object.entries(AD_ACTIONS)) {
      expect(row.audit, action).toMatch(/^AD_[A-Z_]+$/);
      expect(AD_ENTITY[row.entity], action).toBeTruthy();
      expect(row.failed, action).toMatch(/[א-ת].*נסו שוב\.$/);
    }
  });
  it("saves and the duplicate expect an id; the rest only ok", () => {
    const kinds = Object.fromEntries(Object.entries(AD_ACTIONS).map(([a, r]) => [a, r.kind]));
    expect(kinds).toEqual({
      "advertiser.save": "save", "advertiser.archive": "update", "advertiser.delete": "delete",
      "contract.save": "save", "contract.delete": "delete",
      "campaign.save": "save", "campaign.status": "update", "campaign.duplicate": "duplicate", "campaign.delete": "delete",
      "creative.save": "save", "creative.active": "update", "creative.delete": "delete", "settings.save": "update",
    });
  });
  it("every field of the schema has a Hebrew label for bloc's invalid + field", () => {
    const fields = new Set<string>();
    for (const o of schemaOptions()) for (const k of Object.keys(o.shape)) if (k !== "action") fields.add(k);
    for (const f of fields) expect(FIELD_LABEL[f], f).toMatch(/[א-ת]/);
  });
});

describe("the sentences are today's (one place: lib/ads shares them with adsDbMessage)", () => {
  it("locked / in_use / check_failed / sql_missing are the same words the panel showed from the DB errors", () => {
    expect(LOCKED_TEXT.contract).toBe(adsDbMessage({ message: "AD_CONTRACT_LOCKED" }, "x"));
    expect(LOCKED_TEXT.campaign).toBe(adsDbMessage({ message: "AD_CAMPAIGN_LOCKED" }, "x"));
    expect(LOCKED_TEXT.creative).toBe(adsDbMessage({ message: "AD_CREATIVE_LOCKED" }, "x"));
    expect(IN_USE_TEXT).toBe(adsDbMessage({ code: "23503" }, "x"));
    expect(adsFailure({ status: 400, code: "check_failed", error: "" }, "contract.save").error).toBe(adsDbMessage({ code: "23514" }, "x"));
    expect(adsFailure({ status: 503, code: "sql_missing", error: "" }, "settings.save").error).toBe(ADS_SQL_MISSING);
  });
  it("in_use on a save says the parent is gone — not \"cannot delete\"", () => {
    expect(IN_USE_SAVE_TEXT).not.toContain("למחוק");
    for (const a of ["contract.save", "campaign.save", "creative.save", "advertiser.save", "campaign.duplicate"] as const) {
      expect(adsFailure({ status: 409, code: "in_use", error: "" }, a).error, a).toBe(IN_USE_SAVE_TEXT);
    }
    for (const a of ["advertiser.delete", "contract.delete", "campaign.delete", "creative.delete", "advertiser.archive"] as const) {
      expect(adsFailure({ status: 409, code: "in_use", error: "" }, a).error, a).toBe(IN_USE_TEXT);
    }
  });
  it("unknown_emails names them (today's sentence); none listed → a general sentence", () => {
    expect(unknownEmailsText(["a@x.co"])).toBe("אין חשבון bloc עם האימייל: a@x.co");
    expect(unknownEmailsText(["a@x.co", "b@x.co"])).toBe("אין חשבון bloc עם האימייל: a@x.co, b@x.co");
    expect(unknownEmailsText([])).toMatch(/^אחד האימיילים/);
    const many = Array.from({ length: 25 }, (_, i) => `u${i}@x.co`);
    expect(adsFailure({ status: 400, code: "unknown_emails", error: "", data: { emails: many } }, "settings.save").error.split(", ")).toHaveLength(20);
  });
  it("invalidText: the first path segment; an array path; unknown / prototype / missing → the general sentence", () => {
    expect(invalidText("cta_url")).toBe("bloc דחה את הבקשה — שדה לא תקין: הקישור. בדקו אותו ונסו שוב.");
    expect(invalidText("building_ids.3")).toContain("הבניינים");
    expect(invalidText(["plans", 1])).toContain("המסלולים");
    for (const f of ["nope", "toString", "__proto__", "", null, undefined, 7, {}]) expect(invalidText(f), String(f)).toBe(INVALID_TEXT);
  });
  it("a 400 / 409 / other status without a known code: bloc's Hebrew passes, English does not", () => {
    expect(adsFailure({ status: 409, code: "x", error: "קונפליקט" }, "campaign.save").error).toBe("קונפליקט");
    expect(adsFailure({ status: 409, code: "x", error: "conflict" }, "campaign.save")).toEqual({ status: 409, code: "x", error: UNEXPECTED_TEXT });
    expect(adsFailure({ status: 409, error: "conflict" }, "campaign.save").code).toBe("conflict");
    expect(adsFailure({ status: 400, error: "bad" }, "campaign.save")).toEqual({ status: 400, code: "invalid", error: INVALID_TEXT });
    expect(adsFailure({ status: 422, error: "שגיאה" }, "campaign.save")).toEqual({ status: 422, code: "failed", error: "שגיאה" });
    expect(adsFailure({ status: 422, code: "z", error: "err" }, "campaign.save")).toEqual({ status: 422, code: "z", error: UNEXPECTED_TEXT });
    expect(adsFailure({ status: 200, error: "err" }, "campaign.save").status).toBe(502);
    expect(adsFailure({ status: 403, code: "nope", error: "" }, "campaign.save")).toEqual({ status: 403, code: "nope", error: ADS_FORBIDDEN_TEXT });
    expect(adsFailure({ status: 503, code: "boom", error: "" }, "campaign.save")).toEqual({ status: 503, code: "failed", error: ADS_UNKNOWN_TEXT });
  });
  it("locked: which names the entity even in the trigger's own spelling, over the action's entity", () => {
    expect(adsFailure({ status: 409, code: "locked", error: "", data: { which: "ad_contract_locked" } }, "advertiser.save").error).toBe(LOCKED_TEXT.contract);
    expect(adsFailure({ status: 409, code: "locked", error: "", data: { which: "AD_CAMPAIGN_LOCKED" } }, "creative.save").error).toBe(LOCKED_TEXT.campaign);
    expect(adsFailure({ status: 409, code: "locked", error: "", data: { which: 7 } }, "settings.save").error).toContain("נשמר כמו שהוא");
  });
  it("a campaign-status code that is also an object key is not a sentence (toString)", () => {
    expect(adsFailure({ status: 409, code: "toString", error: "x" }, "campaign.status").error).toBe(UNEXPECTED_TEXT);
  });
});

describe("the panel's log: refused vs maybe-done", () => {
  it("adsOutcome: timeout / network / unknown 5xx → unknown; 4xx, connection codes, sql_missing / read / write → failed", () => {
    expect(adsOutcome({ status: 504, code: "TIMEOUT" })).toBe("unknown");
    expect(adsOutcome({ status: 504, code: "NETWORK" })).toBe("unknown");
    expect(adsOutcome({ status: 500, code: "failed" })).toBe("unknown");
    expect(adsOutcome({ status: 503 })).toBe("unknown");
    expect(adsOutcome({ status: 499, code: "x" })).toBe("failed");
    expect(adsOutcome({ status: 409, code: "locked" })).toBe("failed");
    for (const code of ["sql_missing", "read_failed", "write_failed", "REJECTED", "NOT_CONFIGURED", "EDGE_BLOCKED"]) {
      expect(adsOutcome({ status: 503, code }), code).toBe("failed");
    }
  });
  it("review #12: config_missing (no storage call was made) is a definite failure, never \"maybe done\"", () => {
    expect(adsOutcome({ status: 503, code: "config_missing" })).not.toBe("unknown");
    expect(adsFailureAudit({ status: 503, code: "config_missing" }, "AD_IMAGE_UPLOAD").name).toBe("BLOC_ACTION_FAILED");
  });
  it("adsFailureAudit: the marker and the AD_* action", () => {
    expect(adsFailureAudit({ status: 504, code: "TIMEOUT" }, "AD_CAMPAIGN_SAVE")).toEqual({
      name: "BLOC_ACTION_UNKNOWN", meta: { action: "AD_CAMPAIGN_SAVE", outcome: "unknown", code: "TIMEOUT", status: 504 },
    });
    expect(adsFailureAudit({ status: 409 }, "AD_CONTRACT_SAVE")).toEqual({
      name: "BLOC_ACTION_FAILED", meta: { action: "AD_CONTRACT_SAVE", outcome: "failed", code: null, status: 409 },
    });
  });
  it("adFacts: no notes, no contact details; adEntityId: the target, settings = 1, a new save = none", () => {
    const adv = adActionSchema.parse({ action: "advertiser.save", name: "פיצה", notes: "סוד", contact_phone: "050", contact_email: "a@b.co", website: "https://p.example" });
    expect(adFacts(adv)).toEqual({ name: "פיצה", created: true });
    expect(adEntityId(adv)).toBeUndefined();
    expect(adEntityId(adActionSchema.parse({ action: "creative.delete", id: ID }))).toBe(ID);
    expect(adEntityId(adActionSchema.parse({ action: "settings.save", enabled: true }))).toBe("1");
    expect(adFacts(adActionSchema.parse({ action: "settings.save" }))).toEqual({ enabled: undefined, excluded: undefined, testers: undefined });
    for (const a of ["advertiser.delete", "contract.delete", "campaign.delete", "creative.delete"]) {
      expect(adFacts(adActionSchema.parse({ action: a, id: ID })), a).toEqual({});
    }
  });
  it("answerFacts: only non-empty strings of name / headline / reference / from", () => {
    expect(answerFacts({ name: "א", headline: "", reference: 7, from: "draft", other: "x", ok: true })).toEqual({ name: "א", from: "draft" });
    expect(answerFacts({ headline: "כותרת", reference: "K-7" })).toEqual({ headline: "כותרת", reference: "K-7" });
  });
});

describe("adsAnswer — a clear answer only", () => {
  const p = (b: any) => adActionSchema.parse(b);
  const SAVE = p({ action: "advertiser.save", name: "פיצה" });
  const EDIT = p({ action: "advertiser.save", id: ID, name: "פיצה" });
  const DUP = p({ action: "campaign.duplicate", id: ID });
  it("ok must be exactly true", () => {
    for (const ok of [undefined, "true", 1, false]) expect(adsAnswer(SAVE, { ok, id: NEW }), String(ok)).toBeNull();
  });
  it("an edit with hex letters: the same id in another case is the same row", () => {
    const HEX = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    expect(adsAnswer(p({ action: "advertiser.save", id: HEX, name: "פיצה" }), { ok: true, id: HEX.toUpperCase() })).toEqual({ id: HEX.toUpperCase(), creatives: null });
    expect(adsAnswer(p({ action: "advertiser.save", id: HEX.toUpperCase(), name: "פיצה" }), { ok: true, id: HEX })).toEqual({ id: HEX, creatives: null });
    expect(adsAnswer(p({ action: "campaign.duplicate", id: HEX }), { ok: true, id: HEX.toUpperCase(), creatives: "ok" })).toBeNull();
  });
  it("save: a uuid id (any case); an edit — the same id", () => {
    expect(adsAnswer(SAVE, { ok: true, id: NEW })).toEqual({ id: NEW, creatives: null });
    expect(adsAnswer(SAVE, { ok: true, id: NEW.toUpperCase() })).toEqual({ id: NEW.toUpperCase(), creatives: null });
    expect(adsAnswer(SAVE, { ok: true, id: `${NEW}x` })).toBeNull();
    expect(adsAnswer(SAVE, { ok: true, id: 5 })).toBeNull();
    expect(adsAnswer(EDIT, { ok: true, id: ID.toUpperCase() })).toEqual({ id: ID.toUpperCase(), creatives: null });
    expect(adsAnswer(EDIT, { ok: true, id: NEW })).toBeNull();
  });
  it("duplicate: a new id; creatives ok / failed / anything else unknown", () => {
    expect(adsAnswer(DUP, { ok: true, id: NEW, creatives: "ok" })).toEqual({ id: NEW, creatives: "ok" });
    expect(adsAnswer(DUP, { ok: true, id: NEW, creatives: "failed" })).toEqual({ id: NEW, creatives: "failed" });
    // review #6: bloc says how many ads with an outside image it did not copy — a positive integer, capped; anything else ignored
    expect(adsAnswer(DUP, { ok: true, id: NEW, creatives: "ok", skipped_outside: 2 })).toEqual({ id: NEW, creatives: "ok", skipped: 2 });
    expect(adsAnswer(DUP, { ok: true, id: NEW, creatives: "ok", skipped_outside: 5000 })).toEqual({ id: NEW, creatives: "ok", skipped: 1000 });
    for (const sk of [0, -1, 1.5, "2", null]) expect(adsAnswer(DUP, { ok: true, id: NEW, creatives: "ok", skipped_outside: sk }), String(sk)).toEqual({ id: NEW, creatives: "ok" });
    expect(adsAnswer(DUP, { ok: true, id: NEW })).toEqual({ id: NEW, creatives: "unknown" });
    expect(adsAnswer(DUP, { ok: true, id: ID, creatives: "ok" })).toBeNull();
    expect(adsAnswer(DUP, { ok: true, creatives: "ok" })).toBeNull();
  });
  it("update / delete: ok is enough (an id in the answer is ignored)", () => {
    expect(adsAnswer(p({ action: "campaign.status", id: ID, status: "paused" }), { ok: true })).toEqual({ id: null, creatives: null });
    expect(adsAnswer(p({ action: "creative.delete", id: ID }), { ok: true, id: "junk" })).toEqual({ id: null, creatives: null });
    expect(adsAnswer(p({ action: "settings.save", enabled: true }), { ok: false })).toBeNull();
  });
});

describe("the upload URL (C4)", () => {
  const PATH = "creatives/2026-11/a.webp";
  const good = { ok: true, path: PATH, token: "t", signed_url: `https://x.supabase.co/storage/v1/object/upload/sign/ads/${PATH}?token=t`, public_url: `https://x.supabase.co/storage/v1/object/public/ads/${PATH}` };
  it("a clear answer → where to PUT and the public URL (trimmed)", () => {
    // the shape alone (project unknown: null); the project check has its own test below
    expect(uploadTarget(good, null)).toEqual({ path: PATH, signed_url: good.signed_url, public_url: good.public_url, anon_key: null });
    expect(uploadTarget({ ...good, anon_key: " k " }, null)?.anon_key).toBe("k");
    expect(uploadTarget({ ...good, anon_key: 7 } as any, null)?.anon_key).toBeNull();
    expect(uploadTarget({ ...good, public_url: ` ${good.public_url} ` }, null)?.public_url).toBe(good.public_url);
  });
  it("review #10: when the panel knows its project, the PUT and the public URL must be that project's ads bucket", () => {
    const SU = "https://x.supabase.co";
    expect(uploadTarget(good, SU)?.signed_url).toBe(good.signed_url);
    for (const d of [
      { ...good, signed_url: `https://evil.example/storage/v1/object/upload/sign/ads/${PATH}?token=t` },
      { ...good, signed_url: `https://x.supabase.co/storage/v1/object/upload/sign/avatars/${PATH}?token=t` },
      { ...good, signed_url: `https://x.supabase.co.evil.example/storage/v1/object/upload/sign/ads/${PATH}?token=t` },
      { ...good, public_url: `https://evil.example/storage/v1/object/public/ads/${PATH}` },
      { ...good, public_url: `${good.public_url}?x=1` },
      { ...good, public_url: `https://x.supabase.co/evil/storage/v1/object/public/ads/${PATH}` },   // the bucket path deeper in another path
    ]) expect(uploadTarget(d, SU), JSON.stringify(d)).toBeNull();
    // the project URL with a trailing slash (as people paste it) still checks the project
    expect(uploadTarget({ ...good, signed_url: `https://evil.example/storage/v1/object/upload/sign/ads/${PATH}?token=t` }, `${SU}/`)).toBeNull();
    expect(uploadTarget(good, `${SU}/`)?.signed_url).toBe(good.signed_url);
    // not knowing the project (no env) keeps the shape checks only
    expect(uploadTarget({ ...good, signed_url: `https://other.supabase.co/storage/v1/object/upload/sign/ads/${PATH}?token=t` }, null)).not.toBeNull();
  });
  it("no ok / missing / http / a bare host / another bucket → null", () => {
    for (const d of [
      { ...good, ok: undefined }, { ...good, path: " " }, { ...good, signed_url: "ftp://x/y" }, { ...good, signed_url: "https://x.supabase.co" },
      { ...good, public_url: good.public_url.replace("https", "http") }, { ...good, public_url: "https://x.supabase.co/storage/v1/object/public/adsx/a.webp" },
      { ...good, signed_url: null },
    ]) expect(uploadTarget(d as any, null), JSON.stringify(d)).toBeNull();
  });
  it("uploadUrlFailure: no 'maybe done' (nothing was sent); setup codes as written; the rest — try again", () => {
    expect(uploadUrlFailure({ status: 504, code: "TIMEOUT", error: "x" })).toEqual({ status: 504, code: "TIMEOUT", error: UPLOAD_NO_ANSWER_TEXT });
    expect(uploadUrlFailure({ status: 504, code: "NETWORK", error: "x" }).error).toBe(UPLOAD_NO_ANSWER_TEXT);
    expect(uploadUrlFailure({ status: 502, code: "REJECTED", error: "נדחה" }).error).toBe("נדחה");
    expect(uploadUrlFailure({ status: 503, code: "sql_missing", error: "" }).error).toBe(ADS_SQL_MISSING);
    expect(uploadUrlFailure({ status: 500, code: "config_missing", error: "" })).toEqual({ status: 503, code: "config_missing", error: "ההעלאה לא זמינה כרגע — חסרה הגדרה ב-bloc. התמונה לא הועלתה." });
    expect(uploadUrlFailure({ status: 403, error: "" })).toEqual({ status: 403, code: "forbidden", error: ADS_FORBIDDEN_TEXT });
    expect(uploadUrlFailure({ status: 418, code: "forbidden", error: "" }).status).toBe(403);
    expect(uploadUrlFailure({ status: 400, error: "" })).toEqual({ status: 400, code: "invalid", error: UPLOAD_INVALID_TEXT });
    expect(uploadUrlFailure({ status: 422, code: "invalid", error: "" }).status).toBe(400);
    expect(uploadUrlFailure({ status: 503, code: "read_failed", error: "" })).toEqual({ status: 503, code: "read_failed", error: UPLOAD_FAILED_TEXT });
    expect(uploadUrlFailure({ status: 200, error: "" })).toEqual({ status: 502, code: "failed", error: UPLOAD_FAILED_TEXT });
  });
});
