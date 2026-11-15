import { describe, it, expect } from "vitest";
import {
  buildingUpdateSchema, buildingCreateSchema, buildingPlanActionSchema, stepUpActionSchema, memberActionSchema, buildingSuspendSchema,
  adminUpdateSchema, managementActionSchema, broadcastSchema, broadcastManageSchema, broadcastDeleteSchema, parseBody,
} from "../validation";

const BID = "550e8400-e29b-41d4-a716-446655440000";
const SEND = (o: Record<string, unknown> = {}) => ({ broadcast_id: BID, title: "t", content: "c", duration: "1w", ...o });

describe("buildingUpdateSchema — mass-assignment protection (P0.8)", () => {
  it("accepts only allowlisted fields", () => {
    const r = buildingUpdateSchema.safeParse({ name: "בניין א", address: "הרצל 1", max_tenants: 40 });
    expect(r.success).toBe(true);
  });

  it("PANEL-PAY א1 (decision 363): the plan is not an edit field any more — plan / comp_reason / plan_expires are rejected", () => {
    for (const bad of [{ plan: "tower", comp_reason: "בניין בדיקות" }, { plan: "free" }, { comp_reason: "פיילוט" }, { plan_expires: null }]) {
      expect(buildingUpdateSchema.safeParse({ name: "ok", ...bad }).success).toBe(false);
    }
  });

  it("PANEL-PAY א1: building creation has no plan either (a new building opens on the DB default)", () => {
    expect(buildingCreateSchema.safeParse({ name: "בניין", max_tenants: "30" }).success).toBe(true);
    for (const bad of [{ plan: "tower", comp_reason: "פיילוט" }, { plan: "free" }, { comp_reason: "x" }]) {
      expect(buildingCreateSchema.safeParse({ name: "בניין", ...bad }).success).toBe(false);
    }
  });

  it("review #4 (PANEL-PAY א2): a name of spaces is refused in Hebrew; the committee head's email is trimmed and at most 200, as in bloc", () => {
    const blank = buildingUpdateSchema.safeParse({ name: "   " });
    expect(blank.success).toBe(false);
    if (!blank.success) expect(blank.error.issues[0].message).toBe("שם חובה");
    const trimmed = buildingUpdateSchema.safeParse({ name: "  השקד 104 " });
    expect(trimmed.success && trimmed.data.name).toBe("השקד 104");
    const ok = buildingCreateSchema.safeParse({ name: "בניין", admin_email: "  dana@example.com " });
    expect(ok.success && ok.data.admin_email).toBe("dana@example.com");
    const long = buildingCreateSchema.safeParse({ name: "בניין", admin_email: `${"a".repeat(190)}@example.com` });
    expect(long.success).toBe(false);
    if (!long.success) expect(long.error.issues[0].message).toBe("כתובת המייל של ראש הוועד ארוכה מדי (עד 200 תווים)");
    const bad = buildingCreateSchema.safeParse({ name: "בניין", admin_email: "not-an-email" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toBe("כתובת המייל של ראש הוועד לא תקינה");
  });

  it("REJECTS forbidden fields (id, invite_code, is_active)", () => {
    for (const bad of [{ id: "x" }, { invite_code: "HACK" }, { is_active: false }, { is_archived: true }]) {
      const r = buildingUpdateSchema.safeParse({ name: "ok", ...bad });
      expect(r.success).toBe(false);
    }
  });

  it("rejects an invalid plan enum", () => {
    expect(buildingUpdateSchema.safeParse({ plan: "supermega" }).success).toBe(false);
  });
});

describe("buildingPlanActionSchema (PANEL-PAY א1, C1)", () => {
  it("grant: a real bloc plan id except free, a reason of 3–300 after trim; legacy ids are rejected", () => {
    const ok = buildingPlanActionSchema.safeParse({ action: "grant", plan: "large", comp_reason: "  פיילוט  ", expected_plan: "free" });
    expect(ok.success).toBe(true);
    if (ok.success && ok.data.action === "grant") expect(ok.data.comp_reason).toBe("פיילוט");
    for (const legacy of ["basic", "pro", "enterprise", "free"]) {
      expect(buildingPlanActionSchema.safeParse({ action: "grant", plan: legacy, comp_reason: "פיילוט" }).success).toBe(false);
    }
    expect(buildingPlanActionSchema.safeParse({ action: "grant", plan: "large" }).success).toBe(false);
    expect(buildingPlanActionSchema.safeParse({ action: "grant", plan: "large", comp_reason: "ab" }).success).toBe(false);
    expect(buildingPlanActionSchema.safeParse({ action: "grant", plan: "large", comp_reason: "x".repeat(301) }).success).toBe(false);
  });
  it("end_grant: only the expected plan; strict (no plan, no building id from the body)", () => {
    expect(buildingPlanActionSchema.safeParse({ action: "end_grant" }).success).toBe(true);
    expect(buildingPlanActionSchema.safeParse({ action: "end_grant", expected_plan: "tower" }).success).toBe(true);
    expect(buildingPlanActionSchema.safeParse({ action: "end_grant", plan: "tower" }).success).toBe(false);
    expect(buildingPlanActionSchema.safeParse({ action: "grant", plan: "tower", comp_reason: "פיילוט", building_id: BID }).success).toBe(false);
  });
  it("the reason error is in Hebrew (parseBody shows it as is)", async () => {
    const r = await parseBody({ json: async () => ({ action: "grant", plan: "tower", comp_reason: "x" }) }, buildingPlanActionSchema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect((await r.response.json()).error).toMatch(/סיבה/);
  });
});

describe("stepUpActionSchema (PANEL-PAY א1, C4)", () => {
  it("send / verify with exactly 6 digits", () => {
    expect(stepUpActionSchema.safeParse({ action: "send" }).success).toBe(true);
    expect(stepUpActionSchema.safeParse({ action: "verify", code: "012345" }).success).toBe(true);
    expect(stepUpActionSchema.safeParse({ action: "verify", code: " 012345 " }).success).toBe(true);
    for (const code of ["12345", "1234567", "12a456", 123456]) expect(stepUpActionSchema.safeParse({ action: "verify", code }).success).toBe(false);
    expect(stepUpActionSchema.safeParse({ action: "send", code: "123456" }).success).toBe(false);
  });
});

describe("memberActionSchema (bloc UI-R5c-1) — no direct profile writes", () => {
  const U1 = "550e8400-e29b-41d4-a716-446655440001", U2 = "550e8400-e29b-41d4-a716-446655440002";
  const NOTE = "אומת בטלפון מול ראש הוועד";

  it("REGRESSION: the old direct writes are gone — role / approval_status / building_id are not actions", () => {
    for (const bad of [{ role: "admin" }, { approval_status: "approved" }, { building_id: U1 }, { action: "set_role", building_id: U1, user_id: U2, role: "management", panel_note: NOTE }]) {
      expect(memberActionSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("documentation is mandatory where someone is taken out or authority changes", () => {
    expect(memberActionSchema.safeParse({ action: "reject", building_id: U1, user_id: U2 }).success).toBe(false);
    expect(memberActionSchema.safeParse({ action: "set_role", building_id: U1, user_id: U2, role: "admin", panel_note: "קצר" }).success).toBe(false);
    expect(memberActionSchema.safeParse({ action: "unblock", user_id: U2, panel_note: NOTE }).success).toBe(true);
    expect(memberActionSchema.safeParse({ action: "approve", building_id: U1, user_id: U2 }).success).toBe(true);
  });

  it("remove and block need an explicit confirmation; block needs a reason", () => {
    expect(memberActionSchema.safeParse({ action: "remove", building_id: U1, user_id: U2, panel_note: NOTE }).success).toBe(false);
    expect(memberActionSchema.safeParse({ action: "remove", building_id: U1, user_id: U2, panel_note: NOTE, confirm: true }).success).toBe(true);
    expect(memberActionSchema.safeParse({ action: "block", user_id: U2, reason: "הונאה", confirm: true }).success).toBe(true);
    expect(memberActionSchema.safeParse({ action: "block", user_id: U2, reason: "", confirm: true }).success).toBe(false);
    expect(memberActionSchema.safeParse({ action: "block", user_id: U2, reason: "הונאה" }).success).toBe(false);
  });

  it("transfer: approve defaults to waiting for the new committee; unknown fields are refused", () => {
    const r = memberActionSchema.safeParse({ action: "transfer", user_id: U2, from_building_id: U1, to_building_id: U1, panel_note: NOTE });
    expect(r.success && r.data.action === "transfer" && r.data.approve).toBe(false);
    expect(memberActionSchema.safeParse({ action: "transfer", user_id: U2, from_building_id: U1, to_building_id: U1, panel_note: NOTE, role: "admin" }).success).toBe(false);
  });

  it("apartment and floor have bloc's limits", () => {
    expect(memberActionSchema.safeParse({ action: "set_apartment", building_id: U1, user_id: U2, apartment: "1".repeat(21), floor: null }).success).toBe(false);
    expect(memberActionSchema.safeParse({ action: "set_apartment", building_id: U1, user_id: U2, apartment: "12א", floor: "3" }).success).toBe(true);
  });
});

describe("adminUpdateSchema", () => {
  it("rejects a short password", () => {
    expect(adminUpdateSchema.safeParse({ password: "123" }).success).toBe(false);
  });
  it("rejects an invalid role", () => {
    expect(adminUpdateSchema.safeParse({ role: "root" }).success).toBe(false);
  });
  it("accepts a valid partial update", () => {
    expect(adminUpdateSchema.safeParse({ is_active: false }).success).toBe(true);
  });
});

describe("managementActionSchema (bloc REG-2)", () => {
  const ID = "550e8400-e29b-41d4-a716-446655440000";
  const SEEN = "2026-10-18T09:12:13.456789+00:00";
  const REASON = "לא מצאנו את החברה ברשם החברות";
  const err = (b: unknown) => { const r = managementActionSchema.safeParse(b); return r.success ? null : r.error.issues[0].message; };
  it("the four decisions, each with what it needs", () => {
    expect(managementActionSchema.safeParse({ id: ID, action: "approve", expected_status: "pending_approval", seen_details_at: SEEN }).success).toBe(true);
    expect(managementActionSchema.safeParse({ id: ID, action: "approve", expected_status: "rejected", seen_details_at: null, note: "אומת מול הרשם" }).success).toBe(true);
    expect(managementActionSchema.safeParse({ id: ID, action: "reject", expected_status: "pending_approval", seen_details_at: SEEN, reason: REASON }).success).toBe(true);
    expect(managementActionSchema.safeParse({ id: ID, action: "suspend", expected_status: "active", reason: REASON }).success).toBe(true);
    expect(managementActionSchema.safeParse({ id: ID, action: "reactivate", expected_status: "suspended" }).success).toBe(true);
  });
  it("a reason for the company: required in reject and suspend, 10 to 1,000 characters after trimming (Hebrew)", () => {
    expect(err({ id: ID, action: "reject", expected_status: "pending_approval", seen_details_at: SEEN })).toBe("כתבו לחברה את הסיבה (10 תווים לפחות)");
    expect(err({ id: ID, action: "suspend", expected_status: "active", reason: "   קצר מדי  " })).toBe("כתבו לחברה את הסיבה (10 תווים לפחות)");
    expect(err({ id: ID, action: "suspend", expected_status: "active", reason: "א".repeat(1001) })).toBe("הסיבה ארוכה מדי (עד 1,000 תווים)");
    expect(err({ id: ID, action: "suspend", expected_status: "active", reason: "😀".repeat(5) })).toBe("כתבו לחברה את הסיבה (10 תווים לפחות)");   // characters, like SQL
    expect(managementActionSchema.safeParse({ id: ID, action: "suspend", expected_status: "active", reason: "😀".repeat(10) }).success).toBe(true);
    expect(managementActionSchema.safeParse({ id: ID, action: "suspend", expected_status: "active", reason: "😀".repeat(600) }).success).toBe(true);   // 600 characters, 1,200 UTF-16 units
    expect(err({ id: ID, action: "suspend", expected_status: "active", reason: "😀".repeat(1001) })).toBe("הסיבה ארוכה מדי (עד 1,000 תווים)");
    const ok = managementActionSchema.safeParse({ id: ID, action: "suspend", expected_status: "active", reason: `  ${REASON}  ` });
    expect(ok.success && "reason" in ok.data && ok.data.reason).toBe(REASON);
  });
  it("approve / reject say what was seen; the state seen is required; nothing extra passes", () => {
    expect(err({ id: ID, action: "approve", expected_status: "pending_approval" })).toBe("חסר המועד שבו פרטי הבקשה נבדקו. רעננו את הרשימה.");
    expect(err({ id: ID, action: "approve", expected_status: "pending_approval", seen_details_at: "18/10/2026" })).toBe("מועד לא תקין. רעננו את הרשימה.");
    expect(managementActionSchema.safeParse({ id: ID, action: "approve", seen_details_at: SEEN }).success).toBe(false);
    expect(managementActionSchema.safeParse({ id: ID, action: "approve", expected_status: "deleted", seen_details_at: SEEN }).success).toBe(false);
    expect(managementActionSchema.safeParse({ id: ID, action: "reactivate", expected_status: "suspended", reason: REASON }).success).toBe(false);
    expect(managementActionSchema.safeParse({ id: ID, action: "delete", expected_status: "active" }).success).toBe(false);
  });
});

describe("broadcastSchema (bloc UI-R5a)", () => {
  it("requires the broadcast id, title, content and how long", () => {
    expect(broadcastSchema.safeParse(SEND()).success).toBe(true);
    expect(broadcastSchema.safeParse(SEND({ title: "" })).success).toBe(false);
    expect(broadcastSchema.safeParse(SEND({ content: "   " })).success).toBe(false);
    expect(broadcastSchema.safeParse(SEND({ broadcast_id: undefined })).success).toBe(false);
    expect(broadcastSchema.safeParse(SEND({ duration: undefined })).success).toBe(false);
    expect(broadcastSchema.safeParse(SEND({ duration: undefined, expires_at: null })).success).toBe(true);
  });
  it("the same limits as bloc: title 200, content 3,000; unknown fields and the old expires_in_days are rejected", () => {
    expect(broadcastSchema.safeParse(SEND({ title: "x".repeat(201) })).success).toBe(false);
    expect(broadcastSchema.safeParse(SEND({ content: "x".repeat(3001) })).success).toBe(false);
    expect(broadcastSchema.safeParse(SEND({ expires_in_days: 0 })).success).toBe(false);
    expect(broadcastSchema.safeParse(SEND({ author_id: BID })).success).toBe(false);
    expect(broadcastSchema.safeParse(SEND({ duration: "forever" })).success).toBe(false);
  });
  it("default priority is normal", () => {
    const r = broadcastSchema.safeParse(SEND());
    expect(r.success && r.data.priority).toBe("normal");
  });
});

describe("broadcastManageSchema / broadcastDeleteSchema", () => {
  it("one target: the broadcast id or the ids, not both and not neither", () => {
    expect(broadcastManageSchema.safeParse({ action: "end", broadcast_id: BID }).success).toBe(true);
    expect(broadcastManageSchema.safeParse({ action: "end", ids: [BID] }).success).toBe(true);
    expect(broadcastManageSchema.safeParse({ action: "end" }).success).toBe(false);
    expect(broadcastManageSchema.safeParse({ action: "end", broadcast_id: BID, ids: [BID] }).success).toBe(false);
    expect(broadcastManageSchema.safeParse({ action: "end", ids: [] }).success).toBe(false);
  });
  it("end takes no fields; update takes only its own", () => {
    expect(broadcastManageSchema.safeParse({ action: "end", broadcast_id: BID, title: "x" }).success).toBe(false);
    expect(broadcastManageSchema.safeParse({ action: "update", broadcast_id: BID, title: "x", duration: "none", is_pinned: true }).success).toBe(true);
    expect(broadcastManageSchema.safeParse({ action: "update", broadcast_id: BID, is_system: false }).success).toBe(false);
    expect(broadcastManageSchema.safeParse({ action: "delete", broadcast_id: BID }).success).toBe(false);
  });
  it("delete needs confirm: true", () => {
    expect(broadcastDeleteSchema.safeParse({ broadcast_id: BID }).success).toBe(false);
    expect(broadcastDeleteSchema.safeParse({ broadcast_id: BID, confirm: true }).success).toBe(true);
  });
});

describe("buildingSuspendSchema", () => {
  it("is_active (+ an optional reason) only", () => {
    expect(buildingSuspendSchema.safeParse({ is_active: false }).success).toBe(true);
    expect(buildingSuspendSchema.safeParse({ is_active: true, reason: "שולם" }).success).toBe(true);
    expect(buildingSuspendSchema.safeParse({ is_active: "no" }).success).toBe(false);
    expect(buildingSuspendSchema.safeParse({ is_active: false, name: "x" }).success).toBe(false);
  });
  it("the edit schema still refuses is_active (suspension is its own action)", () => {
    expect(buildingUpdateSchema.safeParse({ is_active: false }).success).toBe(false);
  });
});

describe("parseBody helper", () => {
  it("returns 400 on invalid JSON", async () => {
    const req = { json: async () => { throw new Error("bad"); } };
    const r = await parseBody(req, broadcastSchema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });
  it("returns 400 with a field name on schema failure", async () => {
    const req = { json: async () => ({ title: "" }) };
    const r = await parseBody(req, broadcastSchema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });
  it("returns typed data on success", async () => {
    const req = { json: async () => SEND() };
    const r = await parseBody(req, broadcastSchema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.title).toBe("t");
  });
  it("UI-R5c-1: the schema's Hebrew message is the error — never an English field name", async () => {
    const he = await parseBody({ json: async () => ({ action: "block", user_id: "550e8400-e29b-41d4-a716-446655440001", reason: "", confirm: true }) }, memberActionSchema);
    expect(he.ok).toBe(false);
    if (!he.ok) expect((await he.response.json()).error).toBe("כתבו סיבה (3 תווים לפחות)");
    const en = await parseBody({ json: async () => ({ name: 5 }) }, buildingUpdateSchema);
    expect(en.ok).toBe(false);
    if (!en.ok) expect((await en.response.json()).error).toBe("שדה לא תקין");
  });
});
