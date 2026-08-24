import { describe, it, expect } from "vitest";
import {
  buildingUpdateSchema, tenantUpdateSchema,
  adminUpdateSchema, managementActionSchema, broadcastSchema, parseBody,
} from "../validation";

describe("buildingUpdateSchema — mass-assignment protection (P0.8)", () => {
  it("accepts only allowlisted fields", () => {
    const r = buildingUpdateSchema.safeParse({ name: "בניין א", plan: "pro" });
    expect(r.success).toBe(true);
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

describe("broadcastSchema", () => {
  it("requires title + content", () => {
    expect(broadcastSchema.safeParse({ title: "", content: "c" }).success).toBe(false);
    expect(broadcastSchema.safeParse({ title: "t" }).success).toBe(false);
    expect(broadcastSchema.safeParse({ title: "t", content: "c" }).success).toBe(true);
  });
  it("rejects negative expiry", () => {
    expect(broadcastSchema.safeParse({ title: "t", content: "c", expires_in_days: -1 }).success).toBe(false);
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
    const req = { json: async () => ({ title: "t", content: "c" }) };
    const r = await parseBody(req, broadcastSchema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.title).toBe("t");
  });
});
