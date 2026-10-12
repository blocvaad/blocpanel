import { describe, it, expect } from "vitest";
import {
  buildingUpdateSchema, tenantUpdateSchema, buildingSuspendSchema,
  adminUpdateSchema, managementActionSchema, broadcastSchema, broadcastManageSchema, broadcastDeleteSchema, parseBody,
} from "../validation";

const BID = "550e8400-e29b-41d4-a716-446655440000";
const SEND = (o: Record<string, unknown> = {}) => ({ broadcast_id: BID, title: "t", content: "c", duration: "1w", ...o });

describe("buildingUpdateSchema — mass-assignment protection (P0.8)", () => {
  it("accepts only allowlisted fields", () => {
    const r = buildingUpdateSchema.safeParse({ name: "בניין א", plan: "tower", comp_reason: "בניין בדיקות" });
    expect(r.success).toBe(true);
  });

  it("uses the real bloc plan ids — legacy panel ids are rejected", () => {
    for (const legacy of ["basic", "pro", "enterprise"]) {
      expect(buildingUpdateSchema.safeParse({ plan: legacy }).success).toBe(false);
    }
  });

  it("requires a reason for a paid plan granted without billing", () => {
    expect(buildingUpdateSchema.safeParse({ plan: "large" }).success).toBe(false);
    expect(buildingUpdateSchema.safeParse({ plan: "large", comp_reason: "פיילוט" }).success).toBe(true);
    expect(buildingUpdateSchema.safeParse({ plan: "free" }).success).toBe(true);
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

describe("tenantUpdateSchema", () => {
  it("accepts valid approval_status", () => {
    expect(tenantUpdateSchema.safeParse({ approval_status: "approved" }).success).toBe(true);
  });
  it("rejects an unknown status and unknown fields", () => {
    expect(tenantUpdateSchema.safeParse({ approval_status: "hacked" }).success).toBe(false);
    expect(tenantUpdateSchema.safeParse({ balance: -999 }).success).toBe(false);
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

describe("managementActionSchema", () => {
  it("accepts the four valid actions", () => {
    for (const action of ["approve", "reject", "suspend", "reactivate"]) {
      expect(managementActionSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000", action }).success).toBe(true);
    }
  });
  it("rejects an unknown action", () => {
    expect(managementActionSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000", action: "delete" }).success).toBe(false);
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
});
